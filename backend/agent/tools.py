"""
tools.py
All 6 LangChain tools for the Airspace Monitoring Agent.
Each tool wraps a core module function.
"""

import json
from langchain.tools import tool
import core.state_manager as sm
from core.trajectory import get_trajectory as _get_traj
from core.classifier import classify_object as _classify


# ── Tool 1: get_active_objects ────────────────────────────────────────────────
@tool
def get_active_objects(dummy: str = "") -> str:
    """
    Fetch all currently active aerial objects in the monitored airspace.
    Returns a JSON list with object_id, callsign, class, position,
    altitude, velocity, heading, risk_level, and anomaly status.
    Use this to get a full picture of what is currently in the airspace.
    """
    objects = sm.get_active_objects()
    if not objects:
        return json.dumps({"status": "no_objects", "objects": []})

    summary = []
    for obj in objects.values():
        summary.append({
            "object_id":    obj["object_id"],
            "callsign":     obj["callsign"] or "N/A",
            "object_class": obj["object_class"],
            "lat":          obj["lat"],
            "lon":          obj["lon"],
            "altitude_ft":  round(obj["altitude"] * 3.281, 0),
            "velocity_kmh": round(obj["velocity"] * 3.6, 1),
            "heading":      obj["heading"],
            "risk_level":   obj["risk_level"],
            "risk_score":   obj["risk_score"],
            "is_anomaly":   obj["is_anomaly"],
            "anomaly_type": obj["anomaly_type"],
            "source":       obj["source"],
        })

    return json.dumps({
        "total":   len(summary),
        "objects": summary
    }, indent=2)


# ── Tool 2: get_risk_scores ───────────────────────────────────────────────────
@tool
def get_risk_scores(dummy: str = "") -> str:
    """
    Get current risk scores for all active aerial objects, sorted by
    highest risk first. Returns risk_score (0-100), risk_level
    (LOW/MEDIUM/HIGH/CRITICAL), and any triggered hard override rules.
    Use this to identify the most dangerous objects in the airspace.
    """
    scores = sm.get_risk_scores()
    if not scores:
        return json.dumps({"status": "no_data", "scores": []})

    return json.dumps({
        "count":  len(scores),
        "scores": scores
    }, indent=2)


# ── Tool 3: get_anomalies ─────────────────────────────────────────────────────
@tool
def get_anomalies(dummy: str = "") -> str:
    """
    Get all currently anomalous or high-risk aerial objects.
    Returns objects that are either flagged as anomalous by the
    IsolationForest model or are rated HIGH/CRITICAL risk.
    Includes anomaly type (e.g. Restricted Zone Entry, Abrupt Altitude Change,
    Irregular Route, Unidentified Object) and risk breakdown.
    Use this to identify active threats or suspicious activity.
    """
    anomalies = sm.get_anomalies()
    if not anomalies:
        return json.dumps({"status": "no_anomalies", "anomalies": []})

    result = []
    for obj in anomalies:
        result.append({
            "object_id":      obj["object_id"],
            "callsign":       obj["callsign"] or "N/A",
            "object_class":   obj["object_class"],
            "anomaly_type":   obj["anomaly_type"],
            "risk_level":     obj["risk_level"],
            "risk_score":     obj["risk_score"],
            "triggered_rule": obj.get("triggered_rule"),
            "in_restricted_zone": obj["in_restricted_zone"],
            "lat":  obj["lat"],
            "lon":  obj["lon"],
            "altitude_ft": round(obj["altitude"] * 3.281, 0),
            "velocity_kmh": round(obj["velocity"] * 3.6, 1),
            "source": obj["source"],
        })

    return json.dumps({
        "anomaly_count": len(result),
        "anomalies": result
    }, indent=2)


# ── Tool 4: classify_object ───────────────────────────────────────────────────
@tool
def classify_object_tool(object_id: str) -> str:
    """
    Classify a specific aerial object by its ID using the RandomForest
    classifier. Returns predicted class (aircraft/drone/bird/unknown),
    confidence percentage, and probability breakdown for all classes.
    Use this when you need to verify or re-check what type a specific
    object is. Input: object_id string.
    """
    obj = sm.get_object_by_id(object_id)
    if obj is None:
        return json.dumps({
            "status":    "not_found",
            "object_id": object_id,
            "message":   f"Object {object_id} not found in active objects."
        })

    result = _classify(
        object_id    = object_id,
        speed        = obj["velocity"],
        altitude     = obj["altitude"],
        vertical_rate= obj["vertical_rate"],
        heading      = obj["heading"],
        lat          = obj["lat"],
        lon          = obj["lon"],
        transponder  = obj["has_callsign"],
    )

    return json.dumps({
        "object_id":    object_id,
        "label":        result["label"],
        "confidence":   f"{result['confidence']*100:.1f}%",
        "probabilities": {
            k: f"{v*100:.1f}%"
            for k, v in result.get("probabilities", {}).items()
        }
    }, indent=2)


# ── Tool 5: get_trajectory ────────────────────────────────────────────────────
@tool
def get_trajectory_tool(object_id: str) -> str:
    """
    Get the predicted future trajectory for a specific aerial object.
    Returns the next 5 predicted positions (lat, lon, altitude, velocity,
    heading) with an uncertainty cone radius in km for each step.
    Use this to understand where an object is heading and whether it
    will enter restricted airspace. Input: object_id string.
    """
    obj = sm.get_object_by_id(object_id)
    if obj is None:
        return json.dumps({
            "status":    "not_found",
            "object_id": object_id,
            "message":   f"Object {object_id} not found in active objects."
        })

    traj = _get_traj(object_id, steps=5)

    if traj["status"] != "ok":
        return json.dumps({
            "object_id": object_id,
            "status":    traj["status"],
            "message":   "Insufficient tracking history for trajectory prediction. "
                         f"Need 5 snapshots, have {traj.get('steps_available', 0)}."
        })

    result = {
        "object_id":   object_id,
        "callsign":    obj["callsign"] or "N/A",
        "object_class":obj["object_class"],
        "current_position": {
            "lat": obj["lat"], "lon": obj["lon"],
            "altitude_ft": round(obj["altitude"] * 3.281, 0)
        },
        "predicted_path": []
    }

    for step in traj["trajectory"]:
        result["predicted_path"].append({
            "step":         step["step"],
            "lat":          step["lat"],
            "lon":          step["lon"],
            "altitude_ft":  round(step["baroaltitude"] * 3.281, 0),
            "velocity_kmh": round(step["velocity"] * 3.6, 1),
            "heading":      step["heading"],
            "uncertainty_km": step["uncertainty_km"],
        })

    return json.dumps(result, indent=2)


# ── Tool 6: get_restricted_zones ─────────────────────────────────────────────
@tool
def get_restricted_zones(dummy: str = "") -> str:
    """
    Fetch all active restricted airspace zones with their boundaries
    and severity levels. Returns zone IDs, names, lat/lon boundaries,
    and severity (CRITICAL/HIGH). Use this to check zone boundaries
    when assessing whether an object poses a restricted airspace threat.
    """
    zones = sm.get_restricted_zones()
    return json.dumps({
        "zone_count": len(zones),
        "zones":      zones
    }, indent=2)


# ── All tools list (imported by chains.py) ───────────────────────────────────
ALL_TOOLS = [
    get_active_objects,
    get_risk_scores,
    get_anomalies,
    classify_object_tool,
    get_trajectory_tool,
    get_restricted_zones,
]
