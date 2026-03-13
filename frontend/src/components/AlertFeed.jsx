import { useAirspaceStore } from '../store/airspaceStore'
import { RiskBadge } from './Badges'
import { REGION_LABELS, isInRegion } from '../lib/regionBounds'
import { Bell, AlertTriangle, MapPin, Trash2 } from 'lucide-react'

export default function AlertFeed() {
  const { alerts, clearAlerts, selectObject, activeRegion } = useAirspaceStore()

  const filtered = alerts.filter(a =>
    !a.lat || isInRegion(a.lat, a.lon, activeRegion)
  )

  const criticalAlerts = filtered.filter(a => a.risk_level === 'CRITICAL')
  const otherAlerts    = filtered.filter(a => a.risk_level !== 'CRITICAL')

  return (
    <div className="h-full flex flex-col">
      <div className="panel-header">
        <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5 tracking-wide">
          <Bell size={12} />
          ALERT FEED
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${filtered.length > 0 ? 'text-red-400' : 'text-gray-500'}`}>
            {filtered.length} active
          </span>
          {filtered.length > 0 && (
            <button onClick={clearAlerts} className="text-gray-600 hover:text-gray-300 transition-colors" title="Clear alerts">
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-gray-700/40 flex items-center gap-1 text-xs text-blue-400">
        <MapPin size={10} />
        {REGION_LABELS[activeRegion] || 'All States'}
        <span className="text-gray-600 ml-auto">auto-detected</span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
        {filtered.length === 0 && (
          <div className="p-6 text-center flex flex-col items-center gap-2">
            <div className="text-2xl text-green-800">✓</div>
            <div className="text-green-600 font-bold text-sm">All Clear</div>
            <div className="text-gray-600 text-xs">No active alerts in region</div>
          </div>
        )}

        {/* CRITICAL first */}
        {criticalAlerts.map((alert, i) => (
          <button
            key={alert.id || `c${i}`}
            onClick={() => selectObject(alert.object_id)}
            className="w-full text-left px-3 py-2.5 bg-red-950/30 border-l-2 border-red-500 hover:bg-red-950/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-xs font-mono text-red-300 font-bold animate-pulse">
                🔴 {alert.object_id}
              </span>
              <RiskBadge level={alert.risk_level} />
            </div>
            <div className="text-xs text-red-200 mb-1 font-semibold">{alert.message}</div>
            <div className="text-xs text-red-400/60 flex gap-2">
              {alert.state_region && <span>📍 {alert.state_region}</span>}
              <span>Score: {alert.risk_score || '—'}</span>
              <span>{new Date(alert.ts).toLocaleTimeString()}</span>
            </div>
          </button>
        ))}

        {/* HIGH / MEDIUM */}
        {otherAlerts.map((alert, i) => (
          <button
            key={alert.id || `o${i}`}
            onClick={() => selectObject(alert.object_id)}
            className={`w-full text-left px-3 py-2.5 hover:bg-gray-800/50 transition-colors
              ${alert.risk_level === 'HIGH' ? 'border-l-2 border-orange-500 bg-orange-950/8' : 'border-l-2 border-transparent'}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className={`text-xs font-mono font-bold ${alert.risk_level === 'HIGH' ? 'text-orange-300' : 'text-gray-200'}`}>
                {alert.risk_level === 'HIGH' ? '🟠 ' : ''}{alert.object_id}
              </span>
              <RiskBadge level={alert.risk_level} />
            </div>
            <div className="text-xs text-gray-300 mb-1">{alert.message}</div>
            <div className="text-xs text-gray-600 flex gap-2">
              {alert.state_region && <span>📍 {alert.state_region}</span>}
              <span>{new Date(alert.ts).toLocaleTimeString()}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
