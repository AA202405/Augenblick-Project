"""
static_ai.py
Static knowledge base for common hackathon judge questions.
Used as the final fallback when both the LLM and demo_ai produce no response.
"""

from typing import Optional

STATIC_QA = {
    "what does this system do":
        "This system performs real-time airspace monitoring across 5 Indian states — Maharashtra, Goa, "
        "Telangana, Gujarat, and Delhi/NCR. It detects aerial objects, classifies them using ML models, "
        "identifies anomalous behaviour, and provides risk assessments with AI-powered operational insights.",

    "how does anomaly detection work":
        "The anomaly detection engine uses an IsolationForest model trained on flight telemetry data. "
        "It analyzes trajectory deviation, abnormal velocity patterns, altitude violations, heading "
        "irregularities, and restricted airspace proximity in real time — flagging objects that deviate "
        "significantly from expected behaviour.",

    "how is risk calculated":
        "Risk scores (0–100) are computed using a weighted formula: zone proximity (30%), anomaly score (30%), "
        "speed deviation (15%), transponder absence (15%), and trajectory intercept probability (10%). "
        "Hard override rules force CRITICAL status for restricted zone entries or unknown objects with no transponder.",

    "what technologies are used":
        "The backend is built with FastAPI (Python) and uses a RandomForest classifier for object classification, "
        "IsolationForest for anomaly detection, and HistGradientBoostingRegressor for trajectory prediction. "
        "The AI assistant is powered by LLaMA3-70B via Groq, integrated through LangChain. "
        "The frontend is React + Vite with Leaflet maps and real-time WebSocket data.",

    "what types of objects are detected":
        "The system detects and classifies: civilian aircraft, cargo aircraft, military aircraft, "
        "helicopters, drones (UAVs), birds, and unidentified aerial objects — 120 objects are simulated "
        "across 5 Indian states in real time.",

    "what is the risk score":
        "Each object receives a risk score from 0 to 100. Scores above 81 are CRITICAL (immediate action), "
        "61–80 are HIGH (alert operator), 31–60 are MEDIUM (monitor), and below 31 are LOW (normal operations).",

    "what are restricted zones":
        "Restricted zones are protected airspace regions such as Mumbai TMA, Delhi TMA, Goa Naval Airspace, "
        "Hyderabad ATC Zone, and Ahmedabad TMA. Any object entering these zones is immediately flagged "
        "as CRITICAL and triggers an ATC notification alert.",

    "how does trajectory prediction work":
        "A HistGradientBoostingRegressor model takes the last 5 positional snapshots of each object "
        "(lat, lon, altitude, velocity, heading) and predicts the next 5 future positions. "
        "An uncertainty cone radius grows with each predicted step to represent confidence intervals.",

    "what is the ai agent":
        "The AI agent is a LangChain ReAct agent powered by Groq's LLaMA3-70B model. It has access to "
        "6 tools: get active objects, get risk scores, get anomalies, classify object, get trajectory, "
        "and get restricted zones. The agent reasons step-by-step before answering operator queries.",

    "how does classification work":
        "Each aerial object is classified using a RandomForest model trained on 10 features: speed, altitude, "
        "vertical rate, heading, lat, lon, transponder signal, altitude band, speed band, and absolute vertical rate. "
        "The model outputs a class label and confidence probability.",

    "what is websocket":
        "The system uses WebSocket connections to push live airspace updates to the dashboard every 2 seconds. "
        "All 120 objects, their risk scores, anomaly flags, and positions are broadcast simultaneously "
        "to all connected operators in real time.",

    "what states are monitored":
        "The system monitors 5 Indian states: Maharashtra (30 objects), Delhi/NCR (28 objects), "
        "Telangana (22 objects), Gujarat (22 objects), and Goa (18 objects).",

    "how many objects":
        "The simulation tracks 120 aerial objects in total — distributed across Maharashtra (30), "
        "Delhi/NCR (28), Telangana (22), Gujarat (22), and Goa (18).",

    "what is augenblick":
        "Augenblick (German for 'moment' or 'instant') is a real-time AI-powered airspace monitoring system "
        "designed for Indian airspace. It provides instant situational awareness by combining ML-based object "
        "classification, anomaly detection, trajectory prediction, and an LLM-powered AI assistant.",

    "tell me about the system":
        "Augenblick is a real-time airspace monitoring system tracking 120 aerial objects across 5 Indian states. "
        "It uses machine learning for object classification and anomaly detection, provides live risk scoring, "
        "predicts object trajectories, and features an AI assistant powered by LLaMA3-70B via Groq for "
        "natural language operator queries.",
}


def get_static_response(query: str) -> Optional[str]:
    """
    Match query against the static knowledge base.
    Returns the matched answer or None if no match found.
    """
    q = query.lower().strip()

    for key, answer in STATIC_QA.items():
        if key in q:
            return answer

    # Secondary soft match — check if any key word appears in query
    for key, answer in STATIC_QA.items():
        words = key.split()
        if len(words) >= 2 and sum(1 for w in words if w in q) >= len(words) - 1:
            return answer

    return None