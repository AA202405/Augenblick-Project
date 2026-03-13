"""
trajectory.py  —  Dead-reckoning trajectory predictor (no ML models required)
Predicts future positions using heading, speed, vertical_rate.
Maintains per-object position history for trail rendering.
"""

import math
from collections import deque

SEQ_LENGTH = 5
_TICK_SECS = 2.0
_buffers: dict = {}   # object_id → deque of last SEQ_LENGTH position dicts

R_EARTH = 6371000.0   # metres


def update_buffer(object_id: str, lat: float, lon: float,
                  baroaltitude: float, velocity: float, heading: float):
    """Push latest position into the object's sliding window."""
    if object_id not in _buffers:
        _buffers[object_id] = deque(maxlen=SEQ_LENGTH)
    _buffers[object_id].append({
        "lat": lat, "lon": lon,
        "baroaltitude": baroaltitude,
        "velocity": velocity,
        "heading": heading,
    })


def _dead_reckon(lat: float, lon: float, alt: float,
                 velocity: float, heading: float,
                 vertical_rate: float, steps: int,
                 dt: float = 30.0) -> list:
    """
    Simple dead-reckoning: project position forward by `steps` steps
    each of `dt` seconds.
    """
    trajectory = []
    cur_lat, cur_lon, cur_alt = lat, lon, alt

    for step in range(1, steps + 1):
        dist_m   = velocity * dt
        hdg_rad  = math.radians(heading)
        d_lat    = (dist_m * math.cos(hdg_rad)) / R_EARTH
        d_lon    = (dist_m * math.sin(hdg_rad)) / (R_EARTH * math.cos(math.radians(cur_lat)))
        cur_lat += math.degrees(d_lat)
        cur_lon += math.degrees(d_lon)
        cur_alt  = max(0.0, cur_alt + vertical_rate * dt)
        uncertainty_km = round(0.05 * step, 3)

        trajectory.append({
            "step":           step,
            "lat":            round(cur_lat, 6),
            "lon":            round(cur_lon, 6),
            "baroaltitude":   round(cur_alt, 1),
            "velocity":       round(velocity, 2),
            "heading":        round(heading, 2),
            "uncertainty_km": uncertainty_km,
        })

    return trajectory


def get_trajectory(object_id: str, steps: int = 5) -> dict:
    """
    Predict the next `steps` positions for an object using dead-reckoning.
    Returns trajectory list.
    """
    try:
        buf = _buffers.get(object_id)
        if not buf:
            return {
                "object_id": object_id,
                "status":    "insufficient_data",
                "steps_available": 0,
                "trajectory": [],
            }

        last = buf[-1]
        trajectory = _dead_reckon(
            lat           = last["lat"],
            lon           = last["lon"],
            alt           = last["baroaltitude"],
            velocity      = last["velocity"],
            heading       = last["heading"],
            vertical_rate = 0.0,   # no VR in buffer; state_manager has it separately
            steps         = steps,
        )

        return {
            "object_id":  object_id,
            "status":     "ok",
            "steps":      len(trajectory),
            "trajectory": trajectory,
        }

    except Exception as e:
        return {
            "object_id":  object_id,
            "status":     f"error: {e}",
            "trajectory": [],
        }


def check_intercept(obj_id_a: str, obj_id_b: str,
                    threshold_km: float = 0.5) -> float:
    """
    Returns probability [0-1] that two objects will intercept
    within their next 5 predicted steps.
    """
    try:
        traj_a = get_trajectory(obj_id_a)["trajectory"]
        traj_b = get_trajectory(obj_id_b)["trajectory"]
        if not traj_a or not traj_b:
            return 0.0

        min_steps   = min(len(traj_a), len(traj_b))
        close_steps = 0
        for i in range(min_steps):
            dlat   = traj_a[i]["lat"] - traj_b[i]["lat"]
            dlon   = traj_a[i]["lon"] - traj_b[i]["lon"]
            dist_km = ((dlat ** 2 + dlon ** 2) ** 0.5) * 111.0
            if dist_km < threshold_km:
                close_steps += 1

        return round(close_steps / min_steps, 3)
    except Exception:
        return 0.0


def clear_buffer(object_id: str):
    """Remove buffer for objects no longer active."""
    _buffers.pop(object_id, None)