"""
anomaly.py
Wraps isolation_forest.pkl + scaler.pkl (MinMaxScaler, 29 features)

The 29 features mirror the anomaly detection notebook's FEATURE_COLS:
  baro_altitude, velocity, true_track, vertical_rate,
  d_baro_altitude, d_velocity, dd_baro_altitude,
  d_latitude, d_longitude,
  abs_heading_change, heading_change,
  roll_mean_d_baro_altitude, roll_std_d_baro_altitude,
  roll_mean_d_velocity, roll_std_d_velocity,
  roll_mean_abs_heading_change, roll_std_abs_heading_change,
  roll_mean_vertical_rate, roll_std_vertical_rate,
  in_restricted_zone, dist_to_restricted,
  has_callsign, is_unidentified, known_aircraft, is_drone,
  is_known_airline, is_faa_registered, faa_type_known,
  identity_risk_score
"""

import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from collections import deque

MODEL_PATH  = Path(__file__).parent.parent / "models" / "isolation_forest.pkl"
SCALER_PATH = Path(__file__).parent.parent / "models" / "scaler.pkl"

FEATURE_COLS = [
    "baro_altitude", "velocity", "true_track", "vertical_rate",
    "d_baro_altitude", "d_velocity", "dd_baro_altitude",
    "d_latitude", "d_longitude",
    "abs_heading_change", "heading_change",
    "roll_mean_d_baro_altitude", "roll_std_d_baro_altitude",
    "roll_mean_d_velocity",      "roll_std_d_velocity",
    "roll_mean_abs_heading_change", "roll_std_abs_heading_change",
    "roll_mean_vertical_rate",   "roll_std_vertical_rate",
    "in_restricted_zone", "dist_to_restricted",
    "has_callsign", "is_unidentified", "known_aircraft", "is_drone",
    "is_known_airline", "is_faa_registered", "faa_type_known",
    "identity_risk_score"
]

# Restricted zones (matching your notebook)
RESTRICTED_ZONES = [
    {"id": "R-01", "lat_min": 40.0, "lat_max": 41.0, "lon_min": -75.0, "lon_max": -74.0, "name": "NYC Metro Zone"},
    {"id": "R-02", "lat_min": 34.0, "lat_max": 35.0, "lon_min": -118.5, "lon_max": -117.5, "name": "LA Restricted Corridor"},
]

# Per-object rolling history (last 5 snapshots for derivative features)
_history: dict[str, deque] = {}

_iso    = None
_scaler = None


def _load():
    global _iso, _scaler
    if _iso is None:
        _iso    = joblib.load(MODEL_PATH)
        _scaler = joblib.load(SCALER_PATH)
    return _iso, _scaler


def _in_restricted_zone(lat: float, lon: float) -> tuple[int, float]:
    """Returns (in_zone_flag, dist_to_nearest_zone_normalized)."""
    in_zone = 0
    min_dist = float('inf')
    for z in RESTRICTED_ZONES:
        if z["lat_min"] <= lat <= z["lat_max"] and z["lon_min"] <= lon <= z["lon_max"]:
            in_zone = 1
        # Euclidean distance to nearest boundary centroid
        c_lat = (z["lat_min"] + z["lat_max"]) / 2
        c_lon = (z["lon_min"] + z["lon_max"]) / 2
        d = ((lat - c_lat) ** 2 + (lon - c_lon) ** 2) ** 0.5
        min_dist = min(min_dist, d)
    proximity = max(0.0, 1.0 - (min_dist / 0.5))
    return in_zone, round(proximity, 4)


