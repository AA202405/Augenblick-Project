# ✈️ AIRSPACE MONITOR
### Intelligent Real-Time Airspace Monitoring System

> AI-powered airspace surveillance covering **Maharashtra · Goa · Karnataka · Telangana · Gujarat**  
> Live object tracking · ML threat detection · LangChain AI agent · WebSocket streaming

---

## 📸 Overview

**Airspace Monitor** is a full-stack, production-grade airspace surveillance platform that tracks aerial objects in real time across five Indian states. It fuses live flight data from the OpenSky Network with a physics-based simulator, runs a multi-stage ML pipeline every 30 seconds, and surfaces threats through an interactive map dashboard powered by a conversational AI agent.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                     │
│   Leaflet Map · Zustand Store · WebSocket Client · Voice    │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket  (1s positions / 30s ML)
┌────────────────────────▼────────────────────────────────────┐
│                     BACKEND (FastAPI)                       │
│                                                             │
│  ┌─────────────┐   ┌──────────────────────────────────┐    │
│  │  OpenSky    │   │         ML Pipeline (30s tick)    │    │
│  │  Live Feed  │──▶│  Classify → Anomaly → Trajectory  │    │
│  └─────────────┘   │         → Risk Score              │    │
│  ┌─────────────┐   └──────────────┬───────────────────┘    │
│  │  Simulator  │──▶               │                         │
│  └─────────────┘   ┌──────────────▼───────────────────┐    │
│                    │     State Manager (In-Memory)     │    │
│                    └──────────────────────────────────-┘    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  LangChain Agent  (Groq → Gemini → Rules fallback)   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### 🗺️ Live Map Dashboard
- **60fps animated markers** via `requestAnimationFrame` dead-reckoning — objects move smoothly between data ticks
- **Trajectory Focus Mode** — lock onto any object, view its history trail (cyan) and ML-predicted path (blue dashed) with uncertainty cones
- **Region locking** — hard map bounds per state, region-filtered object counts
- **Animated alarm banners** for CRITICAL and HIGH risk objects
- **Layer toggles** — objects, zones, trajectories, labels

### 🤖 ML Pipeline (30-second tick)
| Stage | Model | Output |
|-------|-------|--------|
| Classification | RandomForest | `aircraft` / `drone` / `bird` / `unknown` |
| Anomaly Detection | IsolationForest (29 features) | Anomaly score + type label |
| Trajectory Prediction | HistGradientBoosting (MultiOutput) | 5-step future positions |
| Risk Scoring | Weighted formula + hard overrides | Score 0–100, Level LOW→CRITICAL |

### 🔴 Risk Engine
- **Weighted scoring** across zone proximity, anomaly score, speed deviation, transponder signal, and trajectory intercept probability
- **Hard override rules** — zone breach or unknown + no transponder = instant CRITICAL
- **Risk levels:** LOW (0–30) · MEDIUM (31–60) · HIGH (61–80) · CRITICAL (81–100)

### 🧠 AI Agent
- **Primary LLM:** Groq · Llama 3.3 70B Versatile
- **Fallback LLM:** Gemini 2.0 Flash
- **Offline fallback:** Rule-based responses (zero API keys needed)
- **7 live tools:** active objects, risk scores, anomalies, classify, trajectory, zones, anomaly log
- **Multi-turn memory** — 10-turn sliding window conversation context
- **Auto-summary** every 30 seconds pushed to frontend
- **Region-aware queries** — context prepended automatically per state

### 📡 Data Sources
- **OpenSky Network** — real Indian airspace flights, polled every 15s with dead-reckoning interpolation
- **Physics Simulator** — 12–14 synthetic objects (aircraft, drones, birds, unknowns) with realistic flight envelopes, city-pair routes, and anomaly injection every 15 ticks

### 🔊 Voice Alerts
- Web Speech API with severity-tuned rate, pitch, and volume
- CRITICAL alerts jump the queue and cancel lower-priority speech
- Region-filtered — only alerts for objects inside the active state

---

## 🗂️ Project Structure

