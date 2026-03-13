/**
 * useWebSocket.js
 * Connects to airspace_simulation.zip's /ws endpoint.
 *
 * Message types from backend:
 *   "init"        – sent once on connect (full state)
 *   "auto_update" – sent every 2s (tick, objects, anomalies, risk_scores)
 *
 * Each object has:
 *   object_id, callsign, object_type, lat, lon, altitude, velocity, heading,
 *   vertical_rate, risk_level, risk_score, is_anomaly, anomaly_type,
 *   state_region, in_restricted_zone, history[], predicted_path[]
 *
 * Operator can send:
 *   { type: "query",   text: "..." }
 *   { type: "explain", object_id: "..." }
 */
import { useEffect, useRef, useCallback } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'
const WS_URL = `ws://${window.location.host}/ws`
const MAX_BACKOFF = 20000

/**
 * Normalize raw backend object → consistent shape for all UI components.
 * Handles both old field names (latitude/longitude, historical_path)
 * and new ones (lat/lon, history) gracefully.
 */
function normalizeObject(o) {
  // Coordinates
  const lat = o.lat ?? o.latitude ?? 0
  const lon = o.lon ?? o.longitude ?? 0
  // Altitude
  const altitude = o.altitude ?? o.baro_altitude ?? o.geo_altitude ?? 0
  // History trail  (backend key varies: history / historical_path)
  const history = Array.isArray(o.history) ? o.history
    : Array.isArray(o.historical_path) ? o.historical_path
    : []
  // Predicted path (future_trajectory / predicted_path)
  const predicted_path = Array.isArray(o.predicted_path) ? o.predicted_path
    : Array.isArray(o.future_trajectory) ? o.future_trajectory
    : []
  // Waypoints
  const waypoints = Array.isArray(o.waypoints) ? o.waypoints : []
  // Source / destination — backend sometimes sends a string "static_simulation"
  const source = o.source && typeof o.source === 'object' ? o.source : null
  const destination = o.destination && typeof o.destination === 'object' ? o.destination : null

  return {
    ...o,
    lat,
    lon,
    altitude,
    history,
    predicted_path,
    waypoints,
    source,
    destination,
    // Ensure these always exist with safe defaults
    risk_level:           o.risk_level || 'LOW',
    risk_score:           o.risk_score ?? 0,
    heading:              o.heading ?? o.true_track ?? 0,
    velocity:             o.velocity ?? 0,
    vertical_rate:        o.vertical_rate ?? 0,
    is_anomaly:           o.is_anomaly ?? o.anomaly_active ?? false,
    anomaly_type:         o.anomaly_type || o.anomaly_label || 'Normal',
    in_restricted_zone:   o.in_restricted_zone ?? false,
    restricted_zone_name: o.restricted_zone_name ?? null,
    callsign:             o.callsign || '',
    object_type:          o.object_type || 'unknown',
    state_region:         o.state_region || '',
    route_progress:       o.route_progress ?? 0,
  }
}

export function useWebSocket() {
  const ws       = useRef(null)
  const backoff  = useRef(1000)
  const retryRef = useRef(null)
  const mounted  = useRef(true)
  const prevRisk = useRef({})

  const {
    setObjects, setConnected, setLastUpdate,
    addAlert, voiceMuted, voiceVolume,
  } = useAirspaceStore()

  const _speak = useCallback((text, level) => {
    if (voiceMuted || !window.speechSynthesis) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate   = level === 'CRITICAL' ? 1.2 : 1.0
    u.pitch  = level === 'CRITICAL' ? 1.4 : 1.1
    u.volume = voiceVolume
    u.lang   = 'en-IN'
    if (level === 'CRITICAL') window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }, [voiceMuted, voiceVolume])

  const connect = useCallback(() => {
    if (!mounted.current) return
    try {
      ws.current = new WebSocket(WS_URL)

      ws.current.onopen = () => {
        if (!mounted.current) return
        setConnected(true)
        backoff.current = 1000
        console.log('[WS] Connected to airspace_simulation /ws')
      }

      ws.current.onmessage = (evt) => {
        if (!mounted.current) return
        try {
          const msg = JSON.parse(evt.data)

          // Both "init" and "auto_update" carry objects
          if (msg.objects) {
            const normalized = msg.objects.map(normalizeObject)
            setObjects(normalized)
            setLastUpdate(msg.tick || 0)

            // Detect new CRITICAL/HIGH — fire voice + alert
            normalized.forEach(o => {
              const prev = prevRisk.current[o.object_id]
              if (
                (o.risk_level === 'CRITICAL' || o.risk_level === 'HIGH') &&
                prev !== o.risk_level
              ) {
                const text = o.risk_level === 'CRITICAL'
                  ? `Critical alert. Object ${o.object_id}. ${o.anomaly_type || 'risk threshold exceeded'}. Immediate action required.`
                  : `Warning. Object ${o.object_id} elevated risk. ${o.anomaly_type || ''}.`
                _speak(text, o.risk_level)

                addAlert({
                  id:         `${o.object_id}-${o.risk_level}-${Date.now()}`,
                  object_id:  o.object_id,
                  callsign:   o.callsign,
                  risk_level: o.risk_level,
                  anomaly_type: o.anomaly_type,
                  state_region: o.state_region,
                  risk_score:  o.risk_score,
                  in_restricted_zone: o.in_restricted_zone,
                  message: o.in_restricted_zone
                    ? `${o.object_id} ENTERED RESTRICTED ZONE`
                    : `${o.object_id} — ${o.anomaly_type || o.risk_level}`,
                  ts: Date.now(),
                })
              }
              prevRisk.current[o.object_id] = o.risk_level
            })
          }

          // query / explain responses sent back over WS
          if (msg.type === 'query_response' || msg.type === 'explain_response') {
            window.dispatchEvent(new CustomEvent('ws_agent_response', { detail: msg }))
          }

        } catch (e) {
          console.warn('[WS] parse error', e)
        }
      }

      ws.current.onclose = () => {
        if (!mounted.current) return
        setConnected(false)
        console.warn(`[WS] closed – retry in ${backoff.current}ms`)
        retryRef.current = setTimeout(() => {
          backoff.current = Math.min(backoff.current * 2, MAX_BACKOFF)
          connect()
        }, backoff.current)
      }

      ws.current.onerror = () => ws.current?.close()

    } catch (e) {
      console.error('[WS] connection error', e)
      retryRef.current = setTimeout(connect, backoff.current)
    }
  }, [setObjects, setConnected, setLastUpdate, addAlert, _speak])

  // Expose send function globally so AIPanel can use it
  useEffect(() => {
    window._wsSend = (data) => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(data))
        return true
      }
      return false
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    connect()
    return () => {
      mounted.current = false
      clearTimeout(retryRef.current)
      ws.current?.close()
      setConnected(false)
    }
  }, [connect])
}