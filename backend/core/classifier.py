"""
classifier.py
Wraps aerial_classifier.pkl (RandomForest)
Input features: speed, altitude, vertical_rate, heading, lat, lon,
                transponder_signal, altitude_band, speed_band, abs_vertical_rate
Labels: aircraft, bird, drone, unknown
"""

import joblib
import numpy as np
import pandas as pd
from pathlib import Path

MODEL_PATH = Path(__file__).parent.parent / "models" / "aerial_classifier.pkl"

_bundle = None

def _load():
    global _bundle
    if _bundle is None:
        _bundle = joblib.load(MODEL_PATH)
    return _bundle


def _build_features(speed: float, altitude: float, vertical_rate: float,
                    heading: float, lat: float, lon: float,
                    transponder: bool) -> pd.DataFrame:
    """Build the 10-feature DataFrame expected by the classifier."""
    ts = 1 if transponder else 0

    # altitude_band: bins [-1,120,500,3000,99999] → labels [0,1,2,3]
    if altitude <= 120:
        ab = 0
    elif altitude <= 500:
        ab = 1
    elif altitude <= 3000:
        ab = 2
    else:
        ab = 3

    # speed_band: bins [-1,30,100,250,99999] → labels [0,1,2,3]
    if speed <= 30:
        sb = 0
    elif speed <= 100:
        sb = 1
    elif speed <= 250:
        sb = 2
    else:
        sb = 3

    avr = abs(vertical_rate)

    features = ['speed', 'altitude', 'vertical_rate', 'heading', 'lat', 'lon',
                'transponder_signal', 'altitude_band', 'speed_band', 'abs_vertical_rate']

    row = pd.DataFrame([[speed, altitude, vertical_rate, heading, lat, lon,
                         ts, ab, sb, avr]], columns=features)
    return row


def classify_object(object_id: str, speed: float, altitude: float,
                    vertical_rate: float, heading: float,
                    lat: float, lon: float, transponder: bool) -> dict:
    """
    Classify a single aerial object.
    Returns: { object_id, label, confidence, probabilities }
    """
    try:
        bundle = _load()
        model = bundle['model']
        le    = bundle['label_encoder']

        row   = _build_features(speed, altitude, vertical_rate,
                                heading, lat, lon, transponder)
        pred  = model.predict(row)[0]
        proba = model.predict_proba(row)[0]
        label = le.inverse_transform([pred])[0]

        prob_dict = {cls: round(float(p), 4)
                     for cls, p in zip(le.classes_, proba)}

        return {
            "object_id":    object_id,
            "label":        label,
            "confidence":   round(float(max(proba)), 4),
            "probabilities": prob_dict,
            "status":       "ok"
        }
    except Exception as e:
        return {
            "object_id": object_id,
            "label":     "unknown",
            "confidence": 0.0,
            "probabilities": {},
            "status":    f"error: {e}"
        }


def classify_batch(objects: list[dict]) -> list[dict]:
    """
    Classify a list of object dicts.
    Each dict must have: object_id, speed, altitude, vertical_rate,
                         heading, lat, lon, transponder
    """
    return [classify_object(**obj) for obj in objects]
