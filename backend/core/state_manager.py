"""
state_manager.py
Central in-memory state for all active airspace objects.
Runs the full pipeline per tick:
  data_feed → classifier → anomaly → trajectory → risk_engine → state
"""

import asyncio
from datetime import datetime
from typing import Optional
from core.data_feed      import get_current_objects, get_restricted_zones as _get_zones
from core.classifier     import classify_object
from core.anomaly        import detect_anomaly, clear_history
from core.trajectory     import update_buffer, get_trajectory, check_intercept, clear_buffer
from core.risk_engine    import compute_risk

_active_objects: dict = {}
_anomaly_log:    list = []
_last_updated:   Optional[str] = None

MAX_ANOMALY_LOG = 100
MAX_OBJECTS     = 120


async def tick() -> dict:
    global _active_objects, _anomaly_log, _last_updated

    raw_objects = await get_current_objects()
    new_state   = {}
    seen_ids    = set()

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
        obj_class = cls_result.get("label",      "unknown")
        cls_conf  = cls_result.get("confidence", 0.0)

        # ── 2. Anomaly Detection ─────────────────────────────────────────────
        # If object has a baked-in injected anomaly, use it as a hint
        injected_anom = obj.get("anomaly_label") or obj.get("injected_anomaly")
        in_zone       = int(obj.get("in_restricted_zone", False))
        zone_name     = obj.get("restricted_zone_name", "") or obj.get("zone_name", "")

        anom_input = {
            "baro_altitude":     alt,
            "velocity":          vel,
            "true_track":        hdg,
            "vertical_rate":     vr,
            "latitude":          lat,
            "longitude":         lon,
            "has_callsign":      obj.get("has_callsign",      1),
            "is_unidentified":   obj.get("is_unidentified",   0),
            "known_aircraft":    obj.get("known_aircraft",    1),
            "is_drone":          obj.get("is_drone",          0),
            "is_known_airline":  obj.get("is_known_airline",  1),
            "is_faa_registered": obj.get("is_faa_registered", 1),
            "faa_type_known":    obj.get("faa_type_known",    0),
        }
        anom_result = detect_anomaly(obj_id, anom_input)
        is_anomaly  = anom_result.get("is_anomaly",    False)
        anom_score  = anom_result.get("anomaly_score", 0.0)
        anom_type   = anom_result.get("anomaly_type",  "Normal")

        # Override anomaly type with injected if present
        if injected_anom and injected_anom != "Normal":
            is_anomaly = True
            anom_type  = injected_anom
            anom_score = max(anom_score, 0.65)

        # Force zone detection
        if in_zone:
            is_anomaly = True
            anom_type  = "Restricted_Zone_Entry"
            anom_score = max(anom_score, 0.9)

        # ── 3. Trajectory ────────────────────────────────────────────────────
        update_buffer(obj_id, lat, lon, alt, vel, hdg)
        traj_result = get_trajectory(obj_id, steps=5)

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

        # ── 5. Assemble state ────────────────────────────────────────────────
        state = {
            "object_id":       obj_id,
            "callsign":        cs,
            "object_type":     obj.get("object_type",   "unknown"),
            "object_class":    obj_class,
            "class_confidence":cls_conf,
            "state_region":    obj.get("state_region",  "Unknown"),
            "lat":             lat,
            "lon":             lon,
            "altitude":        alt,
            "velocity":        vel,
            "heading":         hdg,
            "vertical_rate":   vr,
            "has_callsign":    bool(obj.get("has_callsign", 1)),
            "source":          obj.get("source", "static_simulation"),
            # Anomaly
            "is_anomaly":      is_anomaly,
            "anomaly_score":   anom_score,
            "anomaly_type":    anom_type,
            "injected_anomaly":injected_anom,
            "in_restricted_zone":  bool(in_zone),
            "restricted_zone_name":zone_name,
            # Trajectory — use simulation paths (rich) + ML prediction
            "historical_path": obj.get("history",           obj.get("historical_path", [])),
            "predicted_path":  obj.get("future_trajectory", obj.get("predicted_path",  [])),
            "trajectory":      traj_result.get("trajectory", []),
            "trajectory_status": traj_result.get("status", "insufficient_data"),
            # Waypoints for map rendering
            "waypoints":       obj.get("waypoints", []),
            "route_progress":  obj.get("route_progress", 0),
            # Risk
            "risk_score":      risk_score,
            "risk_level":      risk_level,
            "risk_components": risk_result.get("components", {}),
            "triggered_rule":  risk_result.get("triggered_rule"),
            # Meta
            "tick":            obj.get("tick", 0),
            "last_seen":       datetime.utcnow().isoformat(),
        }
        new_state[obj_id] = state

        # ── 6. Log anomaly ────────────────────────────────────────────────────
        if is_anomaly or risk_level in ("HIGH", "CRITICAL"):
            log_entry = {
                "object_id":    obj_id,
                "callsign":     cs or obj_id,
                "object_type":  obj.get("object_type", "unknown"),
                "object_class": obj_class,
                "anomaly_type": anom_type,
                "risk_level":   risk_level,
                "risk_score":   risk_score,
                "state_region": obj.get("state_region", ""),
                "lat": lat, "lon": lon, "altitude": alt,
                "triggered_rule": risk_result.get("triggered_rule"),
                "timestamp":    datetime.utcnow().isoformat(),
            }
            if not any(e["object_id"] == obj_id and e["risk_level"] == risk_level
                       for e in _anomaly_log[-5:]):
                _anomaly_log.append(log_entry)
                if len(_anomaly_log) > MAX_ANOMALY_LOG:
                    _anomaly_log = _anomaly_log[-MAX_ANOMALY_LOG:]

    # Clean up stale
    stale = set(_active_objects.keys()) - seen_ids
    for sid in stale:
        clear_history(sid)
        clear_buffer(sid)

    _active_objects = new_state
    _last_updated   = datetime.utcnow().isoformat()

    critical = [o for o in new_state.values() if o["risk_level"] == "CRITICAL"]
    high     = [o for o in new_state.values() if o["risk_level"] == "HIGH"]
    anomalies= [o for o in new_state.values() if o["is_anomaly"]]

    return {
        "total_objects":  len(new_state),
        "critical_count": len(critical),
        "high_count":     len(high),
        "anomaly_count":  len(anomalies),
        "last_updated":   _last_updated,
    }


# ── Accessors ─────────────────────────────────────────────────────────────────

def get_active_objects() -> dict:
    return dict(_active_objects)

def get_object_by_id(object_id: str) -> Optional[dict]:
    return _active_objects.get(object_id)

def get_anomalies() -> list:
    return [o for o in _active_objects.values()
            if o["is_anomaly"] or o["risk_level"] in ("HIGH", "CRITICAL")]

def get_risk_scores() -> list:
    return [
        {
            "object_id":    o["object_id"],
            "callsign":     o["callsign"],
            "object_type":  o["object_type"],
            "object_class": o["object_class"],
            "state_region": o["state_region"],
            "risk_score":   o["risk_score"],
            "risk_level":   o["risk_level"],
            "triggered_rule": o["triggered_rule"],
        }
        for o in sorted(_active_objects.values(),
                        key=lambda x: x["risk_score"], reverse=True)
    ]

def get_anomaly_log() -> list:
    return list(_anomaly_log)

def get_restricted_zones() -> list:
    return _get_zones()
