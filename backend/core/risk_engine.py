"""
risk_engine.py
Implements the weighted risk scoring formula from risk_engine_config.json

Formula:
  Risk Score = w1×zone_proximity + w2×anomaly_score +
               w3×speed_deviation + w4×no_transponder +
               w5×trajectory_intercept_prob
  Score range: 0–100

Hard overrides can force CRITICAL/HIGH regardless of formula score.
"""

import json
from pathlib import Path

CONFIG_PATH = Path(__file__).parent.parent / "risk_engine_config.json"

_config = None


def _load_config() -> dict:
    global _config
    if _config is None:
        with open(CONFIG_PATH, "r") as f:
            _config = json.load(f)
    return _config


def _score_to_level(score: float) -> str:
    if score >= 81: return "CRITICAL"
    if score >= 61: return "HIGH"
    if score >= 31: return "MEDIUM"
    return "LOW"


def _zone_proximity(lat: float, lon: float) -> float:
    """Returns proximity score [0-1]. 1.0 = inside zone."""
    cfg = _load_config()
    zones = cfg.get("restricted_zones", [])
    # Hard-coded zone boundaries (matching anomaly notebook + config)
    ZONE_BOUNDS = {
        "R-01": {"lat": (40.0, 41.0), "lon": (-75.0, -74.0)},
        "R-02": {"lat": (34.0, 35.0), "lon": (-118.5, -117.5)},
    }
    for zid, bounds in ZONE_BOUNDS.items():
        if (bounds["lat"][0] <= lat <= bounds["lat"][1] and
                bounds["lon"][0] <= lon <= bounds["lon"][1]):
            return 1.0  # inside zone

    # Distance to nearest zone centroid
    centroids = [(40.5, -74.5), (34.5, -118.0)]
    min_d = min(((lat - c[0]) ** 2 + (lon - c[1]) ** 2) ** 0.5
                for c in centroids)
    return round(max(0.0, 1.0 - (min_d / 0.5)), 4)


def _speed_deviation(velocity: float, object_class: str) -> float:
    """Returns normalised speed deviation [0-1]."""
    cfg = _load_config()
    avg_speeds = cfg.get("class_avg_speeds", {})
    class_avg = avg_speeds.get(object_class, avg_speeds.get("unknown", 100))
    if class_avg <= 0:
        return 0.0
    ratio = velocity / class_avg
    if ratio > 1:
        deviation = min((ratio - 1.0), 1.0)
    else:
        deviation = min((1.0 - ratio), 1.0)
    return round(deviation, 4)


def _apply_hard_overrides(row: dict, formula_score: float) -> tuple[int, str, str | None]:
    """
    Apply hard override rules.
    Returns (final_score, final_level, triggered_rule_name)
    """
    cfg = _load_config()

    # Rule 1: Restricted Zone Entry
    if row.get("in_restricted_zone", 0) == 1:
        return 100, "CRITICAL", "Restricted Zone Entry"

    # Rule 2: Unknown + No Transponder
    if (str(row.get("object_class", "")).lower() == "unknown" and
            row.get("no_transponder", 0) == 1):
        return 100, "CRITICAL", "Unknown + No Transponder"

    # Rule 3: Abrupt Altitude Drop
    if row.get("anomaly_type", "") == "Abrupt Altitude Change":
        min_score = 61  # HIGH minimum
        final = int(max(formula_score, min_score))
        return final, "HIGH", "Abrupt Altitude Drop"

    # Rule 4: Erratic Heading
    if row.get("anomaly_type", "") == "Irregular Route":
        min_score = 61
        final = int(max(formula_score, min_score))
        return final, "HIGH", "Erratic Heading"

    # Rule 5: Intercept Trajectory
    if float(row.get("trajectory_intercept_prob", 0)) >= 0.85:
        min_score = 61
        final = int(max(formula_score, min_score))
        return final, "HIGH", "Intercept Trajectory"

    return int(formula_score), _score_to_level(formula_score), None


def compute_risk(
    object_id:                str,
    lat:                      float,
    lon:                      float,
    velocity:                 float,
    object_class:             str,
    anomaly_score:            float,
    anomaly_type:             str,
    no_transponder:           int,
    trajectory_intercept_prob: float,
    in_restricted_zone:       int = 0,
) -> dict:
    """
    Compute risk score for a single object.
    Returns full breakdown including components, level, and triggered rule.
    """
    cfg     = _load_config()
    cls_key = object_class.lower().replace(" ", "_")
    # Map 'aircraft' → 'civilian_aircraft'
    if cls_key == "aircraft":
        cls_key = "civilian_aircraft"

    weights = cfg["class_weights"].get(cls_key, cfg["base_weights"])

    # Component scores [0-1]
    zone_prox  = _zone_proximity(lat, lon) if in_restricted_zone == 0 else 1.0
    anom_score = float(min(max(anomaly_score, 0.0), 1.0))
    spd_dev    = _speed_deviation(velocity, cls_key)
    no_ts      = float(no_transponder)
    traj_prob  = float(min(max(trajectory_intercept_prob, 0.0), 1.0))

    # Weighted formula → scale to 0-100
    raw_score = (
        weights["zone_proximity"]            * zone_prox +
        weights["anomaly_score"]             * anom_score +
        weights["speed_deviation"]           * spd_dev +
        weights["no_transponder"]            * no_ts +
        weights["trajectory_intercept_prob"] * traj_prob
    ) * 100

    raw_score = round(min(max(raw_score, 0.0), 100.0), 2)

    row = {
        "object_class":             object_class,
        "in_restricted_zone":       in_restricted_zone,
        "anomaly_type":             anomaly_type,
        "no_transponder":           no_transponder,
        "trajectory_intercept_prob": trajectory_intercept_prob,
    }

    final_score, final_level, triggered_rule = _apply_hard_overrides(row, raw_score)

    return {
        "object_id":    object_id,
        "risk_score":   final_score,
        "risk_level":   final_level,
        "formula_score": raw_score,
        "triggered_rule": triggered_rule,
        "components": {
            "zone_proximity":            round(zone_prox, 4),
            "anomaly_score":             round(anom_score, 4),
            "speed_deviation":           round(spd_dev, 4),
            "no_transponder":            no_ts,
            "trajectory_intercept_prob": round(traj_prob, 4),
        },
        "weights_used": weights,
        "object_class": object_class,
    }


def get_risk_color(level: str) -> str:
    colors = {"LOW": "#2ecc71", "MEDIUM": "#f39c12",
              "HIGH": "#e67e22", "CRITICAL": "#e74c3c"}
    return colors.get(level, "#ffffff")
