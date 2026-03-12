"""
data_feed.py
Manages the live airspace data feed:
  1. Loads from opensky_raw.csv (replays real data in a loop)
  2. Optionally fetches live from OpenSky API
  3. Enriches with airline/FAA identity data
  4. Injects simulated anomalies on top of real data
  5. Maintains the live state dict used by all agent tools
"""

import os
import time
import random
import asyncio
import httpx
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

DATA_DIR    = Path(__file__).parent.parent / "data"
USE_LIVE    = os.getenv("USE_LIVE_OPENSKY", "false").lower() == "true"
INJECT_ANOM = os.getenv("INJECT_SIMULATED_ANOMALIES", "true").lower() == "true"
OPENSKY_URL = os.getenv("OPENSKY_API_URL", "https://opensky-network.org/api/states/all")

# ── Load reference data ───────────────────────────────────────────────────────
def _load_reference_data():
    airline_icao_set  = set()
    faa_tail_set      = set()
    aircraft_db_dict  = {}   # icao24 → {"known": True, "is_drone": bool, "type": str}

    try:
        al = pd.read_csv(DATA_DIR / "Airline_codes_wiki.csv")
        airline_icao_set = set(
            al["ICAO"].dropna().astype(str).str.strip().str.upper()
        )
        print(f"[data_feed] Loaded {len(airline_icao_set)} airline ICAO codes")
    except Exception as e:
        print(f"[data_feed] Airline codes not loaded: {e}")

    try:
        faa = pd.read_csv(DATA_DIR / "faa_aircraft.csv")
        tail_col = next((c for c in faa.columns
                         if "tail" in c.lower() or "number" in c.lower()), None)
        if tail_col:
            faa_tail_set = set(
                faa[tail_col].dropna().astype(str).str.strip().str.upper()
            )
        print(f"[data_feed] Loaded {len(faa_tail_set)} FAA tail numbers")
    except Exception as e:
        print(f"[data_feed] FAA data not loaded: {e}")

    try:
        ac_path = DATA_DIR / "aircraft-database-complete-2022-11-clean.csv"
        ac = pd.read_csv(ac_path, low_memory=False)
        ac.columns = ac.columns.str.strip().str.lower()

        # Find icao24 column
        icao_col = next((c for c in ac.columns
                         if "icao" in c.lower()), None)

        if icao_col:
            ac = ac.rename(columns={icao_col: "icao24"})
            ac["icao24"] = ac["icao24"].astype(str).str.strip().str.lower()
            ac = ac.drop_duplicates("icao24")

            # Detect drone-related column
            drone_col = next((c for c in ac.columns
                              if "category" in c or "typecode" in c
                              or "description" in c), None)

            for _, row in ac.iterrows():
                icao = row["icao24"]
                if not icao or icao == "nan":
                    continue
                is_drone = 0
                if drone_col:
                    val = str(row.get(drone_col, "")).lower()
                    if any(k in val for k in ["drone", "uav", "unmanned"]):
                        is_drone = 1
                aircraft_db_dict[icao] = {
                    "known":    True,
                    "is_drone": is_drone,
                }
            print(f"[data_feed] Loaded {len(aircraft_db_dict)} aircraft from database")
        else:
            print("[data_feed] Aircraft DB: no icao24 column found — skipping")

    except FileNotFoundError:
        print("[data_feed] aircraft-database-complete-2022-11-clean.csv not found in data/ — skipping")
    except Exception as e:
        print(f"[data_feed] Aircraft DB not loaded: {e}")

    return airline_icao_set, faa_tail_set, aircraft_db_dict


AIRLINE_ICAO_SET, FAA_TAIL_SET, AIRCRAFT_DB = _load_reference_data()

# ── Load and replay opensky_raw.csv ──────────────────────────────────────────
_raw_df: Optional[pd.DataFrame] = None
_replay_idx: int = 0
_BATCH_SIZE = 200  # objects per tick


