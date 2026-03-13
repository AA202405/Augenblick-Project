# Airspace Monitoring — Agentic AI System (India Simulation)

## Overview
Static simulation of 20 aerial objects across 5 Indian states:
**Maharashtra, Goa, Telangana, Gujarat, Delhi/NCR**

Objects move in real-time (2-second ticks) along realistic cross-state routes with full trajectory history and future predictions.

## Architecture
```
Static Simulation (data_feed.py)
  20 objects × real waypoint routes
  2-second position ticks
  Historical path (last 20 positions)
  Predicted future trajectory (next 8 positions)
         ↓
 state_manager.py  (pipeline orchestrator)
   ├── classifier.py      → aerial_classifier.pkl
   ├── anomaly.py         → isolation_forest.pkl + scaler.pkl
   ├── trajectory.py      → trajectory_model.pkl
   └── risk_engine.py     → risk_engine_config.json
         ↓
   agent/chains.py   (Groq key1 → Groq key2 → rule-based)
   agent/tools.py    (6 LangChain tools)
   agent/memory.py   (multi-turn conversation memory)
         ↓
   main.py (FastAPI — REST + WebSocket)
```

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure API keys
Edit `.env`:
```
GROQ_API_KEY=your_groq_key_1_here
GROQ_API_KEY_2=your_groq_key_2_here
```

### 3. Run
```bash
python main.py
```

API docs: http://localhost:8000/docs

---

## 20 Simulated Objects

| ID | Callsign | Type | Route | Anomaly |
|---|---|---|---|---|
| AI101 | AI101 | Commercial | Mumbai → Delhi | None |
| 6E202 | 6E202 | Commercial | Hyderabad → Mumbai | None |
| SG303 | SG303 | Commercial | Ahmedabad → Hyderabad | None |
| IX404 | IX404 | Commercial | Goa → Delhi | **Abrupt Altitude Drop** |
| QP505 | QP505 | Commercial | Delhi → Mumbai | **Erratic Heading** |
| AI901 | AI901 | Commercial | Pune → Goa | None |
| TR702 | TR702 | Commercial | Nagpur → Hyderabad | None |
| DRONE-MUM-01 | — | Drone | Approaching Mumbai TMA | **Restricted Zone Entry** |
| DRONE-HYD-02 | HYD-D02 | Drone | Hyderabad area | **Low Alt + High Speed** |
| DRONE-GOA-03 | GOA-D03 | Drone | Goa delivery | None |
| UNK-GUJ-01 | — | Unknown | Gujarat crossing | **No Transponder** |
| UNK-DEL-02 | — | Unknown | Approaching Delhi TMA | **No Transponder** |
| BIRD-MAH-01 | — | Bird | Maharashtra corridor | **Bird in Flight Corridor** |
| BIRD-TEL-02 | — | Bird | Telangana | None |
| IAF-MIG01 | IAF01 | Military | Delhi corridor | None |
| IAF-HEL02 | IAF-H2 | Helicopter | Gujarat | **Speed Burst** (rotating) |
| BLUEDRM1 | BLUEDRM1 | Cargo | Mumbai → Hyderabad | None |
| CARGO502 | CARGO502 | Cargo | Ahmedabad → Delhi | **Anomalous** (rotating) |
| HELI-GOA1 | GOA-H1 | Helicopter | Goa tourist loop | None |
| HELI-MAH2 | EMS-MAH2 | Helicopter | Maharashtra EMS | **Anomalous** (rotating) |

**Rotating anomalies** cycle every ~60 seconds between IAF-HEL02, CARGO502, HELI-MAH2.

## Restricted Zones (Indian Airspace)

| ID | Name | Severity |
|---|---|---|
| RZ-MUM | Mumbai TMA | CRITICAL |
| RZ-DEL | Delhi TMA | CRITICAL |
| RZ-GOA | Goa Naval Airspace | CRITICAL |
| RZ-HYD | Hyderabad ATC Zone | HIGH |
| RZ-AMD | Ahmedabad TMA | HIGH |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Health check |
| GET | `/status` | System + LLM status |
| GET | `/agent/summary` | AI-generated airspace summary |
| POST | `/agent/query` | Operator natural language query |
| POST | `/agent/explain/{id}` | Explain anomaly for object |
| GET | `/agent/objects` | All 20 active objects |
| GET | `/agent/anomalies` | Active anomalies + high-risk |
| GET | `/agent/risk` | Risk scores sorted highest first |
| GET | `/agent/object/{id}` | Single object full detail |
| GET | `/agent/trajectory/{id}` | Historical + predicted trajectory |
| GET | `/agent/zones` | Restricted airspace zones |
| GET | `/agent/log` | Historical anomaly log |
| WS | `/ws` | WebSocket live feed (2s push) |

## WebSocket Live Feed

Each object in the feed includes:
- `historical_path`: last 20 positions `[{lat, lon, alt, ts}]`
- `future_trajectory`: next 8 predicted positions `[{lat, lon, alt, t}]`
- `waypoints`: full route waypoints for map rendering
- `anomaly_active`: boolean
- `anomaly_label`: anomaly type string
- `in_restricted_zone`: boolean

## LLM Fallback Chain
```
Groq key1 (llama3-70b) — primary
    ↓ if rate-limited or unavailable
Groq key2 (llama3-70b) — fallback
    ↓ if both unavailable
Rule-based templates — system never goes silent
```
