import { useAirspaceStore } from '../store/airspaceStore'
import { Wifi, WifiOff, Volume2, VolumeX, AlertOctagon } from 'lucide-react'
import { REGION_LABELS } from '../lib/regionBounds'

export default function StatusBar() {
  const {
    connected, lastUpdate, voiceMuted, toggleMute,
    voiceVolume, setVolume, activeRegion, getRegionObjects,
  } = useAirspaceStore()

  // All counts come from region-filtered objects only
  const regionObjects = getRegionObjects()
  const total    = regionObjects.length
  const critical = regionObjects.filter(o => o.risk_level === 'CRITICAL').length
  const high     = regionObjects.filter(o => o.risk_level === 'HIGH').length
  const medium   = regionObjects.filter(o => o.risk_level === 'MEDIUM').length

  const regionLabel = REGION_LABELS[activeRegion] || 'All 5 States'

  return (
    <div className={`h-10 flex items-center justify-between px-4 text-xs font-mono border-b flex-shrink-0
      ${critical > 0
        ? 'bg-red-950/60 border-red-800 animate-pulse'
        : connected
          ? 'bg-gray-900 border-gray-700'
          : 'bg-red-950 border-red-700'}`}>

      {/* Left: connection + region */}
      <div className="flex items-center gap-3">
        {connected ? (
          <span className="flex items-center gap-1.5 text-green-400">
            <Wifi size={13} />
            LIVE
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-red-400 font-bold">
            <WifiOff size={13} />
            DISCONNECTED
          </span>
        )}
        <span className="text-blue-400 font-semibold">{regionLabel}</span>
        {lastUpdate && (
          <span className="text-gray-600 hidden md:block">
            {new Date(lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Centre: risk counts — region only */}
      <div className="flex items-center gap-3">
        <span className="text-gray-400">{total} objects</span>
        {critical > 0 && (
          <span className="flex items-center gap-1 text-red-300 font-black tracking-wider animate-pulse">
            <AlertOctagon size={12} />
            {critical} CRITICAL
          </span>
        )}
        {high > 0 && (
          <span className="text-orange-400 font-bold">{high} HIGH</span>
        )}
        {medium > 0 && (
          <span className="text-yellow-600">{medium} MED</span>
        )}
        {critical === 0 && high === 0 && total > 0 && (
          <span className="text-green-600">✓ Nominal</span>
        )}
      </div>

      {/* Right: voice controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMute}
          className="text-gray-400 hover:text-white transition-colors"
          title={voiceMuted ? 'Unmute alerts' : 'Mute alerts'}
        >
          {voiceMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <input
          type="range" min="0" max="1" step="0.1"
          value={voiceVolume}
          onChange={e => setVolume(parseFloat(e.target.value))}
          className="w-16 accent-blue-500"
        />
        <span className="text-gray-500">VOL</span>
      </div>
    </div>
  )
}