def _load_raw_csv() -> pd.DataFrame:
    global _raw_df
    if _raw_df is None:
        df = pd.read_csv(DATA_DIR / "opensky_raw.csv")

        # Load and merge d1-d5 files
        extra_dfs = []
        for i in range(1, 6):
            try:
                ex = pd.read_csv(DATA_DIR / f"d{i}.csv")
                ex = ex.rename(columns={
                    "lat":         "latitude",
                    "lon":         "longitude",
                    "heading":     "true_track",
                    "vertrate":    "vertical_rate",
                    "baroaltitude":"baro_altitude",
                    "geoaltitude": "geo_altitude",
                    "onground":    "on_ground",
                })
                extra_dfs.append(ex)
                print(f"[data_feed] Loaded {len(ex)} rows from d{i}.csv")
            except Exception as e:
                print(f"[data_feed] Could not load d{i}.csv: {e}")

        if extra_dfs:
            df = pd.concat([df] + extra_dfs, ignore_index=True)

        df = df[df["on_ground"] == False].copy()
        df = df.dropna(subset=["latitude", "longitude", "baro_altitude", "velocity"])
        df["velocity"]      = pd.to_numeric(df["velocity"],      errors="coerce").fillna(0)
        df["true_track"]    = pd.to_numeric(df["true_track"],    errors="coerce").fillna(0)
        df["vertical_rate"] = pd.to_numeric(df["vertical_rate"], errors="coerce").fillna(0)
        df["baro_altitude"] = pd.to_numeric(df["baro_altitude"], errors="coerce").fillna(0)
        _raw_df = df.reset_index(drop=True)
        print(f"[data_feed] Total replay rows: {len(_raw_df)}")
    return _raw_df


def _enrich_object(row: pd.Series) -> dict:
    """Enrich a raw OpenSky row with identity flags."""
    callsign = str(row.get("callsign", "")).strip()
    icao24   = str(row.get("icao24",   "")).strip()
    prefix   = callsign[:3].upper() if len(callsign) >= 3 else ""

    has_callsign      = 1 if callsign else 0
    is_unidentified   = 1 if (icao24 == "000000" or not callsign) else 0
    is_known_airline  = 1 if prefix in AIRLINE_ICAO_SET else 0
    is_faa_registered = 1 if callsign.upper() in FAA_TAIL_SET else 0

    # Look up in aircraft database (icao24 stored lowercase)
    ac_entry       = AIRCRAFT_DB.get(icao24.lower(), None)
    known_aircraft = 1 if ac_entry is not None else 0
    is_drone       = int(ac_entry["is_drone"]) if ac_entry else 0
    faa_type_known = 0

    return {
        "icao24":          icao24,
        "callsign":        callsign,
        "latitude":        float(row["latitude"]),
        "longitude":       float(row["longitude"]),
        "baro_altitude":   float(row["baro_altitude"]),
        "velocity":        float(row["velocity"]),
        "true_track":      float(row["true_track"]),
        "vertical_rate":   float(row["vertical_rate"]),
        "geo_altitude":    float(row.get("geo_altitude", row["baro_altitude"]) or row["baro_altitude"]),
        "has_callsign":    has_callsign,
        "is_unidentified": is_unidentified,
        "known_aircraft":  known_aircraft,
        "is_drone":        is_drone,
        "is_known_airline":   is_known_airline,
        "is_faa_registered":  is_faa_registered,
        "faa_type_known":     faa_type_known,
        "source":          "real",
        "timestamp":       datetime.utcnow().isoformat(),
    }


def _get_next_real_batch() -> list[dict]:
    """Return next BATCH_SIZE rows from the CSV replay loop."""
    global _replay_idx
    df = _load_raw_csv()
    end = _replay_idx + _BATCH_SIZE
    if end > len(df):
        _replay_idx = 0
        end = _BATCH_SIZE

    batch = df.iloc[_replay_idx:end]
    _replay_idx = end
    return [_enrich_object(row) for _, row in batch.iterrows()]


# ── Simulated anomaly injection ───────────────────────────────────────────────
_SIM_OBJECTS = {}   # persistent simulated objects


