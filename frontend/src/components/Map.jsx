import { useEffect, useRef, useState } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'
import { RISK_COLORS, TYPE_COLORS } from './Badges'
import {
  REGION_VIEW, REGION_BOUNDS, REGION_LABELS,
  getLeafletBounds, getRegionPolygon, isInRegion,
} from '../lib/regionBounds'

// Keep REGIONS export for any legacy imports
export const REGIONS = REGION_VIEW
export { REGION_BOUNDS }

if (typeof document !== 'undefined' && !document.getElementById('map-pulse-style')) {
  const style = document.createElement('style')
  style.id = 'map-pulse-style'
  style.textContent = `
    @keyframes criticalRing {
      0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.9), 0 0 20px rgba(239,68,68,0.6); }
      70%  { box-shadow: 0 0 0 14px rgba(239,68,68,0), 0 0 20px rgba(239,68,68,0.6); }
      100% { box-shadow: 0 0 0 0 rgba(239,68,68,0), 0 0 20px rgba(239,68,68,0.6); }
    }
    @keyframes highRing {
      0%   { box-shadow: 0 0 0 0 rgba(249,115,22,0.8), 0 0 12px rgba(249,115,22,0.5); }
      70%  { box-shadow: 0 0 0 10px rgba(249,115,22,0), 0 0 12px rgba(249,115,22,0.5); }
      100% { box-shadow: 0 0 0 0 rgba(249,115,22,0), 0 0 12px rgba(249,115,22,0.5); }
    }
    .critical-marker { animation: criticalRing 0.8s ease-out infinite !important; }
    .high-marker     { animation: highRing 1.2s ease-out infinite !important; }
    .critical-popup .leaflet-popup-content-wrapper {
      border: 2px solid #ef4444 !important;
      box-shadow: 0 0 16px rgba(239,68,68,0.5) !important;
    }
    .critical-popup .leaflet-popup-tip { background: #ef4444 !important; }
    .high-popup .leaflet-popup-content-wrapper {
      border: 2px solid #f97316 !important;
      box-shadow: 0 0 12px rgba(249,115,22,0.4) !important;
    }
    .high-popup .leaflet-popup-tip { background: #f97316 !important; }
  `
  document.head.appendChild(style)
}

function _markerFill(obj) {
  if (obj.risk_level === 'CRITICAL') return '#ef4444'
  if (obj.risk_level === 'HIGH')     return '#f97316'
  return TYPE_COLORS[obj.predicted_type || obj.object_type] || '#9ca3af'
}

