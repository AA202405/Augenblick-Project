# Airspace Monitoring — Agentic AI System

## Architecture

```
OpenSky CSV / Live API
        ↓
   data_feed.py  (real data + simulated anomalies)
        ↓
 state_manager.py  (pipeline orchestrator — runs every 30s)
   ├── classifier.py      → aerial_classifier.pkl
   ├── anomaly.py         → isolation_forest.pkl + scaler.pkl
   ├── trajectory.py      → trajectory_model.pkl + trajectory_scaler.pkl
   └── risk_engine.py     → risk_engine_config.json
        ↓
   agent/tools.py    (6 LangChain tools)
   agent/chains.py   (ReAct Agent → Groq primary → Gemini fallback → Rule-based)
   agent/memory.py   (multi-turn conversation memory)
        ↓
   main.py (FastAPI — REST + WebSocket)
```

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Add your API keys
Edit `.env`:
```
GROQ_API_KEY=your_groq_key_here
GEMINI_API_KEY=your_gemini_key_here
```

Get free keys:
- Groq: https://console.groq.com
- Gemini: https://aistudio.google.com/app/apikey

### 3. Place model files
Ensure these are in `models/`:
```
models/
├── aerial_classifier.pkl
├── isolation_forest.pkl
├── scaler.pkl
├── trajectory_model.pkl
├── trajectory_scaler.pkl
└── model_metadata.pkl
```

### 4. Run
```bash
python main.py
```
Or:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

API docs: http://localhost:8000/docs

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/status` | System + LLM status |
| GET | `/agent/summary` | Latest AI-generated airspace summary |
| POST | `/agent/query` | Operator natural language query |
| POST | `/agent/explain/{id}` | Explain anomaly for specific object |
| GET | `/agent/objects` | All active objects |
| GET | `/agent/anomalies` | Active anomalies + high-risk objects |
| GET | `/agent/risk` | Risk scores sorted highest first |
| GET | `/agent/object/{id}` | Single object full detail |
| GET | `/agent/trajectory/{id}` | Predicted trajectory |
| GET | `/agent/zones` | Restricted airspace zones |
| GET | `/agent/log` | Historical anomaly log |
| POST | `/agent/tick` | Manual pipeline trigger |
| WS | `/ws` | WebSocket live feed |

---

## WebSocket Protocol

**Connect:** `ws://localhost:8000/ws`

**On connect — server sends:**
```json
{
  "type": "init",
  "summary": "...",
  "stats": { "total": 23, "critical": 1, "high": 2, "anomalies": 3 },
  "objects": [...],
  "anomalies": [...],
  "risk_scores": [...]
}
```

**Every 30s — server pushes:**
```json
{
  "type": "auto_update",
  "summary": "3 objects active. Object SIM-DRONE-01 (drone, CRITICAL) ...",
  "stats": {...},
  "anomalies": [...],
  "risk_scores": [...]
}
```

**Operator query — client sends:**
```json
{ "type": "query", "text": "What is happening with SIM-DRONE-01?" }
```

**Query response — server sends:**
```json
{
  "type": "query_response",
  "query": "What is happening with SIM-DRONE-01?",
  "answer": "Object SIM-DRONE-01 is a drone approaching the NYC Metro restricted zone...",
  "llm_source": "groq"
}
```

---

## Frontend Integration

All endpoints use standard REST + WebSocket.
CORS is enabled for all origins — connect your React/Vue frontend directly.

Example fetch:
```javascript
const res = await fetch('http://localhost:8000/agent/summary');
const data = await res.json();
console.log(data.summary);
```

Example operator query:
```javascript
const res = await fetch('http://localhost:8000/agent/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'What is the current threat status?' })
});
const data = await res.json();
console.log(data.answer);
```

---

## Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `GROQ_API_KEY` | — | Your Groq API key |
| `GEMINI_API_KEY` | — | Your Gemini API key |
| `GROQ_MODEL` | `llama3-70b-8192` | Groq model name |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Gemini model name |
| `USE_LIVE_OPENSKY` | `false` | Set `true` to use live OpenSky API |
| `INJECT_SIMULATED_ANOMALIES` | `true` | Inject anomalies on top of real data |
| `APP_PORT` | `8000` | Server port |

---

## LLM Fallback Chain

```
Groq (llama3-70b) — primary, fastest
    ↓ if unavailable
Gemini (gemini-1.5-flash) — fallback
    ↓ if unavailable
Rule-based templates — system never goes silent
```
