import { useEffect } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'
import { RiskBadge } from './Badges'
import { getAlerts } from '../api/client'
import { Bell, AlertTriangle, MapPin } from 'lucide-react'
import { REGION_LABELS, isInRegion } from '../lib/regionBounds'


function _alertInRegion(alert, objects, region) {
  const obj = objects.find(o => o.object_id === alert.object_id)
  if (!obj) return true   // no position data — include by default
  return isInRegion(obj.lat, obj.lon, region)
}

export default function AlertFeed() {
  const { alerts, setAlerts, selectObject, objects, activeRegion } = useAirspaceStore()

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await getAlerts(100)
        setAlerts(data)
      } catch (e) {
        console.warn('Could not fetch alerts', e)
      }
    }
    fetch()
    const interval = setInterval(fetch, 5000)
    return () => clearInterval(interval)
  }, [setAlerts])

  const filtered = alerts.filter(a => _alertInRegion(a, objects, activeRegion))
  const criticalAlerts = filtered.filter(a => a.risk_level === 'CRITICAL')
  const otherAlerts    = filtered.filter(a => a.risk_level !== 'CRITICAL')

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header">
        <span className="text-sm font-semibold text-gray-200 flex items-center gap-1.5">
          <Bell size={14} />
          Alert Feed
        </span>
        <span className="text-xs text-gray-500">{filtered.length} active</span>
      </div>

      {/* Region filter indicator */}
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-1 text-xs text-blue-400">
        <MapPin size={10} />
        {REGION_LABELS[activeRegion] || 'All 5 States'}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
        {filtered.length === 0 && (
          <div className="p-4 text-center text-gray-600 text-sm flex flex-col items-center gap-2">
            <AlertTriangle size={20} className="text-gray-700" />
            No active alerts
            {activeRegion && activeRegion !== 'all' && (
              <span className="text-xs">in {REGION_LABELS[activeRegion]}</span>
            )}
          </div>
        )}

        {/* CRITICAL alerts on top with red background */}
        {criticalAlerts.map((alert, i) => (
          <button
            key={alert.id || `c-${i}`}
            onClick={() => selectObject(alert.object_id)}
            className="w-full text-left px-3 py-2.5 bg-red-950/40 border-l-2 border-red-500 hover:bg-red-950/60 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-xs font-mono text-red-300 font-bold animate-pulse">
                🔴 {alert.object_id}
              </span>
              <RiskBadge level={alert.risk_level} />
            </div>
            <div className="text-xs text-red-200 mb-1 font-semibold">{alert.message}</div>
            <div className="text-xs text-red-400/70">
              {alert.created_at
                ? new Date(alert.created_at).toLocaleTimeString()
                : 'Now'}
              {' · '}{alert.alert_type?.replace(/_/g, ' ')}
            </div>
          </button>
        ))}

        {/* Other alerts */}
        {otherAlerts.map((alert, i) => (
          <button
            key={alert.id || `o-${i}`}
            onClick={() => selectObject(alert.object_id)}
            className={`w-full text-left px-3 py-2.5 hover:bg-gray-800 transition-colors
              ${alert.risk_level === 'HIGH' ? 'border-l-2 border-orange-500 bg-orange-950/10' : ''}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className={`text-xs font-mono font-bold
                ${alert.risk_level === 'HIGH' ? 'text-orange-300' : 'text-gray-200'}`}>
                {alert.risk_level === 'HIGH' ? '🟠 ' : ''}{alert.object_id}
              </span>
              <RiskBadge level={alert.risk_level} />
            </div>
            <div className="text-xs text-gray-300 mb-1">{alert.message}</div>
            <div className="text-xs text-gray-600">
              {alert.created_at
                ? new Date(alert.created_at).toLocaleTimeString()
                : 'Now'}
              {' · '}{alert.alert_type?.replace(/_/g, ' ')}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}