export default function AirspaceMap() {
  const mapRef        = useRef(null)
  const leafletRef    = useRef(null)
  const markersRef    = useRef({})
  const trajRef       = useRef([])
  const boundaryRef   = useRef(null)   // boundary polygon layer
  const aliveRef      = useRef(false)

  const {
    objects, selectedObjectId, selectObject,
    activeRegion, setActiveRegion, getRegionObjects,
  } = useAirspaceStore()

  const [layers, setLayers] = useState({
    objects: true, zones: true, trajectories: true, labels: false,
  })
  const toggleLayer = (k) => setLayers(l => ({ ...l, [k]: !l[k] }))

  // ── Init map (runs once on mount) ─────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    aliveRef.current = true

    import('leaflet').then(L => {
      if (!aliveRef.current) return
      if (mapRef.current._leaflet_id) mapRef.current._leaflet_id = null

      const region = REGION_VIEW[activeRegion] || REGION_VIEW.all
      const map = L.map(mapRef.current, {
        center: region.center,
        zoom:   region.zoom,
        zoomControl: true,
        attributionControl: false,
        maxBoundsViscosity: 1.0,   // hard wall — cannot drag outside bounds
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 18,
      }).addTo(map)

      leafletRef.current = { map, L }

      // Apply initial bounds lock + boundary polygon
      _applyRegionLock(map, L, activeRegion, boundaryRef)

      if (layers.zones) _loadZones(L, map, aliveRef)
    })

    return () => {
      aliveRef.current = false
      if (leafletRef.current) {
        leafletRef.current.map.remove()
        leafletRef.current = null
        markersRef.current = {}
        boundaryRef.current = null
      }
    }
  }, [])   // mount once only

  // ── React to region changes — re-lock + re-center ─────────────────────────
  useEffect(() => {
    if (!leafletRef.current) return
    const { map, L } = leafletRef.current

    // Remove all existing markers (they belong to old region)
    Object.values(markersRef.current).forEach(({ marker }) => marker.remove())
    markersRef.current = {}

    // Clear trajectories
    trajRef.current.forEach(l => { try { l.remove() } catch {} })
    trajRef.current = []

    // Apply new bounds lock + boundary + fly to region
    _applyRegionLock(map, L, activeRegion, boundaryRef)

    const leafletBounds = getLeafletBounds(activeRegion)
    if (leafletBounds) {
      map.fitBounds(leafletBounds, { padding: [30, 30], maxZoom: 10 })
    }
  }, [activeRegion])

  // ── Update markers (runs on every objects tick) ───────────────────────────
  useEffect(() => {
    if (!leafletRef.current) return
    const { map, L } = leafletRef.current

    if (!layers.objects) {
      Object.values(markersRef.current).forEach(({ marker }) => map.removeLayer(marker))
      return
    }

    // Only render objects inside the active region
    const visibleObjects = objects.filter(o => isInRegion(o.lat, o.lon, activeRegion))

    const seen = new Set()
    visibleObjects.forEach(obj => {
      seen.add(obj.object_id)

      const isCritical = obj.risk_level === 'CRITICAL'
      const isHigh     = obj.risk_level === 'HIGH'
      const isSelected = obj.object_id === selectedObjectId
      const fillColor  = _markerFill(obj)
      const riskBorder = RISK_COLORS[obj.risk_level]?.text || '#ffffff'
      const size       = isSelected ? 24 : isCritical ? 18 : 14
      const ringClass  = isCritical ? 'critical-marker' : isHigh ? 'high-marker' : ''

      const icon = L.divIcon({
        className: '',
        html: `<div class="${ringClass}" style="
          width:${size}px;height:${size}px;
          background:${fillColor};
          border:2.5px solid ${riskBorder};
          border-radius:50%;
          cursor:pointer;position:relative;">
          ${layers.labels ? `<span style="position:absolute;top:-16px;left:50%;
            transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;
            font-size:9px;padding:1px 4px;border-radius:2px;white-space:nowrap;
            border:1px solid ${riskBorder};">${obj.object_id}</span>` : ''}
        </div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      })

      const popupClass = isCritical ? 'critical-popup' : isHigh ? 'high-popup' : ''

      if (markersRef.current[obj.object_id]) {
        const { marker } = markersRef.current[obj.object_id]
        marker.setLatLng([obj.lat, obj.lon])
        marker.setIcon(icon)
        marker.setPopupContent(_popupContent(obj))
        if ((isCritical || isHigh) && !marker.isPopupOpen()) marker.openPopup()
        if (!isCritical && !isHigh && marker.isPopupOpen() && obj.object_id !== selectedObjectId) {
          marker.closePopup()
        }
      } else {
        const marker = L.marker([obj.lat, obj.lon], { icon })
          .addTo(map)
          .bindPopup(_popupContent(obj), {
            maxWidth: 290,
            className: popupClass,
            autoClose: false,
            closeOnClick: false,
          })
          .on('click', () => selectObject(obj.object_id))
        markersRef.current[obj.object_id] = { marker }
        if (isCritical || isHigh) marker.openPopup()
      }
    })

    // Remove markers for objects now outside the region or gone
    Object.keys(markersRef.current).forEach(id => {
      if (!seen.has(id)) {
        markersRef.current[id].marker.remove()
        delete markersRef.current[id]
      }
    })

    // Trajectories for selected object
    trajRef.current.forEach(l => { try { l.remove() } catch {} })
    trajRef.current = []
    if (selectedObjectId && layers.trajectories) {
      const obj = visibleObjects.find(o => o.object_id === selectedObjectId)
      if (obj?.trajectory_predictions?.length) {
        const points = [
          [obj.lat, obj.lon],
          ...obj.trajectory_predictions.map(p => [p.lat, p.lon]),
        ]
        trajRef.current.push(
          L.polyline(points, { color: '#60a5fa', weight: 2, dashArray: '6,4', opacity: 0.85 }).addTo(map)
        )
        obj.trajectory_predictions.forEach(p => {
          const lbl = L.marker([p.lat, p.lon], {
            icon: L.divIcon({
              className: '',
              html: `<div style="background:rgba(30,58,138,0.85);color:#bfdbfe;
                font-size:9px;padding:2px 5px;border-radius:3px;
                border:1px solid #3b82f6;white-space:nowrap;">+${p.seconds_ahead}s</div>`,
              iconAnchor: [22, 8],
            })
          }).addTo(map)
          trajRef.current.push(lbl)
        })
      }
    }
  }, [objects, selectedObjectId, selectObject, layers, activeRegion])

  // Counts for alarm banner — region filtered
  const regionObjects  = getRegionObjects()
  const criticalObjs   = regionObjects.filter(o => o.risk_level === 'CRITICAL')
  const highObjs       = regionObjects.filter(o => o.risk_level === 'HIGH')
  const regionLabel    = REGION_LABELS[activeRegion] || 'All 5 States'

  return (
    <div className="relative w-full h-full">

      {/* ── ALARM BANNER ── */}
      {(criticalObjs.length > 0 || highObjs.length > 0) && (
        <div className="absolute top-0 left-0 right-0 z-[1100] pointer-events-none">
          {criticalObjs.length > 0 && (
            <div style={{
              background: 'linear-gradient(90deg,#7f1d1d,#991b1b,#7f1d1d)',
              borderBottom: '2px solid #ef4444',
            }} className="px-4 py-1.5 flex items-center gap-3">
              <span className="text-red-200 font-black text-xs tracking-widest animate-pulse">
                ⚠ CRITICAL — {regionLabel}
              </span>
              <span className="text-red-300 text-xs font-mono">
                {criticalObjs.map(o => o.object_id).join(' · ')}
              </span>
              {criticalObjs.some(o => o.zone_breach) && (
                <span className="text-red-200 text-xs font-bold">🚫 ZONE BREACH</span>
              )}
            </div>
          )}
          {highObjs.length > 0 && (
            <div style={{
              background: 'linear-gradient(90deg,#431407,#7c2d12,#431407)',
              borderBottom: '1px solid #f97316',
            }} className="px-4 py-1 flex items-center gap-3">
              <span className="text-orange-300 font-bold text-xs tracking-widest">
                ⚡ HIGH RISK — {regionLabel}
              </span>
              <span className="text-orange-400 text-xs font-mono">
                {highObjs.map(o => o.object_id).join(' · ')}
              </span>
            </div>
          )}
        </div>
      )}

      <div ref={mapRef} className="w-full h-full rounded-xl" />

      {/* Region selector */}
      <div className="absolute top-3 left-12 z-[1000] flex gap-1 flex-wrap max-w-[calc(100%-200px)]"
        style={{ marginTop: (criticalObjs.length > 0 || highObjs.length > 0) ? '52px' : '0' }}>
        {Object.entries(REGION_VIEW).map(([key, r]) => (
          <button key={key}
            onClick={() => setActiveRegion(key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border whitespace-nowrap
              ${activeRegion === key
                ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                : 'bg-gray-900/90 border-gray-600 text-gray-300 hover:bg-gray-700'}`}>
            {r.label || REGION_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Layer toggles */}
      <div className="absolute top-3 right-3 z-[1000] bg-gray-900/95 border border-gray-700 rounded-lg p-3 min-w-[130px]">
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mb-2">Layers</p>
        {[
          { key: 'objects',      label: '✈ Objects'      },
          { key: 'zones',        label: '🚫 Zones'        },
          { key: 'trajectories', label: '📍 Trajectories' },
          { key: 'labels',       label: '🏷 Labels'       },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer py-0.5">
            <input type="checkbox" checked={layers[key]}
              onChange={() => toggleLayer(key)} className="accent-blue-500 w-3 h-3" />
            <span className={`text-xs ${layers[key] ? 'text-gray-200' : 'text-gray-600'}`}>{label}</span>
          </label>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-gray-900/95 border border-gray-700 rounded-lg p-3 text-xs z-[1000]">
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mb-1.5">Type</p>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-2 mb-0.5">
            <div className="w-3 h-3 rounded-full border border-white/20" style={{ background: color }} />
            <span className="text-gray-300 capitalize">{type}</span>
          </div>
        ))}
        <div className="border-t border-gray-700 mt-2 pt-2">
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mb-1.5">Risk</p>
          {[
            { level: 'CRITICAL', color: '#ef4444' },
            { level: 'HIGH',     color: '#f97316' },
            { level: 'MEDIUM',   color: RISK_COLORS.MEDIUM?.text || '#fde68a' },
            { level: 'LOW',      color: RISK_COLORS.LOW?.text    || '#86efac' },
          ].map(({ level, color }) => (
            <div key={level} className="flex items-center gap-2 mb-0.5">
              <div className="w-3 h-3 rounded-full" style={{ background: color }} />
              <span className="text-gray-300">{level}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data source + region lock indicator */}
      <div className="absolute bottom-4 right-3 z-[1000] bg-gray-900/95 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs flex flex-col gap-1">
        <div className="flex gap-3">
          <span><span className="text-blue-400 font-bold">SIM</span> <span className="text-gray-500">Synthetic</span></span>
          <span><span className="text-green-400 font-bold">OS</span> <span className="text-gray-500">OpenSky</span></span>
        </div>
        <div className="text-gray-600 text-xs flex items-center gap-1">
          <span className="text-yellow-600">🔒</span>
          <span>Locked: {regionLabel}</span>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _applyRegionLock(map, L, activeRegion, boundaryRef) {
  // Remove old boundary polygon
  if (boundaryRef.current) {
    try { boundaryRef.current.remove() } catch {}
    boundaryRef.current = null
  }

  const leafletBounds = getLeafletBounds(activeRegion)
  if (!leafletBounds) return

  // Hard pan/zoom lock — user cannot go outside this region
  map.setMaxBounds(leafletBounds)
  map.options.minZoom = 5

  // Draw boundary polygon (dashed blue border around the locked region)
  const polygon = getRegionPolygon(activeRegion)
  if (polygon) {
    const isAll = activeRegion === 'all'
    boundaryRef.current = L.polygon(polygon, {
      color:       isAll ? '#1d4ed8' : '#3b82f6',
      weight:      isAll ? 1.5 : 2,
      fillOpacity: 0,
      dashArray:   isAll ? '8,6' : '6,4',
      opacity:     0.6,
    }).addTo(map)

    // Tooltip showing which region is locked
    if (!isAll) {
      boundaryRef.current.bindTooltip(
        `🔒 ${REGION_LABELS[activeRegion] || activeRegion}`,
        { permanent: false, sticky: true, className: 'text-xs' }
      )
    }
  }
}

function _popupContent(obj) {
  const type      = obj.predicted_type || obj.object_type || '?'
  const conf      = obj.clf_confidence ? `${(obj.clf_confidence * 100).toFixed(0)}%` : ''
  const source    = obj.source === 'opensky'
    ? '<span style="color:#4ade80;font-weight:bold">[OpenSky]</span>'
    : '<span style="color:#60a5fa">[Sim]</span>'
  const riskColor = obj.risk_level === 'CRITICAL' ? '#ef4444'
                  : obj.risk_level === 'HIGH'     ? '#f97316'
                  : RISK_COLORS[obj.risk_level]?.text || '#fff'
  return `
    <div style="font-family:monospace;font-size:12px;color:#e5e7eb;
                background:#111827;padding:10px;border-radius:6px;min-width:210px">
      <div style="font-weight:bold;font-size:13px;color:#f9fafb;margin-bottom:4px">
        ${obj.object_id} ${source}
      </div>
      ${obj.callsign ? `<div style="color:#9ca3af;margin-bottom:4px">✈ ${obj.callsign}</div>` : ''}
      <div style="color:${riskColor};font-weight:bold;font-size:13px;margin-bottom:6px">
        ${obj.risk_level === 'CRITICAL' ? '🔴' : obj.risk_level === 'HIGH' ? '🟠' : '●'}
        ${obj.risk_level} (score: ${obj.risk_score || 0})
      </div>
      <div>Type: <b style="color:${TYPE_COLORS[type]||'#fff'}">${type.toUpperCase()}</b> ${conf}</div>
      <div>Alt: ${(obj.altitude||0).toFixed(0)}m | Spd: ${(obj.speed||0).toFixed(0)} m/s</div>
      <div>Hdg: ${(obj.heading||0).toFixed(0)}° | VR: ${(obj.vertical_rate||0).toFixed(1)} m/s</div>
      <div>Xpdr: ${obj.transponder_signal ? '✅' : '❌'}</div>
      ${obj.zone_breach
        ? `<div style="color:#fca5a5;font-weight:bold;margin-top:6px;padding:4px 6px;
            background:#450a0a;border-radius:4px;border:1px solid #ef4444">
            🚫 ZONE BREACH: ${obj.zone_breach.zone_name}</div>`
        : ''}
      ${obj.anomaly_reasons?.length
        ? `<div style="color:#fcd34d;margin-top:4px;font-size:11px">
            ⚡ ${obj.anomaly_reasons.slice(0,2).join(', ')}</div>`
        : ''}
      ${obj.trajectory_predictions?.length
        ? `<div style="color:#93c5fd;margin-top:4px">
            📍 ${obj.trajectory_predictions.length} trajectory points</div>`
        : ''}
    </div>`
}

async function _loadZones(L, map, aliveRef) {
  try {
    const res   = await fetch('/api/zones')
    if (!aliveRef.current) return
    const zones = await res.json()
    if (!aliveRef.current) return
    zones.forEach(z => {
      if (!z.geojson) return
      const geojson = typeof z.geojson === 'string' ? JSON.parse(z.geojson) : z.geojson
      L.geoJSON(geojson, {
        style: { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.08, dashArray: '6,4' }
      }).addTo(map).bindTooltip(`🚫 ${z.name}`, { permanent: false, sticky: true })
    })
  } catch (e) {
    console.warn('Could not load zones', e)
  }
}