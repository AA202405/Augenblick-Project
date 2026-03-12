import { useAirspaceStore } from '../store/airspaceStore'
import { RiskBadge, TypeBadge } from './Badges'
import { Radio, Navigation, Gauge, MapPin } from 'lucide-react'
import { REGION_BOUNDS, REGION_LABELS, isInRegion } from '../lib/regionBounds'



export default function ObjectPanel() {
  const { objects, selectedObjectId, selectObject, activeRegion } = useAirspaceStore()

  const filtered = objects.filter(o => isInRegion(o.lat, o.lon, activeRegion))
  const sorted   = [...filtered].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))

  const criticalCount = sorted.filter(o => o.risk_level === 'CRITICAL').length
  const highCount     = sorted.filter(o => o.risk_level === 'HIGH').length

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header">
        <span className="text-sm font-semibold text-gray-200">Live Objects</span>
        <span className="text-xs text-gray-500">{sorted.length} active</span>
      </div>

      {/* Region filter indicator */}
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-blue-400">
          <MapPin size={10} />
          {REGION_LABELS[activeRegion] || 'All 5 States'}
        </span>
        <div className="flex gap-2 text-xs">
          {criticalCount > 0 && (
            <span className="text-red-400 font-bold animate-pulse">{criticalCount} CRIT</span>
          )}
          {highCount > 0 && (
            <span className="text-orange-400 font-semibold">{highCount} HIGH</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
        {sorted.length === 0 && (
          <div className="p-4 text-center text-gray-600 text-sm">
            {objects.length === 0 ? 'Waiting for data...' : `No objects in ${REGION_LABELS[activeRegion] || 'this region'}`}
          </div>
        )}
        {sorted.map(obj => {
          const type       = obj.predicted_type || obj.object_type
          const isSelected = obj.object_id === selectedObjectId
          const isCritical = obj.risk_level === 'CRITICAL'
          const isHigh     = obj.risk_level === 'HIGH'

          return (
            <button
              key={obj.object_id}
              onClick={() => selectObject(isSelected ? null : obj.object_id)}
              className={`w-full text-left px-3 py-2.5 hover:bg-gray-800 transition-colors
                ${isSelected ? 'bg-gray-800 border-l-2 border-blue-500' : ''}
                ${isCritical ? 'border-l-2 border-red-500 bg-red-950/20' : ''}
                ${isHigh && !isSelected ? 'border-l-2 border-orange-500 bg-orange-950/10' : ''}`}
            >
              {/* Row 1: ID + risk badge */}
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-mono font-bold
                  ${isCritical ? 'text-red-300' : isHigh ? 'text-orange-300' : 'text-gray-100'}`}>
                  {isCritical ? '🔴 ' : isHigh ? '🟠 ' : ''}{obj.object_id}
                </span>
                <RiskBadge level={obj.risk_level || 'LOW'} />
              </div>

              {/* Row 2: type + source badge */}
              <div className="flex items-center gap-2 mb-1.5">
                <TypeBadge type={type} />
                {obj.clf_confidence && (
                  <span className="text-xs text-gray-500">
                    {(obj.clf_confidence * 100).toFixed(0)}%
                  </span>
                )}
                {obj.source === 'opensky' && (
                  <span className="text-xs text-green-500 font-bold">OS</span>
                )}
              </div>

              {/* Row 3: telemetry */}
              <div className="grid grid-cols-3 gap-1 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Gauge size={10} />
                  {(obj.altitude || 0).toFixed(0)}m
                </span>
                <span className="flex items-center gap-1">
                  <Navigation size={10} />
                  {(obj.speed || 0).toFixed(0)}m/s
                </span>
                <span className="flex items-center gap-1">
                  <Radio size={10} className={obj.transponder_signal ? 'text-green-400' : 'text-red-400'} />
                  {obj.transponder_signal ? 'ON' : 'OFF'}
                </span>
              </div>

              {/* Zone breach */}
              {obj.zone_breach && (
                <div className="mt-1.5 text-xs text-red-400 font-bold bg-red-950/40 rounded px-1.5 py-0.5">
                  🚫 {obj.zone_breach.zone_name}
                </div>
              )}

              {/* Anomaly reasons */}
              {obj.anomaly_reasons?.length > 0 && (
                <div className="mt-1 text-xs text-yellow-500 truncate">
                  ⚡ {obj.anomaly_reasons[0]}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}