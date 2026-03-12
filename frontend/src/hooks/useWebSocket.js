import { useEffect, useRef, useCallback } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'

const WS_URL = `ws://${window.location.host}/live-feed`
const MAX_BACKOFF = 30000

export function useWebSocket(enabled = true) {
  const ws       = useRef(null)
  const backoff  = useRef(1000)
  const retryRef = useRef(null)
  const mounted  = useRef(true)

  const { setObjects, setConnected, setLastUpdate, addAlert } = useAirspaceStore()

  const connect = useCallback(() => {
    if (!mounted.current || !enabled) return
    try {
      ws.current = new WebSocket(WS_URL)

      ws.current.onopen = () => {
        if (!mounted.current) return
        setConnected(true)
        backoff.current = 1000
        console.log('[WS] Connected')
      }

      ws.current.onmessage = (evt) => {
        if (!mounted.current) return
        try {
          const msg = JSON.parse(evt.data)
          if (msg.type === 'ping') {
            ws.current?.send(JSON.stringify({ type: 'pong' }))
            return
          }
          if (msg.type === 'objects_update') {
            setObjects(msg.data || [])
            setLastUpdate()
            const urgent = (msg.data || []).filter(
              o => o.risk_level === 'CRITICAL' || o.risk_level === 'HIGH'
            )
            urgent.forEach(o => {
              if (o.zone_breach) {
                addAlert({
                  id: `${o.object_id}-zone-${o.zone_breach.zone_name}`,
                  object_id: o.object_id,
                  risk_level: o.risk_level,
                  alert_type: 'zone_breach',
                  message: `${o.object_id} entered ${o.zone_breach.zone_name}`,
                  created_at: new Date().toISOString(),
                })
              }
            })
          }
        } catch (e) {
          console.warn('[WS] Parse error', e)
        }
      }

      ws.current.onclose = () => {
        if (!mounted.current) return
        setConnected(false)
        console.warn(`[WS] Disconnected. Retrying in ${backoff.current}ms`)
        retryRef.current = setTimeout(() => {
          backoff.current = Math.min(backoff.current * 2, MAX_BACKOFF)
          connect()
        }, backoff.current)
      }

      ws.current.onerror = () => { ws.current?.close() }

    } catch (e) {
      console.error('[WS] Connection error', e)
      retryRef.current = setTimeout(connect, backoff.current)
    }
  }, [enabled, setObjects, setConnected, setLastUpdate, addAlert])

  useEffect(() => {
    mounted.current = true
    if (enabled) connect()
    return () => {
      mounted.current = false
      clearTimeout(retryRef.current)
      ws.current?.close()
      setConnected(false)
    }
  }, [connect, enabled])
}