"""
trajectory.py
Wraps trajectory_model.pkl (HistGradientBoostingRegressor MultiOutput)
      + trajectory_scaler.pkl (StandardScaler)
      + model_metadata.pkl

Input:  last 5 snapshots, each with [lat, lon, baroaltitude, velocity, heading]
        → flattened to shape (1, 25) → scaled → predict → (5,) output
Output: next predicted position + multi-step forecast
"""

import pickle
import numpy as np
from pathlib import Path
from collections import deque

MODEL_PATH  = Path(__file__).parent.parent / "models" / "trajectory_model.pkl"
SCALER_PATH = Path(__file__).parent.parent / "models" / "trajectory_scaler.pkl"
META_PATH   = Path(__file__).parent.parent / "models" / "model_metadata.pkl"

FEATURES   = ["lat", "lon", "baroaltitude", "velocity", "heading"]
SEQ_LENGTH = 5

# Per-object sliding window of last 5 positions
_buffers: dict[str, deque] = {}

_model   = None
_scaler  = None
_meta    = None


def _load():
    global _model, _scaler, _meta
    if _model is None:
        with open(MODEL_PATH,  "rb") as f: _model  = pickle.load(f)
        with open(SCALER_PATH, "rb") as f: _scaler = pickle.load(f)
        with open(META_PATH,   "rb") as f: _meta   = pickle.load(f)
    return _model, _scaler, _meta


def update_buffer(object_id: str, lat: float, lon: float,
                  baroaltitude: float, velocity: float, heading: float):
    """Push latest position into the object's sliding window."""
    if object_id not in _buffers:
        _buffers[object_id] = deque(maxlen=SEQ_LENGTH)
    _buffers[object_id].append([lat, lon, baroaltitude, velocity, heading])


def _predict_one(last_5: list) -> dict | None:
    """Run one-step prediction from 5 snapshots."""
    try:
        model, scaler, _ = _load()
        arr    = np.array(last_5, dtype=float)          # (5, 5)
        flat   = arr.reshape(1, -1)                     # (1, 25)
        scaled = scaler.transform(flat)
        pred   = model.predict(scaled)[0]               # (5,)
        return {
            "lat":          round(float(pred[0]), 6),
            "lon":          round(float(pred[1]), 6),
            "baroaltitude": round(float(pred[2]), 1),
            "velocity":     round(float(pred[3]), 2),
            "heading":      round(float(pred[4]), 2),
        }
    except Exception:
        return None


def get_trajectory(object_id: str, steps: int = 5) -> dict:
    """
    Predict the next `steps` positions for an object.
    Returns trajectory list + uncertainty cone estimate.
    """
    try:
        buf = _buffers.get(object_id)
        if buf is None or len(buf) < SEQ_LENGTH:
            return {
                "object_id": object_id,
                "status":    "insufficient_data",
                "steps_available": len(buf) if buf else 0,
                "trajectory": []
            }

        model, scaler, _ = _load()
        trajectory = []
        window = list(buf)  # (5, 5)

        for step in range(steps):
            pred = _predict_one(window)
            if pred is None:
                break
            # Uncertainty grows with steps (simple linear cone)
            uncertainty_km = round(0.05 * (step + 1), 3)
            trajectory.append({
                "step":         step + 1,
                "lat":          pred["lat"],
                "lon":          pred["lon"],
                "baroaltitude": pred["baroaltitude"],
                "velocity":     pred["velocity"],
                "heading":      pred["heading"],
                "uncertainty_km": uncertainty_km
            })
            # Slide window forward
            window = window[1:] + [[pred["lat"], pred["lon"],
                                     pred["baroaltitude"],
                                     pred["velocity"], pred["heading"]]]

        return {
            "object_id":  object_id,
            "status":     "ok",
            "steps":      len(trajectory),
            "trajectory": trajectory
        }

    except Exception as e:
        return {
            "object_id":  object_id,
            "status":     f"error: {e}",
            "trajectory": []
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

        min_steps = min(len(traj_a), len(traj_b))
        close_steps = 0
        for i in range(min_steps):
            dlat = traj_a[i]["lat"]  - traj_b[i]["lat"]
            dlon = traj_a[i]["lon"]  - traj_b[i]["lon"]
            dist_km = ((dlat ** 2 + dlon ** 2) ** 0.5) * 111.0
            if dist_km < threshold_km:
                close_steps += 1

        return round(close_steps / min_steps, 3)
    except Exception:
        return 0.0


def clear_buffer(object_id: str):
    """Remove buffer for objects no longer active."""
    _buffers.pop(object_id, None)
