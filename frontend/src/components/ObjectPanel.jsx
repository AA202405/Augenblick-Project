import { useAirspaceStore } from '../store/airspaceStore'
import { RiskBadge, TypeBadge, resolveType } from './Badges'
import { REGION_LABELS } from '../lib/regionBounds'
import { Navigation, Gauge, Radio, MapPin } from 'lucide-react'

export default function ObjectPanel() {
  const { objects, selectedObjectId, selectObject, activeRegion, getRegionObjects } = useAirspaceStore()
  const filtered = getRegionObjects()
  const sorted   = [...filtered].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
  const critCount = sorted.filter(o => o.risk_level === 'CRITICAL').length
  const highCount = sorted.filter(o => o.risk_level === 'HIGH').length

  return (
    <div className="h-full flex flex-col">
      <div className="panel-header">
        <span className="text-xs font-bold text-gray-200 tracking-wide">LIVE OBJECTS</span>
        <span className="text-xs text-gray-500">{sorted.length} tracked</span>
      </div>

      <div className="px-3 py-1.5 border-b border-gray-700/40 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-blue-400">
          <MapPin size={10} />
          {REGION_LABELS[activeRegion] || 'All States'}
        </span>
        <div className="flex gap-2 text-xs">
          {critCount > 0 && <span className="text-red-400 font-bold animate-pulse-fast">{critCount} CRIT</span>}
          {highCount > 0 && <span className="text-orange-400 font-semibold">{highCount} HIGH</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
        {sorted.length === 0 && (
          <div className="p-6 text-center text-gray-600 text-sm">
            {objects.length === 0 ? (
              <>
                <div className="text-2xl mb-2 animate-spin-slow">⊕</div>
                <div>Connecting to simulation…</div>
              </>
            ) : (
              `No objects in ${REGION_LABELS[activeRegion] || 'this region'}`
            )}
          </div>
        )}

        {sorted.map(obj => {
          const type    = resolveType(obj)
          const isSel   = obj.object_id === selectedObjectId
          const isCrit  = obj.risk_level === 'CRITICAL'
          const isHigh  = obj.risk_level === 'HIGH'

          return (
            <button
              key={obj.object_id}
              onClick={() => selectObject(isSel ? null : obj.object_id)}
              className={`w-full text-left px-3 py-2.5 hover:bg-gray-800/60 transition-colors
                ${isSel  ? 'bg-gray-800/70 border-l-2 border-blue-500' : ''}
                ${isCrit && !isSel ? 'border-l-2 border-red-500 bg-red-950/15' : ''}
                ${isHigh && !isSel ? 'border-l-2 border-orange-500 bg-orange-950/10' : ''}
                ${!isSel && !isCrit && !isHigh ? 'border-l-2 border-transparent' : ''}`}
            >
              {/* Row 1: ID + badge */}
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-mono font-bold
                  ${isCrit ? 'text-red-300' : isHigh ? 'text-orange-300' : 'text-gray-100'}`}>
                  {isCrit ? '🔴 ' : isHigh ? '🟠 ' : ''}{obj.object_id}
                </span>
                <RiskBadge level={obj.risk_level || 'LOW'} />
              </div>

              {/* Row 2: type */}
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <TypeBadge type={type} />
                {obj.callsign && <span className="text-xs text-gray-500 truncate max-w-[80px]">✈ {obj.callsign}</span>}
                {obj.state_region && <span className="text-xs text-gray-600 truncate">📍 {obj.state_region}</span>}
              </div>

              {/* Row 3: telemetry */}
              <div className="grid grid-cols-3 gap-1 text-xs text-gray-400">
                <span className="flex items-center gap-0.5">
                  <Gauge size={9} />
                  {Math.round((obj.altitude || 0) * 3.281).toLocaleString()}ft
                </span>
                <span className="flex items-center gap-0.5">
                  <Navigation size={9} />
                  {Math.round((obj.velocity || 0) * 3.6)}km/h
                </span>
                <span className="flex items-center gap-0.5">
                  <Radio size={9} className={obj.callsign ? 'text-green-400' : 'text-red-400'} />
                  {obj.callsign ? 'ON' : 'OFF'}
                </span>
              </div>

              {/* Anomaly */}
              {obj.anomaly_type && obj.anomaly_type !== 'None' && (
                <div className="mt-1.5 text-xs text-yellow-400 font-semibold truncate">
                  ⚡ {obj.anomaly_type}
                </div>
              )}

              {/* Zone breach */}
              {obj.in_restricted_zone && (
                <div className="mt-1 text-xs text-red-400 font-bold bg-red-950/30 rounded px-1.5 py-0.5">
                  🚫 RESTRICTED ZONE
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
