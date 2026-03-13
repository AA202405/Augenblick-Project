import { useEffect, useRef, useState } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'
import { REGION_VIEW, REGION_LABELS, isInRegion } from '../lib/regionBounds'

// ── Helpers ───────────────────────────────────────────────────────────────────
function getEmoji(obj) {
  const t = (obj?.object_type || '').toLowerCase()
  if (t === 'bird')              return '🐦'
  if (t === 'drone')             return '🛸'
  if (t === 'helicopter')        return '🚁'
  if (t === 'unknown')           return '❓'
  if (t === 'military_aircraft') return '🪖'
  if (t === 'cargo_aircraft')    return '📦'
  return '✈️'
}

function riskColor(level) {
  if (level === 'CRITICAL') return '#ef4444'
  if (level === 'HIGH')     return '#f97316'
  if (level === 'MEDIUM')   return '#eab308'
  return '#22c55e'
}

function popupHtml(obj) {
  const altFt  = Math.round((obj.altitude || 0) * 3.281).toLocaleString()
  const spdKph = Math.round((obj.velocity || 0) * 3.6)
  const color  = riskColor(obj.risk_level)
  return `
    <div style="font-family:system-ui,sans-serif;font-size:12px;color:#e2e8f0;
                padding:12px;min-width:210px;background:#0f172a;border-radius:8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;
                  border-bottom:1px solid #1e293b;padding-bottom:8px;">
        <span style="font-size:20px;">${getEmoji(obj)}</span>
        <div>
          <div style="font-weight:700;color:#f1f5f9;">${obj.object_id}</div>
          <div style="font-size:10px;color:#64748b;">${obj.callsign || 'No callsign'}</div>
        </div>
        <div style="margin-left:auto;color:${color};font-weight:700;font-size:11px;">
          ${obj.risk_level} (${obj.risk_score ?? 0})
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;font-size:11px;">
        <div style="color:#64748b;">Type</div>    <div style="color:#e2e8f0;">${obj.object_type || '—'}</div>
        <div style="color:#64748b;">Altitude</div><div style="color:#e2e8f0;">${altFt} ft</div>
        <div style="color:#64748b;">Speed</div>   <div style="color:#e2e8f0;">${spdKph} km/h</div>
        <div style="color:#64748b;">Heading</div> <div style="color:#e2e8f0;">${Math.round(obj.heading || 0)}°</div>
        <div style="color:#64748b;">Region</div>  <div style="color:#e2e8f0;">${obj.state_region || '—'}</div>
      </div>
      ${obj.is_anomaly ? `
        <div style="margin-top:8px;padding:4px 8px;background:rgba(249,115,22,0.15);
                    border:1px solid #f97316;border-radius:4px;color:#fdba74;font-size:11px;">
          ⚡ ${obj.anomaly_type || 'Anomaly'}
        </div>` : ''}
      ${obj.in_restricted_zone ? `
        <div style="margin-top:4px;padding:4px 8px;background:rgba(239,68,68,0.15);
                    border:1px solid #ef4444;border-radius:4px;color:#fca5a5;font-size:11px;">
          🚫 Restricted Zone Breach
        </div>` : ''}
    </div>`
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AirspaceMap() {
  const mapRef     = useRef(null)
  const leafletRef = useRef(null)   // { map, L }
  const markersRef = useRef({})
  const objectsRef = useRef([])
  const initDone   = useRef(false)

  const { objects, selectedObjectId, selectObject, activeRegion, setActiveRegion } = useAirspaceStore()
  const safeObjects = Array.isArray(objects) ? objects : []
  const [zoomLevel, setZoomLevel] = useState(5)

  // Keep fresh ref for click handlers
  useEffect(() => { objectsRef.current = safeObjects }, [safeObjects])

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || initDone.current) return
    initDone.current = true

    // Clean up any stale Leaflet instance on the DOM node
    if (mapRef.current._leaflet_id) {
      mapRef.current._leaflet_id = null
    }

    const rv = REGION_VIEW[activeRegion] || REGION_VIEW.all

    import('leaflet').then(({ default: L }) => {
      if (!mapRef.current) return

      const map = L.map(mapRef.current, {
        center:           rv.center,
        zoom:             rv.zoom,
        zoomControl:      false,       // custom buttons below
        attributionControl: true,
        dragging:         true,
        scrollWheelZoom:  true,
        doubleClickZoom:  true,
        touchZoom:        true,
        boxZoom:          true,
        keyboard:         true,
      })

      // OpenStreetMap tiles — always works, no token needed
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom:     19,
        minZoom:     3,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      // Dark overlay on OSM for better contrast with markers
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
        { maxZoom: 19, minZoom: 3, subdomains: 'abcd', opacity: 0.65 }
      ).addTo(map)

      // Labels on top
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
        { maxZoom: 19, minZoom: 3, subdomains: 'abcd' }
      ).addTo(map)

      L.control.scale({ imperial: false, metric: true, position: 'bottomleft', maxWidth: 100 }).addTo(map)
      map.on('zoomend', () => setZoomLevel(map.getZoom()))

      leafletRef.current = { map, L }
    })

    return () => {
      if (leafletRef.current) {
        leafletRef.current.map.remove()
        leafletRef.current = null
        markersRef.current = {}
        initDone.current   = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fly to region on change ────────────────────────────────────────────────
  useEffect(() => {
    if (!leafletRef.current) return
    const { map } = leafletRef.current
    const rv = REGION_VIEW[activeRegion] || REGION_VIEW.all
    map.flyTo(rv.center, rv.zoom, { animate: true, duration: 0.7 })
  }, [activeRegion])

  // ── Update markers every tick ──────────────────────────────────────────────
  useEffect(() => {
    if (!leafletRef.current) return
    const { map, L } = leafletRef.current

    // Show ALL objects regardless of region (region buttons just move the view)
    const visible = safeObjects.filter(o => o && typeof o.lat === 'number' && typeof o.lon === 'number')
    const seen    = new Set()

    visible.forEach(obj => {
      seen.add(obj.object_id)
      const color      = riskColor(obj.risk_level)
      const isSelected = obj.object_id === selectedObjectId
      const isCrit     = obj.risk_level === 'CRITICAL'
      const size       = isSelected ? 34 : isCrit ? 28 : 22
      const glow       = isCrit ? `0 0 12px ${color}` : `0 0 5px ${color}80`
      const pulse      = isCrit
        ? `animation:critpulse 1s ease-in-out infinite;`
        : isSelected
          ? `animation:critpulse 1.5s ease-in-out infinite;`
          : ''

      const iconHtml = `
        <div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:rgba(5,10,22,0.88);
          border:2.5px solid ${color};
          display:flex;align-items:center;justify-content:center;
          box-shadow:${glow};cursor:pointer;
          font-size:${Math.round(size * 0.52)}px;
          ${pulse}
        ">${getEmoji(obj)}</div>`

      const icon = L.divIcon({
        className: '',
        html:       iconHtml,
        iconSize:   [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor:[0, -(size / 2)],
      })

      if (markersRef.current[obj.object_id]) {
        markersRef.current[obj.object_id].setLatLng([obj.lat, obj.lon])
        markersRef.current[obj.object_id].setIcon(icon)
        markersRef.current[obj.object_id].setPopupContent(popupHtml(obj))
      } else {
        const marker = L.marker([obj.lat, obj.lon], { icon })
          .addTo(map)
          .bindPopup(popupHtml(obj), {
            maxWidth:       270,
            className:      'ap-popup',
            closeButton:    true,
            autoClose:      false,
            closeOnEscapeKey: true,
          })
          .on('click', () => {
            selectObject(obj.object_id)
            const fresh = objectsRef.current.find(o => o.object_id === obj.object_id) || obj
            marker.setPopupContent(popupHtml(fresh))
            marker.openPopup()
          })
        markersRef.current[obj.object_id] = marker
      }
    })

    // Remove stale markers
    Object.keys(markersRef.current).forEach(id => {
      if (!seen.has(id)) {
        try { markersRef.current[id].remove() } catch {}
        delete markersRef.current[id]
      }
    })
  }, [safeObjects, selectedObjectId, selectObject])

  // ── Derived counts ─────────────────────────────────────────────────────────
  const regionObjs  = safeObjects.filter(o => o?.lat && isInRegion(o.lat, o.lon, activeRegion))
  const critObjs    = regionObjs.filter(o => o.risk_level === 'CRITICAL')
  const highObjs    = regionObjs.filter(o => o.risk_level === 'HIGH')
  const regionLabel = REGION_LABELS[activeRegion] || 'All 5 States'

  return (
    <div className="relative w-full h-full" style={{ minHeight: 0 }}>

      {/* Pulse keyframes injected once */}
      <style>{`
        @keyframes critpulse {
          0%,100% { box-shadow: 0 0 6px #ef4444; }
          50%      { box-shadow: 0 0 18px #ef4444, 0 0 30px #ef444466; }
        }
        .ap-popup .leaflet-popup-content-wrapper {
          background: #0f172a !important;
          border: 1px solid #1e293b !important;
          border-radius: 10px !important;
          padding: 0 !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.7) !important;
          color: #e2e8f0 !important;
        }
        .ap-popup .leaflet-popup-tip { background: #0f172a !important; }
        .ap-popup .leaflet-popup-content { margin: 0 !important; }
        .ap-popup .leaflet-popup-close-button { color: #64748b !important; top: 8px !important; right: 8px !important; }
      `}</style>

      {/* ── CRITICAL BANNER ── */}
      {critObjs.length > 0 && (
        <div className="absolute top-0 left-0 right-0 z-[1100]"
          style={{ background: 'rgba(120,10,10,0.97)', borderBottom: '2px solid #ef4444', pointerEvents: 'none' }}>
          <div className="px-4 py-1.5 flex items-center gap-3">
            <span className="text-red-200 font-black text-xs tracking-widest animate-pulse">⚠ CRITICAL</span>
            <span className="text-red-300 text-xs font-mono truncate">{critObjs.map(o => o.object_id).join(' · ')}</span>
            {critObjs.some(o => o.in_restricted_zone) &&
              <span className="text-red-100 text-xs font-bold ml-auto flex-shrink-0">🚫 ZONE BREACH</span>}
          </div>
        </div>
      )}

      {/* ── HIGH BANNER ── */}
      {!critObjs.length && highObjs.length > 0 && (
        <div className="absolute top-0 left-0 right-0 z-[1100]"
          style={{ background: 'rgba(90,30,8,0.97)', borderBottom: '1px solid #f97316', pointerEvents: 'none' }}>
          <div className="px-4 py-1 flex items-center gap-3">
            <span className="text-orange-300 font-bold text-xs tracking-widest">⚡ HIGH RISK</span>
            <span className="text-orange-400 text-xs font-mono truncate">{highObjs.map(o => o.object_id).join(' · ')}</span>
          </div>
        </div>
      )}

      {/* ── MAP CONTAINER ── */}
      <div
        ref={mapRef}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      />

      {/* ── REGION BUTTONS ── */}
      <div className="absolute z-[1000] flex gap-1 flex-wrap"
        style={{ top: (critObjs.length || highObjs.length) ? 42 : 10, left: 10 }}>
        {Object.entries(REGION_VIEW).map(([key, r]) => (
          <button key={key} onClick={() => setActiveRegion(key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all
              ${activeRegion === key
                ? 'bg-blue-600/90 border-blue-500 text-white shadow-lg'
                : 'bg-gray-950/90 border-gray-600/60 text-gray-300 hover:bg-gray-800/90'}`}>
            {r.label}
          </button>
        ))}
      </div>

      {/* ── ZOOM CONTROLS ── */}
      <div className="absolute z-[1000] flex flex-col rounded-xl overflow-hidden border border-gray-700/60"
        style={{ top: 10, right: 10, background: 'rgba(8,14,26,0.95)' }}>
        <button onClick={() => leafletRef.current?.map.zoomIn(1)}
          className="w-9 h-9 flex items-center justify-center text-gray-300 hover:text-white hover:bg-blue-700/50 transition-all text-lg font-light border-b border-gray-700/50">
          +
        </button>
        <div className="text-center text-gray-600 font-mono py-0.5" style={{ fontSize: 9 }}>
          {zoomLevel}
        </div>
        <button onClick={() => leafletRef.current?.map.zoomOut(1)}
          className="w-9 h-9 flex items-center justify-center text-gray-300 hover:text-white hover:bg-blue-700/50 transition-all text-lg font-light border-t border-gray-700/50">
          −
        </button>
      </div>

      {/* ── LEGEND ── */}
      <div className="absolute z-[1000] rounded-xl p-3 text-xs"
        style={{ bottom: 36, left: 10, background: 'rgba(8,14,26,0.92)', border: '1px solid rgba(51,65,85,0.6)' }}>
        <p className="text-gray-500 font-bold uppercase tracking-widest mb-1.5" style={{ fontSize: 9 }}>RISK</p>
        {[['CRITICAL','#ef4444'],['HIGH','#f97316'],['MEDIUM','#eab308'],['LOW','#22c55e']].map(([l, c]) => (
          <div key={l} className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
            <span className="text-gray-400" style={{ fontSize: 10 }}>{l}</span>
          </div>
        ))}
      </div>

      {/* ── BOTTOM STATUS BAR ── */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center justify-between px-3 py-1"
        style={{ background: 'rgba(6,10,22,0.92)', borderTop: '1px solid rgba(51,65,85,0.4)' }}>
        <span className="text-green-400 text-xs font-bold">● LIVE</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-blue-400 font-mono font-bold">{safeObjects.length}</span>
          <span className="text-gray-600">objects</span>
          {critObjs.length > 0 && <span className="text-red-400 font-bold">🔴 {critObjs.length}</span>}
          {highObjs.length > 0 && <span className="text-orange-400">🟠 {highObjs.length}</span>}
          <span className="text-gray-700 border-l border-gray-700/50 pl-2">{regionLabel}</span>
        </div>
        <span className="text-gray-700 text-xs font-mono">z{zoomLevel}</span>
      </div>

    </div>
  )
}