```
airspace-monitor/
├── backend/
│   ├── main.py                  # FastAPI app, lifespan, pipeline loop
│   ├── config.py                # Pydantic settings (.env)
│   ├── simulator.py             # Physics-based object simulator
│   ├── opensky_feed.py          # OpenSky live feed + dead-reckoning
│   ├── agent/
│   │   ├── agent.py             # LangChain ReAct agent + auto-loop
│   │   ├── tools.py             # 7 LangChain tools (live state reads)
│   │   ├── memory.py            # ConversationMemory (sliding window)
│   │   └── fallback.py          # Rule-based offline fallback
│   ├── api/
│   │   ├── routes.py            # All REST endpoints
│   │   ├── websocket.py         # WebSocket manager (1s + 30s broadcast)
│   │   └── auth.py              # JWT authentication
│   ├── engine/
│   │   ├── risk.py              # Risk scoring engine
│   │   └── zones.py             # Shapely zone geometry + cache
│   ├── models/
│   │   ├── classifier.py        # RandomForest wrapper
│   │   ├── anomaly.py           # IsolationForest wrapper (29 features)
│   │   ├── trajectory.py        # HistGradientBoosting wrapper
│   │   ├── aerial_classifier.pkl
│   │   ├── isolation_forest.pkl
│   │   └── trajectory_model.pkl
│   ├── core/
│   │   └── state_manager.py     # In-memory state + pipeline orchestration
│   ├── db/
│   │   ├── postgres.py          # In-memory DB (no Postgres required)
│   │   └── redis_client.py      # In-memory cache (no Redis required)
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx              # Root component + voice alert watcher
    │   ├── components/
    │   │   ├── Map.jsx          # Leaflet map + RAF animation + focus mode
    │   │   ├── ObjectPanel.jsx  # Sortable object list by risk score
    │   │   ├── AlertFeed.jsx    # Real-time alert feed
    │   │   ├── Charts.jsx       # Altitude / speed / risk history charts
    │   │   ├── AIAssistant.jsx  # AI chat panel + auto-summary
    │   │   ├── StatusBar.jsx    # Connection, risk counts, voice controls
    │   │   ├── HomePage.jsx     # Animated radar landing page
    │   │   ├── RegionPicker.jsx # State selection screen
    │   │   ├── LoginModal.jsx   # JWT login
    │   │   └── Badges.jsx       # RiskBadge + TypeBadge components
    │   ├── store/
    │   │   └── airspaceStore.js # Zustand global store
    │   ├── hooks/
    │   │   ├── useWebSocket.js  # WS client with merge strategy
    │   │   └── useVoice.js      # Web Speech API voice alerts
    │   └── lib/
    │       └── regionBounds.js  # Region bounds, labels, polygon helpers
    ├── package.json
    └── vite.config.js
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- Groq API key (optional) — [console.groq.com](https://console.groq.com)
- Gemini API key (optional) — [aistudio.google.com](https://aistudio.google.com)

> **No database required.** Postgres and Redis are replaced with in-memory stores. The system runs fully offline without any API keys using rule-based fallbacks.

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

Edit `.env`:
```env
GROQ_API_KEY=your_groq_key_here       # Optional
GEMINI_API_KEY=your_gemini_key_here   # Optional
JWT_SECRET=your_secret_key_here
SIM_MAX_OBJECTS=12
SIM_TICK_SECONDS=1.0
```

```bash
# Start the backend
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend

npm install
npm run dev
```

Frontend runs at **http://localhost:5173**

### 3. Login

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `airspace2024` |

---

## 🔌 API Reference

### Authentication
```
POST /auth/token
```

### Objects & State
```
GET  /objects                    # All active objects (in-memory)
GET  /objects/{id}               # Single object
GET  /objects/{id}/history       # Historical positions
GET  /risk                       # Risk scores sorted by score desc
GET  /anomalies                  # Current anomalies + high-risk objects
```

### ML Endpoints
```
POST /classify                   # Classify a single object
POST /predict                    # Trajectory prediction
POST /risk-score                 # Compute risk for given parameters
```

### Zones
```
GET    /zones                    # All restricted zones
POST   /zones                    # Create zone (auth required)
DELETE /zones/{id}               # Deactivate zone (auth required)
```

### AI Agent
```
POST /agent/query                # Natural language query
GET  /agent/summarize            # Latest auto-summary
POST /agent/explain/{object_id}  # Plain-English threat explanation
GET  /agent/status               # LLM mode (groq/gemini/rules)
GET  /agent/log                  # Anomaly history log
```

### WebSocket
```
WS /live-feed
```
Message types received:
- `positions_update` — every 1s, raw positions + trajectory data
- `objects_update` — every 30s, full ML-enriched state
- `ping` — heartbeat every 10s (respond with `pong`)

---

## 🗺️ Coverage Area

| Region | Key Zones |
|--------|-----------|
| **Maharashtra** | Mumbai CSIA, Pune Air Base, BARC Mumbai, Nashik Airport |
| **Goa** | INS Hansa Naval Air Station |
| **Karnataka** | Karwar Naval Base (INS Kadamba) |
| **Telangana** | Hyderabad Begumpet Airport |
| **Gujarat** | Ahmedabad Restricted Zone |

---

## 🛠️ Tech Stack

**Backend**
- FastAPI · Uvicorn · WebSockets
- scikit-learn (RandomForest, IsolationForest, HistGradientBoosting)
- LangChain · langchain-groq · langchain-google-genai
- Shapely · GeoJSON · httpx · asyncpg (API-compatible, in-memory)
- Pydantic v2 · python-jose · passlib

**Frontend**
- React 18 · Vite · Tailwind CSS
- Leaflet · react-leaflet
- Zustand · Recharts · Lucide React
- Web Speech API · WebSocket API

---

## 🔒 Restricted Zones

The system pre-loads 7 restricted zones at startup:

1. Mumbai CSIA Zone
2. Pune Air Base
3. Nashik Airport
4. Goa INS Hansa
5. Hyderabad Begumpet
6. BARC Mumbai
7. Karwar Naval Base

Operators can add/remove zones via the API (authenticated) or the dashboard.

---

## 📊 ML Models

| Model | Algorithm | Features | Labels/Output |
|-------|-----------|----------|---------------|
| Aerial Classifier | RandomForest | speed, altitude, vertical rate, heading, lat, lon, transponder, derived bands | aircraft, drone, bird, unknown |
| Anomaly Detector | IsolationForest | 29 features incl. delta altitude, delta velocity, heading change, rolling stats, zone flags, identity risk | anomaly score 0–1, anomaly type |
| Trajectory Predictor | HistGradientBoosting MultiOutput | last 5 positions × [lat, lon, altitude, velocity, heading] | next position (5-step rollout) |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch — `git checkout -b feature/your-feature`
3. Commit your changes — `git commit -m 'Add your feature'`
4. Push to the branch — `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

<div align="center">
  <b>AIRSPACE MONITOR</b> · Built with ❤️ for Indian airspace safety<br/>
  Maharashtra · Goa · Karnataka · Telangana · Gujarat
</div>
