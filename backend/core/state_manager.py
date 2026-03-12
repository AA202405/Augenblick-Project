"""
state_manager.py
Central in-memory state for all active airspace objects.
Runs the full pipeline per tick:
  data_feed → classifier → anomaly → trajectory → risk_engine → state
"""

import asyncio
from datetime import datetime
from typing import Optional
from core.data_feed     import get_current_objects
from core.classifier    import classify_object
from core.anomaly       import detect_anomaly, clear_history
from core.trajectory    import update_buffer, get_trajectory, check_intercept, clear_buffer
from core.risk_engine   import compute_risk

# ── Global state ─────────────────────────────────────────────────────────────
_active_objects: dict[str, dict] = {}   # object_id → full enriched state
_anomaly_log:    list[dict]      = []   # last 50 anomalies
_last_updated:   Optional[str]   = None

MAX_ANOMALY_LOG = 50
MAX_OBJECTS     = 50   # cap for memory safety


async def tick() -> dict:
    """
    Run one full pipeline tick.
    Returns summary dict for the auto-loop.
    """
    global _active_objects, _anomaly_log, _last_updated

    raw_objects = await get_current_objects()
    new_state   = {}

    # Track object IDs this tick to clean up stale ones
    seen_ids = set()

    for obj in raw_objects[:MAX_OBJECTS]:
        obj_id = obj.get("icao24", f"OBJ-{id(obj)}")
        if not obj_id:
            continue
        seen_ids.add(obj_id)

        lat  = obj.get("latitude",      0.0)
        lon  = obj.get("longitude",     0.0)
        alt  = obj.get("baro_altitude", 0.0)
        vel  = obj.get("velocity",      0.0)
        hdg  = obj.get("true_track",    0.0)
        vr   = obj.get("vertical_rate", 0.0)
        cs   = obj.get("callsign",      "")

        # ── 1. Classification ────────────────────────────────────────────────
        cls_result = classify_object(
            object_id    = obj_id,
            speed        = vel,
            altitude     = alt,
            vertical_rate= vr,
            heading      = hdg,
            lat          = lat,
            lon          = lon,
            transponder  = bool(obj.get("has_callsign", 1))
        )
        obj_class   = cls_result.get("label",      "unknown")
        cls_conf    = cls_result.get("confidence", 0.0)

        # ── 2. Anomaly Detection ─────────────────────────────────────────────
        anom_input = {
            "baro_altitude":  alt,
            "velocity":       vel,
            "true_track":     hdg,
            "vertical_rate":  vr,
            "latitude":       lat,
            "longitude":      lon,
            "has_callsign":   obj.get("has_callsign",      1),
            "is_unidentified":obj.get("is_unidentified",   0),
            "known_aircraft": obj.get("known_aircraft",    1),
            "is_drone":       obj.get("is_drone",          0),
            "is_known_airline":  obj.get("is_known_airline",   1),
            "is_faa_registered": obj.get("is_faa_registered",  1),
            "faa_type_known":    obj.get("faa_type_known",     0),
        }
        anom_result  = detect_anomaly(obj_id, anom_input)
        is_anomaly   = anom_result.get("is_anomaly",    False)
        anom_score   = anom_result.get("anomaly_score", 0.0)
        anom_type    = anom_result.get("anomaly_type",  "Normal")
        in_zone      = anom_result.get("in_restricted_zone", 0)

        # ── 3. Trajectory Update + Intercept ────────────────────────────────
        update_buffer(obj_id, lat, lon, alt, vel, hdg)
        traj_result  = get_trajectory(obj_id, steps=5)

        # Check intercept with all other active objects (light check)
        intercept_prob = 0.0
        for other_id in list(_active_objects.keys())[:10]:
            if other_id != obj_id:
                p = check_intercept(obj_id, other_id)
                intercept_prob = max(intercept_prob, p)

        # ── 4. Risk Scoring ──────────────────────────────────────────────────
        risk_result = compute_risk(
            object_id                 = obj_id,
            lat                       = lat,
            lon                       = lon,
            velocity                  = vel,
            object_class              = obj_class,
            anomaly_score             = anom_score,
            anomaly_type              = anom_type,
            no_transponder            = 1 - int(obj.get("has_callsign", 1)),
            trajectory_intercept_prob = intercept_prob,
            in_restricted_zone        = in_zone,
        )
        risk_score = risk_result.get("risk_score", 0)
        risk_level = risk_result.get("risk_level", "LOW")

        # ── 5. Assemble object state ─────────────────────────────────────────
        state = {
            "object_id":       obj_id,
            "callsign":        cs,
            "object_class":    obj_class,
            "class_confidence":cls_conf,
            "lat":             lat,
            "lon":             lon,
            "altitude":        alt,
            "velocity":        vel,
            "heading":         hdg,
            "vertical_rate":   vr,
            "has_callsign":    bool(obj.get("has_callsign", 1)),
            "source":          obj.get("source", "real"),
            # Anomaly
            "is_anomaly":      is_anomaly,
            "anomaly_score":   anom_score,
            "anomaly_type":    anom_type,
            "in_restricted_zone": bool(in_zone),
            # Trajectory
            "trajectory":      traj_result.get("trajectory", []),
            "trajectory_status": traj_result.get("status", "insufficient_data"),
            # Risk
            "risk_score":      risk_score,
            "risk_level":      risk_level,
            "risk_components": risk_result.get("components", {}),
            "triggered_rule":  risk_result.get("triggered_rule"),
            # Meta
            "last_seen":       datetime.utcnow().isoformat(),
        }
        new_state[obj_id] = state

        # ── 6. Log anomaly if detected ───────────────────────────────────────
        if is_anomaly or risk_level in ("HIGH", "CRITICAL"):
            log_entry = {
                "object_id":   obj_id,
                "callsign":    cs or obj_id,
                "object_class":obj_class,
                "anomaly_type":anom_type,
                "risk_level":  risk_level,
                "risk_score":  risk_score,
                "lat": lat, "lon": lon, "altitude": alt,
                "triggered_rule": risk_result.get("triggered_rule"),
                "timestamp":   datetime.utcnow().isoformat(),
            }
            # Avoid duplicate logging for the same object in same level
            if not any(e["object_id"] == obj_id and
                       e["risk_level"] == risk_level
                       for e in _anomaly_log[-5:]):
                _anomaly_log.append(log_entry)
                if len(_anomaly_log) > MAX_ANOMALY_LOG:
                    _anomaly_log = _anomaly_log[-MAX_ANOMALY_LOG:]

    # Clean up stale objects
    stale = set(_active_objects.keys()) - seen_ids
    for sid in stale:
        clear_history(sid)
        clear_buffer(sid)

    _active_objects = new_state
    _last_updated   = datetime.utcnow().isoformat()

    # ── Return tick summary ──────────────────────────────────────────────────
    critical = [o for o in new_state.values() if o["risk_level"] == "CRITICAL"]
    high     = [o for o in new_state.values() if o["risk_level"] == "HIGH"]
    anomalies= [o for o in new_state.values() if o["is_anomaly"]]

    return {
        "total_objects":   len(new_state),
        "critical_count":  len(critical),
        "high_count":      len(high),
        "anomaly_count":   len(anomalies),
        "last_updated":    _last_updated,
    }


