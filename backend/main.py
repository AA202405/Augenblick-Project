"""
main.py
FastAPI application for the Airspace Monitoring Agentic AI System.

Endpoints:
  GET  /                       Health check
  GET  /status                 System + LLM status
  GET  /agent/summary          Latest auto-generated airspace summary
  POST /agent/query            Operator natural language query
  POST /agent/explain/{id}     Explain anomaly for specific object
  GET  /agent/objects          All active objects
  GET  /agent/anomalies        Active anomalies
  GET  /agent/risk             Risk scores sorted by highest
  GET  /agent/object/{id}      Single object full detail
  GET  /agent/trajectory/{id}  Predicted trajectory for object
  GET  /agent/zones            Restricted zones
  GET  /agent/log              Historical anomaly log
  WS   /ws                     WebSocket — live push every 30s

CORS enabled for frontend integration.
"""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime   import datetime
from typing     import Optional

from fastapi             import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic            import BaseModel
import uvicorn

import core.state_manager as sm
from agent.chains import (
    generate_auto_summary,
    handle_operator_query,
    explain_anomaly,
    get_llm_status,
)

# ── Latest summary cache ──────────────────────────────────────────────────────
_latest_summary: dict = {
    "summary":    "System starting up...",
    "llm_source": "none",
    "timestamp":  datetime.utcnow().isoformat(),
    "stats":      {"total": 0, "critical": 0, "high": 0, "anomalies": 0},
}

# ── WebSocket connection manager ──────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active = [c for c in self.active if c != ws]

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


ws_manager = ConnectionManager()


# ── Background auto-loop (every 30s) ─────────────────────────────────────────
async def auto_loop():
    """
    Every 30 seconds:
    1. Run pipeline tick (data → classify → anomaly → trajectory → risk)
    2. Generate LLM summary
    3. Broadcast to all WebSocket clients
    """
    global _latest_summary
    while True:
        try:
            # 1. Pipeline tick
            tick_stats = await sm.tick()

            # 2. LLM summary
            summary = await generate_auto_summary()
            _latest_summary = summary

            # 3. Broadcast to WebSocket clients
            push_data = {
                "type":      "auto_update",
                "summary":   summary["summary"],
                "stats":     summary["stats"],
                "llm_source":summary["llm_source"],
                "timestamp": summary["timestamp"],
                "anomalies": [
                    {
                        "object_id":   a["object_id"],
                        "callsign":    a["callsign"],
                        "object_class":a["object_class"],
                        "anomaly_type":a["anomaly_type"],
                        "risk_level":  a["risk_level"],
                        "risk_score":  a["risk_score"],
                    }
                    for a in sm.get_anomalies()
                ],
                "risk_scores": sm.get_risk_scores()[:10],
            }
            await ws_manager.broadcast(push_data)

        except Exception as e:
            print(f"[AUTO-LOOP ERROR] {e}")

        await asyncio.sleep(30)


# ── Startup / Shutdown ────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initial tick on startup
    await sm.tick()
    # Start auto-loop background task
    loop_task = asyncio.create_task(auto_loop())
    yield
    loop_task.cancel()


# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "Airspace Monitoring Agentic AI",
    description = "Autonomous airspace analysis with LLM-powered insights",
    version     = "1.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────
class QueryRequest(BaseModel):
    query:        str
    session_id:   Optional[str] = "default"


class QueryResponse(BaseModel):
    query:      str
    answer:     str
    llm_source: str
    timestamp:  str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service":  "Airspace Monitoring Agentic AI",
        "version":  "1.0.0",
        "status":   "running",
        "docs":     "/docs",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/status")
async def status():
    """System health + LLM status."""
    active = sm.get_active_objects()
    return {
        "system":      "ok",
        "llm_status":  get_llm_status(),
        "active_objects": len(active),
        "last_updated": _latest_summary.get("timestamp"),
        "timestamp":   datetime.utcnow().isoformat(),
    }


@app.get("/agent/summary")
async def get_summary():
    """Get the latest auto-generated airspace summary."""
    return _latest_summary


@app.post("/agent/query", response_model=QueryResponse)
async def operator_query(req: QueryRequest):
    """
    Submit a natural language query to the agent.
    Examples:
      - "What is the status of the airspace?"
      - "Explain the anomaly on object SIM-DRONE-01"
      - "Which objects are near restricted zones?"
      - "What should I do about the CRITICAL threat?"
    """
    result = await handle_operator_query(req.query)
    return QueryResponse(**result)


