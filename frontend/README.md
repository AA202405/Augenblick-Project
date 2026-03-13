# Airspace Monitor — Frontend

React + Tailwind + Leaflet frontend for **airspace_simulation.zip**.

## Setup

### 1. Start the backend (airspace_simulation)

```bash
cd airspace_simulation
pip install -r requirements.txt
python main.py
# Backend runs on http://localhost:8000
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Start dev server

```bash
npm run dev
# Opens on http://localhost:5173
```

---

## Architecture

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root — HomePage → RegionPicker → Dashboard |
| `src/hooks/useWebSocket.js` | Connects to `ws://localhost:8000/ws` (2s tick) |
| `src/store/airspaceStore.js` | Zustand global state (no auth needed) |
| `src/api/client.js` | Axios REST calls to `/agent/*` endpoints |
| `src/components/Map.jsx` | Leaflet map with real OSM tiles + dark filter |
| `src/components/ObjectPanel.jsx` | Sortable object list by risk score |
| `src/components/AlertFeed.jsx` | Auto-detected CRITICAL/HIGH alerts |
| `src/components/Charts.jsx` | Trajectory chart + risk gauge + AI explain |
| `src/components/AIAssistant.jsx` | Chat against `/agent/query` (Groq LLaMA3) |
| `src/components/HomePage.jsx` | Boot animation + radar + region selector |
| `src/components/RegionPicker.jsx` | Region selection screen |
| `src/components/StatusBar.jsx` | Live connection status + counts |
| `src/lib/regionBounds.js` | Bounding boxes for 5 simulation states |

## Backend endpoints used

| Frontend feature | Endpoint |
|-----------------|---------|
| WebSocket live feed | `WS /ws` |
| AI chat | `POST /agent/query` |
| Auto-summary | `GET /agent/summary` |
| Object detail | `GET /agent/object/{id}` |
| Trajectory | `GET /agent/trajectory/{id}` |
| AI explain | `POST /agent/explain/{id}` |
| Zones (map) | `GET /agent/zones` |
| System status | `GET /status` |

## Map features

- **Real OpenStreetMap tiles** with dark CSS filter
- **Animated markers**: CRITICAL (red pulse), HIGH (orange pulse), selected (blue glow)
- **Trajectory focus mode**: click "VIEW TRAJECTORY" on any marker
- **History trail** (cyan) + predicted path (blue dashed) + dead-reckoning fallback (purple)
- **Restricted zone overlays** loaded from `/agent/zones`
- **RAF dead-reckoning** — smooth 60fps interpolation between 2s WS ticks
- **Region lock** — map bounds locked to selected state

## Regions

| ID | States |
|----|--------|
| `all` | All 5 states (default) |
| `maharashtra` | Mumbai · Pune · Nagpur |
| `goa` | Panaji · Naval airspace |
| `telangana` | Hyderabad |
| `gujarat` | Ahmedabad · Surat |
| `delhi` | Delhi TMA |