# ── Accessor functions (used by agent tools) ─────────────────────────────────

def get_active_objects() -> dict:
    """Returns all active object states keyed by object_id."""
    return dict(_active_objects)


def get_object_by_id(object_id: str) -> Optional[dict]:
    return _active_objects.get(object_id)


def get_anomalies() -> list[dict]:
    """Returns currently anomalous or high-risk objects."""
    return [
        o for o in _active_objects.values()
        if o["is_anomaly"] or o["risk_level"] in ("HIGH", "CRITICAL")
    ]


def get_risk_scores() -> list[dict]:
    """Returns risk score summary for all active objects."""
    return [
        {
            "object_id":   o["object_id"],
            "callsign":    o["callsign"],
            "object_class":o["object_class"],
            "risk_score":  o["risk_score"],
            "risk_level":  o["risk_level"],
            "triggered_rule": o["triggered_rule"],
        }
        for o in sorted(_active_objects.values(),
                        key=lambda x: x["risk_score"], reverse=True)
    ]


def get_anomaly_log() -> list[dict]:
    """Returns the historical anomaly log."""
    return list(_anomaly_log)


def get_restricted_zones() -> list[dict]:
    """Returns static restricted zone definitions."""
    return [
        {"id": "R-01", "name": "NYC Metro Zone",
         "bounds": {"lat": [40.0, 41.0], "lon": [-75.0, -74.0]},
         "severity": "CRITICAL"},
        {"id": "R-02", "name": "LA Restricted Corridor",
         "bounds": {"lat": [34.0, 35.0], "lon": [-118.5, -117.5]},
         "severity": "CRITICAL"},
    ]