@app.post("/agent/explain/{object_id}")
async def explain_object_anomaly(object_id: str):
    """Get a plain-language explanation of why an object was flagged."""
    result = await explain_anomaly(object_id)
    return result


@app.get("/agent/objects")
async def get_objects():
    """Get all active aerial objects with full state."""
    objects = sm.get_active_objects()
    return {
        "total":      len(objects),
        "objects":    list(objects.values()),
        "timestamp":  datetime.utcnow().isoformat(),
    }


@app.get("/agent/anomalies")
async def get_anomalies():
    """Get currently anomalous or high-risk objects."""
    anomalies = sm.get_anomalies()
    return {
        "count":      len(anomalies),
        "anomalies":  anomalies,
        "timestamp":  datetime.utcnow().isoformat(),
    }


@app.get("/agent/risk")
async def get_risk():
    """Get risk scores for all objects, sorted highest first."""
    scores = sm.get_risk_scores()
    return {
        "count":      len(scores),
        "risk_scores": scores,
        "timestamp":  datetime.utcnow().isoformat(),
    }


@app.get("/agent/object/{object_id}")
async def get_object(object_id: str):
    """Get full detail for a specific object."""
    obj = sm.get_object_by_id(object_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"Object {object_id} not found")
    return obj


@app.get("/agent/trajectory/{object_id}")
async def get_object_trajectory(object_id: str):
    """Get predicted trajectory for a specific object."""
    from core.trajectory import get_trajectory
    obj = sm.get_object_by_id(object_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"Object {object_id} not found")
    result = get_trajectory(object_id, steps=5)
    return {
        "object_id":     object_id,
        "callsign":      obj.get("callsign", "N/A"),
        "object_class":  obj.get("object_class"),
        "current":       {
            "lat": obj["lat"], "lon": obj["lon"],
            "altitude": obj["altitude"],
        },
        "trajectory":    result,
        "timestamp":     datetime.utcnow().isoformat(),
    }


@app.get("/agent/zones")
async def get_zones():
    """Get all restricted zones."""
    return {
        "zones":     sm.get_restricted_zones(),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/agent/log")
async def get_log():
    """Get historical anomaly log (last 50 entries)."""
    return {
        "count": len(sm.get_anomaly_log()),
        "log":   sm.get_anomaly_log(),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/agent/tick")
async def manual_tick():
    """Manually trigger a pipeline tick (for testing / on-demand refresh)."""
    stats = await sm.tick()
    return {"status": "ok", "tick_stats": stats}


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket live feed.
    On connect: sends current state immediately.
    Then receives auto-push every 30s from auto_loop.
    Also accepts operator query messages:
      { "type": "query", "text": "your question here" }
    """
    await ws_manager.connect(websocket)
    try:
        # Send initial state on connect
        init_data = {
            "type":      "init",
            "summary":   _latest_summary.get("summary", "Initialising..."),
            "stats":     _latest_summary.get("stats", {}),
            "objects":   list(sm.get_active_objects().values())[:20],
            "anomalies": sm.get_anomalies(),
            "risk_scores": sm.get_risk_scores()[:10],
            "zones":     sm.get_restricted_zones(),
            "timestamp": datetime.utcnow().isoformat(),
        }
        await websocket.send_json(init_data)

        # Listen for messages from the client
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=35)
                if data.get("type") == "query":
                    result = await handle_operator_query(data.get("text", ""))
                    await websocket.send_json({
                        "type":      "query_response",
                        "query":     data.get("text"),
                        "answer":    result["answer"],
                        "llm_source":result["llm_source"],
                        "timestamp": result["timestamp"],
                    })
            except asyncio.TimeoutError:
                # Keep-alive ping
                await websocket.send_json({"type": "ping", "timestamp": datetime.utcnow().isoformat()})

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        ws_manager.disconnect(websocket)
        print(f"[WS ERROR] {e}")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import os
    from dotenv import load_dotenv
    load_dotenv()

    uvicorn.run(
        "main:app",
        host    = os.getenv("APP_HOST", "0.0.0.0"),
        port    = int(os.getenv("APP_PORT", 8000)),
        reload  = False,
        workers = 1,
    )