def _build_feature_vector(obj: dict, prev: dict | None, prev2: dict | None,
                          roll_buf: deque) -> np.ndarray:
    """
    Build the 29-feature vector for a single object snapshot.
    obj keys: baro_altitude, velocity, true_track, vertical_rate,
              latitude, longitude, has_callsign, is_unidentified,
              known_aircraft, is_drone, is_known_airline,
              is_faa_registered, faa_type_known
    """
    alt  = float(obj.get("baro_altitude", 0) or 0)
    vel  = float(obj.get("velocity", 0) or 0)
    trk  = float(obj.get("true_track", 0) or 0)
    vr   = float(obj.get("vertical_rate", 0) or 0)
    lat  = float(obj.get("latitude", 0) or 0)
    lon  = float(obj.get("longitude", 0) or 0)

    # Derivatives (use prev snapshot if available)
    if prev:
        d_alt = alt  - float(prev.get("baro_altitude", alt) or alt)
        d_vel = vel  - float(prev.get("velocity", vel) or vel)
        d_lat = lat  - float(prev.get("latitude", lat) or lat)
        d_lon = lon  - float(prev.get("longitude", lon) or lon)
        raw_hdg_change = trk - float(prev.get("true_track", trk) or trk)
        # normalise heading change to [-180, 180]
        hdg_change = raw_hdg_change
        if hdg_change > 180:  hdg_change -= 360
        if hdg_change < -180: hdg_change += 360
    else:
        d_alt = d_vel = d_lat = d_lon = hdg_change = 0.0

    dd_alt = 0.0
    if prev and prev2:
        d_alt_prev = float(prev.get("baro_altitude", 0) or 0) - float(prev2.get("baro_altitude", 0) or 0)
        dd_alt = d_alt - d_alt_prev

    abs_hdg = abs(hdg_change)

    # Rolling stats from buffer (last 5 snapshots)
    buf_list = list(roll_buf)
    def _roll_mean(key): return float(np.mean([b.get(key, 0) for b in buf_list])) if buf_list else 0.0
    def _roll_std(key):  return float(np.std([b.get(key, 0) for b in buf_list]))  if len(buf_list) > 1 else 0.0

    roll_buf.append({
        "d_baro_altitude": d_alt, "d_velocity": d_vel,
        "abs_heading_change": abs_hdg, "vertical_rate": vr
    })

    in_zone, dist_proximity = _in_restricted_zone(lat, lon)

    has_cs    = int(obj.get("has_callsign", 1))
    is_unid   = int(obj.get("is_unidentified", 0))
    known_ac  = int(obj.get("known_aircraft", 1))
    is_drone  = int(obj.get("is_drone", 0))
    is_ka     = int(obj.get("is_known_airline", 1))
    is_faa    = int(obj.get("is_faa_registered", 1))
    faa_known = int(obj.get("faa_type_known", 0))

    identity_risk = (
        (1 - has_cs)   * 0.3 +
        (1 - known_ac) * 0.2 +
        (1 - is_ka)    * 0.2 +
        (1 - is_faa)   * 0.2 +
        is_drone       * 0.1
    )

    vector = [
        alt, vel, trk, vr,
        d_alt, d_vel, dd_alt,
        d_lat, d_lon,
        abs_hdg, hdg_change,
        _roll_mean("d_baro_altitude"), _roll_std("d_baro_altitude"),
        _roll_mean("d_velocity"),      _roll_std("d_velocity"),
        _roll_mean("abs_heading_change"), _roll_std("abs_heading_change"),
        _roll_mean("vertical_rate"),   _roll_std("vertical_rate"),
        in_zone, dist_proximity,
        has_cs, is_unid, known_ac, is_drone,
        is_ka, is_faa, faa_known,
        round(identity_risk, 4)
    ]
    return np.array(vector, dtype=float)


def detect_anomaly(object_id: str, obj: dict) -> dict:
    """
    Run IsolationForest anomaly detection on one object.
    Maintains per-object rolling history for derivative features.
    Returns: { object_id, is_anomaly, anomaly_score, anomaly_type, details }
    """
    try:
        iso, scaler = _load()

        # Get rolling history for this object
        if object_id not in _history:
            _history[object_id] = {
                "snapshots": deque(maxlen=3),
                "roll_buf":  deque(maxlen=5)
            }
        hist = _history[object_id]
        snaps = hist["snapshots"]

        prev  = snaps[-1] if len(snaps) >= 1 else None
        prev2 = snaps[-2] if len(snaps) >= 2 else None

        vec = _build_feature_vector(obj, prev, prev2, hist["roll_buf"])
        snaps.append(obj)

        X_scaled = scaler.transform(vec.reshape(1, -1))
        pred     = iso.predict(X_scaled)[0]        # -1 = anomaly, 1 = normal
        score    = iso.decision_function(X_scaled)[0]
        # Normalise score to [0,1] — lower raw score = more anomalous
        norm_score = float(np.clip(1.0 - (score + 0.5), 0.0, 1.0))

        is_anomaly = pred == -1

        # Determine anomaly type from features
        anomaly_type = _infer_anomaly_type(obj, prev, vec)

        return {
            "object_id":    object_id,
            "is_anomaly":   bool(is_anomaly),
            "raw_score":    round(float(score), 4),
            "anomaly_score": round(norm_score, 4),
            "anomaly_type": anomaly_type if is_anomaly else "Normal",
            "in_restricted_zone": int(vec[19]),
            "status": "ok"
        }
    except Exception as e:
        return {
            "object_id":    object_id,
            "is_anomaly":   False,
            "raw_score":    0.0,
            "anomaly_score": 0.0,
            "anomaly_type": "Normal",
            "in_restricted_zone": 0,
            "status": f"error: {e}"
        }


def _infer_anomaly_type(obj: dict, prev: dict | None, vec: np.ndarray) -> str:
    """Rule-based anomaly type labelling from feature vector."""
    alt = float(obj.get("baro_altitude", 0) or 0)
    d_alt = vec[4]   # d_baro_altitude
    abs_hdg = vec[9] # abs_heading_change
    in_zone = int(vec[19])
    is_unid = int(vec[22])
    has_cs  = int(vec[21])

    if in_zone:
        return "Restricted Zone Entry"
    if abs(d_alt) > 200:
        return "Abrupt Altitude Change"
    if abs_hdg > 90:
        return "Irregular Route"
    if is_unid and not has_cs:
        return "Unidentified Object"
    if alt < 50 and float(obj.get("velocity", 0) or 0) > 50:
        return "Low Altitude High Speed"
    return "Anomalous Behaviour"


def clear_history(object_id: str):
    """Remove history for an object that is no longer active."""
    _history.pop(object_id, None)
