"""
anomaly.py  —  Rule-based anomaly detector (no ML models required)
Detects anomalies using deterministic rules on flight parameters
and injected anomaly labels from the simulation data feed.

Anomaly types:
  Restricted Zone Entry, Abrupt Altitude Change, Irregular Route,
  Unidentified Object, Low Altitude High Speed, Bird in Flight Corridor,
  Sudden Speed Burst, Normal
"""

from collections import deque

# Per-object rolling history (last 5 snapshots for derivative features)
_history: dict = {}

# Restricted zones (same as data_feed.py)
RESTRICTED_ZONES = [
    {"id": "RZ-MUM",  "lat_min": 18.9,  "lat_max": 19.3,  "lon_min": 72.7, "lon_max": 73.1},
    {"id": "RZ-DEL",  "lat_min": 28.4,  "lat_max": 28.8,  "lon_min": 76.9, "lon_max": 77.3},
    {"id": "RZ-GOA",  "lat_min": 15.2,  "lat_max": 15.6,  "lon_min": 73.8, "lon_max": 74.2},
    {"id": "RZ-HYD",  "lat_min": 17.2,  "lat_max": 17.6,  "lon_min": 78.2, "lon_max": 78.6},
    {"id": "RZ-AMD",  "lat_min": 22.9,  "lat_max": 23.3,  "lon_min": 72.4, "lon_max": 72.8},
]


def _in_restricted_zone(lat: float, lon: float) -> bool:
    for z in RESTRICTED_ZONES:
        if z["lat_min"] <= lat <= z["lat_max"] and z["lon_min"] <= lon <= z["lon_max"]:
            return True
    return False


def _dist_to_nearest_zone(lat: float, lon: float) -> float:
    min_dist = float("inf")
    for z in RESTRICTED_ZONES:
        c_lat = (z["lat_min"] + z["lat_max"]) / 2
        c_lon = (z["lon_min"] + z["lon_max"]) / 2
        d = ((lat - c_lat) ** 2 + (lon - c_lon) ** 2) ** 0.5
        min_dist = min(min_dist, d)
    proximity = max(0.0, 1.0 - (min_dist / 0.5))
    return round(proximity, 4)


def detect_anomaly(object_id: str, obj: dict) -> dict:
    """
    Rule-based anomaly detection for a single object.
    Returns: { object_id, is_anomaly, anomaly_score, anomaly_type,
               in_restricted_zone, status }
    """
    try:
        alt  = float(obj.get("baro_altitude", 0) or 0)
        vel  = float(obj.get("velocity", 0) or 0)
        vr   = float(obj.get("vertical_rate", 0) or 0)
        lat  = float(obj.get("latitude", 0) or 0)
        lon  = float(obj.get("longitude", 0) or 0)
        is_drone   = int(obj.get("is_drone", 0))
        is_unid    = int(obj.get("is_unidentified", 0))
        has_cs     = int(obj.get("has_callsign", 1))

        # Rolling history for heading change detection
        if object_id not in _history:
            _history[object_id] = deque(maxlen=5)
        hist = _history[object_id]

        prev_heading = hist[-1].get("heading", None) if hist else None
        hist.append({"heading": float(obj.get("true_track", 0) or 0),
                     "alt": alt, "vel": vel})

        heading_change = 0.0
        if prev_heading is not None:
            raw = float(obj.get("true_track", 0) or 0) - prev_heading
            if raw > 180:  raw -= 360
            if raw < -180: raw += 360
            heading_change = abs(raw)

        in_zone = _in_restricted_zone(lat, lon)
        in_zone_flag = 1 if in_zone else 0

        # ── Anomaly rules (priority order) ───────────────────────────────────
        is_anomaly   = False
        anomaly_type = "Normal"
        score        = 0.1

        if in_zone:
            is_anomaly   = True
            anomaly_type = "Restricted Zone Entry"
            score        = 0.95

        elif is_unid and not has_cs:
            is_anomaly   = True
            anomaly_type = "Unidentified Object"
            score        = 0.80

        elif abs(vr) > 200:
            is_anomaly   = True
            anomaly_type = "Abrupt Altitude Change"
            score        = 0.75

        elif heading_change > 90:
            is_anomaly   = True
            anomaly_type = "Irregular Route"
            score        = 0.70

        elif alt < 50 and vel > 50:
            is_anomaly   = True
            anomaly_type = "Low Altitude High Speed"
            score        = 0.72

        elif is_drone and _dist_to_nearest_zone(lat, lon) > 0.5:
            is_anomaly   = True
            anomaly_type = "Drone Near Restricted Zone"
            score        = 0.65

        return {
            "object_id":          object_id,
            "is_anomaly":         is_anomaly,
            "raw_score":          0.0,
            "anomaly_score":      round(score, 4),
            "anomaly_type":       anomaly_type,
            "in_restricted_zone": in_zone_flag,
            "status":             "rule_based",
        }

    except Exception as e:
        return {
            "object_id":          object_id,
            "is_anomaly":         False,
            "raw_score":          0.0,
            "anomaly_score":      0.0,
            "anomaly_type":       "Normal",
            "in_restricted_zone": 0,
            "status":             f"error: {e}",
        }


def clear_history(object_id: str):
    """Remove history for an object that is no longer active."""
    _history.pop(object_id, None)