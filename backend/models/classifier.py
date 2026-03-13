"""
classifier.py  —  Rule-based object classifier (no ML models required)
Classifies aerial objects using deterministic rules based on
object_id prefix, speed, altitude, and transponder status.

Labels: civilian_aircraft, cargo_aircraft, military_aircraft,
        helicopter, drone, bird, unknown
"""


def _classify_by_id(object_id: str):
    """Try to classify by object_id naming convention."""
    oid = object_id.upper()
    parts = oid.split("-")
    if len(parts) >= 2:
        seg = parts[1]
        if seg == "AC":  return "civilian_aircraft"
        if seg == "CG":  return "cargo_aircraft"
        if seg == "ML":  return "military_aircraft"
        if seg == "HL":  return "helicopter"
        if seg == "DR":  return "drone"
        if seg == "BR":  return "bird"
        if seg == "UK":  return "unknown"

    name = object_id.lower()
    if any(k in name for k in ("iaf", "navy", "mil", "cstg")):
        return "military_aircraft"
    if any(k in name for k in ("ems", "med", "heli")):
        return "helicopter"
    if any(k in name for k in ("fedx", "dhl", "blue", "cargo", "bluedrm")):
        return "cargo_aircraft"
    return None


def _classify_by_telemetry(speed, altitude, transponder):
    if altitude < 150 and speed < 25:
        return "drone"
    if altitude < 900 and speed < 30:
        return "bird"
    if altitude < 1500 and speed < 90:
        return "helicopter"
    if not transponder and altitude < 4000:
        return "unknown"
    if speed > 300:
        return "military_aircraft"
    return "civilian_aircraft"


def classify_object(object_id, speed, altitude, vertical_rate,
                    heading, lat, lon, transponder):
    label = _classify_by_id(object_id)
    if label is None:
        label = _classify_by_telemetry(speed, altitude, transponder)
        confidence = 0.72
    else:
        confidence = 0.91
    return {
        "object_id":     object_id,
        "label":         label,
        "confidence":    confidence,
        "probabilities": {label: confidence},
        "status":        "rule_based",
    }


def classify_batch(objects):
    return [classify_object(**obj) for obj in objects]