def _inject_simulated_anomalies() -> list[dict]:
    """
    Generate a small set of simulated anomalous objects:
    - 1 drone near restricted zone
    - 1 unknown object, no transponder
    - 1 erratic aircraft
    """
    t = datetime.utcnow().isoformat()
    sims = []

    # Drone approaching NYC restricted zone
    sims.append({
        "icao24":          "SIM-DRONE-01",
        "callsign":        "",
        "latitude":        40.2 + random.uniform(-0.05, 0.05),
        "longitude":       -74.5 + random.uniform(-0.05, 0.05),
        "baro_altitude":   random.uniform(50, 150),
        "velocity":        random.uniform(8, 25),
        "true_track":      random.uniform(0, 360),
        "vertical_rate":   random.uniform(-3, 3),
        "geo_altitude":    random.uniform(50, 150),
        "has_callsign":    0,
        "is_unidentified": 1,
        "known_aircraft":  0,
        "is_drone":        1,
        "is_known_airline":   0,
        "is_faa_registered":  0,
        "faa_type_known":     0,
        "source":          "simulated",
        "timestamp":       t,
    })

    # Unknown object, no transponder
    sims.append({
        "icao24":          "SIM-UNK-02",
        "callsign":        "",
        "latitude":        34.4 + random.uniform(-0.1, 0.1),
        "longitude":       -118.1 + random.uniform(-0.1, 0.1),
        "baro_altitude":   random.uniform(200, 800),
        "velocity":        random.uniform(60, 150),
        "true_track":      random.uniform(0, 360),
        "vertical_rate":   random.uniform(-10, 10),
        "geo_altitude":    random.uniform(200, 800),
        "has_callsign":    0,
        "is_unidentified": 1,
        "known_aircraft":  0,
        "is_drone":        0,
        "is_known_airline":   0,
        "is_faa_registered":  0,
        "faa_type_known":     0,
        "source":          "simulated",
        "timestamp":       t,
    })

    # Erratic aircraft — abrupt altitude change
    sims.append({
        "icao24":          "SIM-ERRATIC-03",
        "callsign":        "SIM303",
        "latitude":        38.5 + random.uniform(-0.2, 0.2),
        "longitude":       -90.0 + random.uniform(-0.2, 0.2),
        "baro_altitude":   random.uniform(1000, 8000),
        "velocity":        random.uniform(200, 450),
        "true_track":      (random.uniform(0, 360) + random.choice([-120, 120])) % 360,
        "vertical_rate":   random.choice([-400, -350, 350, 400]),  # abrupt
        "geo_altitude":    random.uniform(1000, 8000),
        "has_callsign":    1,
        "is_unidentified": 0,
        "known_aircraft":  1,
        "is_drone":        0,
        "is_known_airline":   0,
        "is_faa_registered":  1,
        "faa_type_known":     1,
        "source":          "simulated",
        "timestamp":       t,
    })

    return sims


# ── Live fetch from OpenSky API ───────────────────────────────────────────────
async def _fetch_live_opensky() -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(OPENSKY_URL)
            if resp.status_code != 200:
                return []
            states = resp.json().get("states", [])
            results = []
            for s in states[:_BATCH_SIZE]:
                try:
                    callsign = str(s[1]).strip() if s[1] else ""
                    lon, lat = s[5], s[6]
                    altitude = s[13] if s[13] is not None else s[7]
                    speed, heading, vr = s[9], s[10], s[11]
                    if None in [lat, lon, altitude, speed] or s[8]:
                        continue
                    row = pd.Series({
                        "icao24": s[0], "callsign": callsign,
                        "latitude": lat, "longitude": lon,
                        "baro_altitude": altitude, "velocity": speed,
                        "true_track": heading or 0,
                        "vertical_rate": vr or 0,
                        "geo_altitude": altitude,
                    })
                    results.append(_enrich_object(row))
                except Exception:
                    continue
            return results
    except Exception:
        return []


# ── Main fetch function ───────────────────────────────────────────────────────
async def get_current_objects() -> list[dict]:
    """
    Returns the current batch of airspace objects.
    Real data + simulated anomalies (if enabled).
    """
    if USE_LIVE:
        real_objects = await _fetch_live_opensky()
        if not real_objects:
            real_objects = _get_next_real_batch()  # fallback to CSV
    else:
        real_objects = _get_next_real_batch()

    if INJECT_ANOM:
        sim_objects = _inject_simulated_anomalies()
        return real_objects + sim_objects

    return real_objects