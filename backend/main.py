"""
main.py — Airspace Monitoring Agentic AI System
FastAPI application with 2-second position ticks for smooth simulation.

Endpoints:
  GET  /                        Health check
  GET  /status                  System + LLM status
  POST /agent/query             Operator natural language query
  POST /agent/explain/{id}      Explain anomaly for specific object
  GET  /agent/objects           All active objects (with history + predicted_path)
  GET  /agent/anomalies         Active anomalies + high-risk objects
  GET  /agent/risk              Risk scores sorted highest first
  GET  /agent/object/{id}       Single object full detail
  GET  /agent/trajectory/{id}   History + predicted trajectory for object
  GET  /agent/zones             Restricted airspace zones (Indian states)
  GET  /agent/log               Historical anomaly log
  POST /agent/tick              Manual pipeline trigger
  WS   /ws                      WebSocket — live push every 2s
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
    handle_operator_query,
    explain_anomaly,
    get_llm_status,
)

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

# ── Tick counter ──────────────────────────────────────────────────────────────
_tick_counter = 0


async def auto_loop():
    """
    Main loop: runs every 2 seconds.
    - Ticks all 20 objects forward
    - Broadcasts to all WebSocket clients
    """
    global _tick_counter

    while True:
        try:
            _tick_counter += 1

            # 1. Advance all objects
            tick_stats = await sm.tick()

            # 3. Build compact objects list for WebSocket (no full history payload)
            objects_compact = []
            for obj in sm.get_active_objects().values():
                objects_compact.append({
                    "object_id":    obj["object_id"],
                    "callsign":     obj["callsign"],
                    "object_type":  obj.get("object_type", "unknown"),
                    "object_class": obj["object_class"],
                    "lat":          obj["lat"],
                    "lon":          obj["lon"],
                    "altitude":     obj["altitude"],
                    "velocity":     obj["velocity"],
                    "heading":      obj["heading"],
                    "vertical_rate":obj["vertical_rate"],
                    "risk_level":   obj["risk_level"],
                    "risk_score":   obj["risk_score"],
                    "is_anomaly":   obj["is_anomaly"],
                    "anomaly_type": obj["anomaly_type"],
                    "state_region": obj.get("state_region", ""),
                    "in_restricted_zone": obj["in_restricted_zone"],
                    # Include history + predicted for map trajectory rendering
                    "history":        obj.get("history", []),
                    "predicted_path": obj.get("predicted_path", []),
                })

            # 4. Push to WebSocket clients
            if ws_manager.active:
                await ws_manager.broadcast({
                    "type":       "auto_update",
                    "tick":       _tick_counter,
                    "objects":    objects_compact,
                    "anomalies":  [
                        {
                            "object_id":   o["object_id"],
                            "callsign":    o["callsign"],
                            "object_type": o.get("object_type","?"),
                            "anomaly_type":o["anomaly_type"],
                            "risk_level":  o["risk_level"],
                            "risk_score":  o["risk_score"],
                            "lat":         o["lat"],
                            "lon":         o["lon"],
                            "state_region":o.get("state_region",""),
                        }
                        for o in sm.get_anomalies()
                    ],
                    "risk_scores": sm.get_risk_scores(),
                    "timestamp":  datetime.utcnow().isoformat(),
                })

        except Exception as e:
            print(f"[main] auto_loop error: {e}")

        await asyncio.sleep(2)   # 2-second tick interval


# ── App lifecycle ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run first tick synchronously to populate state
    await sm.tick()
    # Start background loop
    task = asyncio.create_task(auto_loop())
    yield
    task.cancel()

app = FastAPI(
    title       = "Airspace Monitoring AI System",
    description = "Agentic AI system monitoring 20 objects across Maharashtra, Goa, Telangana, Gujarat, Delhi",
    version     = "2.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ── Pydantic models ───────────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    query: str


# ── REST Endpoints ─────────────────────────────────────────────────────────────
@app.get("/")
async def health():
    objects = sm.get_active_objects()
    return {
        "status":        "running",
        "system":        "Airspace Monitoring AI — India (Static Simulation)",
        "total_objects": len(objects),
        "tick_interval": "2 seconds",
        "states_covered":["Maharashtra", "Goa", "Telangana", "Gujarat", "Delhi"],
        "timestamp":     datetime.utcnow().isoformat(),
    }


@app.get("/status")
async def status():
    objects     = sm.get_active_objects()
    risk_scores = sm.get_risk_scores()
    return {
        "system": "ok",
        "total_objects":   len(objects),
        "critical_count":  len([o for o in risk_scores if o["risk_level"] == "CRITICAL"]),
        "high_count":      len([o for o in risk_scores if o["risk_level"] == "HIGH"]),
        "anomaly_count":   len(sm.get_anomalies()),
        "tick_count":      _tick_counter,
        "llm_status":      get_llm_status(),
        "last_updated":    datetime.utcnow().isoformat(),
    }



@app.post("/agent/query")
async def query(req: QueryRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    return await handle_operator_query(req.query)


@app.post("/agent/explain/{object_id}")
async def explain(object_id: str):
    obj = sm.get_object_by_id(object_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"Object {object_id} not found")
    return await explain_anomaly(object_id)


@app.get("/agent/objects")
async def get_objects():
    objects = sm.get_active_objects()
    return {
        "total":   len(objects),
        "objects": list(objects.values()),
    }


@app.get("/agent/anomalies")
async def get_anomalies():
    anomalies = sm.get_anomalies()
    return {
        "anomaly_count": len(anomalies),
        "anomalies":     anomalies,
    }


@app.get("/agent/risk")
async def get_risk():
    return {
        "count":  len(sm.get_risk_scores()),
        "scores": sm.get_risk_scores(),
    }


@app.get("/agent/object/{object_id}")
async def get_object(object_id: str):
    obj = sm.get_object_by_id(object_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"Object {object_id} not found")
    return obj


@app.get("/agent/trajectory/{object_id}")
async def get_trajectory(object_id: str):
    """
    Returns historical path (last N positions) + predicted future path.
    """
    obj = sm.get_object_by_id(object_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"Object {object_id} not found")

    return {
        "object_id":      object_id,
        "callsign":       obj["callsign"],
        "object_type":    obj.get("object_type", "unknown"),
        "object_class":   obj["object_class"],
        "state_region":   obj.get("state_region", ""),
        "current": {
            "lat":       obj["lat"],
            "lon":       obj["lon"],
            "altitude":  obj["altitude"],
            "velocity":  obj["velocity"],
            "heading":   obj["heading"],
        },
        "history":        obj.get("history", []),
        "predicted_path": obj.get("predicted_path", []),
        "is_anomaly":     obj["is_anomaly"],
        "anomaly_type":   obj["anomaly_type"],
        "risk_level":     obj["risk_level"],
    }


@app.get("/agent/zones")
async def get_zones():
    zones = sm.get_restricted_zones()
    return {"zone_count": len(zones), "zones": zones}


@app.get("/agent/log")
async def get_log():
    log = sm.get_anomaly_log()
    return {"count": len(log), "log": log}


@app.post("/agent/tick")
async def manual_tick():
    stats = await sm.tick()
    return {"message": "Tick executed", "stats": stats}


# ── WebSocket endpoint ────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Send full init payload on connect
        objects = sm.get_active_objects()
        objects_list = list(objects.values())
        await websocket.send_json({
            "type":       "init",
            "objects":    objects_list,
            "anomalies":  sm.get_anomalies(),
            "risk_scores":sm.get_risk_scores(),
            "zones":      sm.get_restricted_zones(),
            "timestamp":  datetime.utcnow().isoformat(),
        })

        # Listen for operator queries over WebSocket
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "query":
                result = await handle_operator_query(data.get("text", ""))
                await websocket.send_json({
                    "type":       "query_response",
                    "query":      result["query"],
                    "answer":     result["answer"],
                    "llm_source": result["llm_source"],
                    "timestamp":  result["timestamp"],
                })
            elif data.get("type") == "explain":
                result = await explain_anomaly(data.get("object_id", ""))
                await websocket.send_json({
                    "type":        "explain_response",
                    "object_id":   result["object_id"],
                    "explanation": result["explanation"],
                    "llm_source":  result.get("llm_source",""),
                    "timestamp":   datetime.utcnow().isoformat(),
                })

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        import traceback
        print(f"[ws] Error: {e}")
        traceback.print_exc()
        ws_manager.disconnect(websocket)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(__import__("os").getenv("APP_PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)