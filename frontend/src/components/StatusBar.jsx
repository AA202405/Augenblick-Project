import { useAirspaceStore } from '../store/airspaceStore'
import { REGION_LABELS } from '../lib/regionBounds'
import { Wifi, WifiOff, AlertOctagon, Volume2, VolumeX } from 'lucide-react'

export default function StatusBar() {
  const {
    connected, lastUpdate, tick,
    voiceMuted, toggleMute, voiceVolume, setVolume,
    activeRegion, getRegionObjects,
  } = useAirspaceStore()

  const objs     = getRegionObjects()
  const critical = objs.filter(o => o.risk_level === 'CRITICAL').length
  const high     = objs.filter(o => o.risk_level === 'HIGH').length
  const medium   = objs.filter(o => o.risk_level === 'MEDIUM').length
  const anomalies = objs.filter(o => o.is_anomaly).length
  const regionLabel = REGION_LABELS[activeRegion] || 'All 5 States'

  return (
    <div
      className={`h-9 flex items-center justify-between px-4 text-xs font-mono border-b flex-shrink-0 transition-colors duration-300
        ${critical > 0
          ? 'bg-red-950/50 border-red-800 animate-pulse'
          : connected
            ? 'bg-gray-900/80 border-gray-700/60'
            : 'bg-red-950/30 border-red-900/60'}`}
    >
      {/* Left */}
      <div className="flex items-center gap-4">
        {connected ? (
          <span className="flex items-center gap-1.5 text-green-400 font-bold">
            <Wifi size={12} />
            LIVE
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-red-400 font-bold animate-pulse">
            <WifiOff size={12} />
            OFFLINE
          </span>
        )}
        <span className="text-blue-400 font-semibold">{regionLabel}</span>
        {tick > 0 && <span className="text-gray-600 hidden md:block">TICK #{tick}</span>}
        {lastUpdate && (
          <span className="text-gray-600 hidden lg:block">
            {new Date(lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Centre */}
      <div className="flex items-center gap-4">
        <span className="text-gray-400">{objs.length} objects</span>
        {critical > 0 && (
          <span className="flex items-center gap-1 text-red-300 font-black tracking-wider animate-flash">
            <AlertOctagon size={11} />
            {critical} CRITICAL
          </span>
        )}
        {high > 0 && (
          <span className="text-orange-400 font-bold">{high} HIGH</span>
        )}
        {medium > 0 && (
          <span className="text-yellow-600 hidden sm:block">{medium} MED</span>
        )}
        {anomalies > 0 && (
          <span className="text-yellow-500 hidden md:block">⚡ {anomalies} anomalies</span>
        )}
        {critical === 0 && high === 0 && objs.length > 0 && (
          <span className="text-green-600">✓ Nominal</span>
        )}
      </div>

      {/* Right — voice */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMute}
          className="text-gray-500 hover:text-gray-200 transition-colors"
          title={voiceMuted ? 'Unmute voice alerts' : 'Mute voice alerts'}
        >
          {voiceMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <input
          type="range" min="0" max="1" step="0.1"
          value={voiceVolume}
          onChange={e => setVolume(parseFloat(e.target.value))}
          className="w-14 accent-blue-500 hidden sm:block"
        />
        <span className="text-gray-600 hidden sm:block text-xs">VOL</span>
      </div>
    </div>
  )
}
