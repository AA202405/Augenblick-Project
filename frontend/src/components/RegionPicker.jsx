import { useState } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'
import { MapPin, Plane, ChevronRight } from 'lucide-react'

const REGIONS = [
  {
    id: 'all', icon: '🗺️', label: 'All 5 States', sub: 'Full coverage area',
    desc: 'Monitor all 20 objects across Maharashtra, Goa, Telangana, Gujarat & Delhi/NCR',
    stats: { objects: '20', zones: '5 restricted', tick: '2s' }, color: 'blue',
  },
  {
    id: 'maharashtra', icon: '🏙️', label: 'Maharashtra', sub: 'Mumbai · Pune · Nagpur',
    desc: 'Mumbai TMA (CRITICAL) · Commercial routes · EMS helicopters · Bird corridors',
    stats: { objects: '~7', zones: '1 critical', airports: '6+' }, color: 'orange',
  },
  {
    id: 'goa', icon: '🏖️', label: 'Goa', sub: 'Panaji · Vasco',
    desc: 'Goa Naval Airspace (CRITICAL) · Tourist helicopter loop · Delivery drone',
    stats: { objects: '~3', zones: '1 critical', airports: '1' }, color: 'green',
  },
  {
    id: 'telangana', icon: '🏰', label: 'Telangana', sub: 'Hyderabad',
    desc: 'Hyderabad ATC Zone (HIGH) · Anomalous drone · Commercial routes',
    stats: { objects: '~4', zones: '1 high', airports: '2' }, color: 'yellow',
  },
  {
    id: 'gujarat', icon: '⚓', label: 'Gujarat', sub: 'Ahmedabad · Surat',
    desc: 'Ahmedabad TMA (HIGH) · Unknown no-transponder objects · IAF helicopter',
    stats: { objects: '~4', zones: '1 high', airports: '3' }, color: 'cyan',
  },
  {
    id: 'delhi', icon: '🏛️', label: 'Delhi / NCR', sub: 'Delhi TMA',
    desc: 'Delhi TMA (CRITICAL) · No-transponder unknown · High-traffic commercial',
    stats: { objects: '~3', zones: '1 critical', airports: '1' }, color: 'purple',
  },
]

const COLOR_MAP = {
  blue:   { border: 'border-blue-600/50',   bg: 'bg-blue-900/20',   text: 'text-blue-400',   badge: 'bg-blue-900/40 text-blue-300'    },
  orange: { border: 'border-orange-600/50', bg: 'bg-orange-900/20', text: 'text-orange-400', badge: 'bg-orange-900/40 text-orange-300' },
  green:  { border: 'border-green-600/50',  bg: 'bg-green-900/20',  text: 'text-green-400',  badge: 'bg-green-900/40 text-green-300'  },
  yellow: { border: 'border-yellow-600/50', bg: 'bg-yellow-900/20', text: 'text-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300' },
  cyan:   { border: 'border-cyan-600/50',   bg: 'bg-cyan-900/20',   text: 'text-cyan-400',   badge: 'bg-cyan-900/40 text-cyan-300'    },
  purple: { border: 'border-purple-600/50', bg: 'bg-purple-900/20', text: 'text-purple-400', badge: 'bg-purple-900/40 text-purple-300' },
}

export default function RegionPicker() {
  const [selected, setSelected] = useState(null)
  const { setActiveRegion } = useAirspaceStore()

  const handleLaunch = () => {
    if (!selected) return
    setActiveRegion(selected)
  }

  return (
    <div className="fixed inset-0 z-[9998] bg-gray-950 flex flex-col overflow-auto">
      <div className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(59,130,246,0.3) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.3) 1px,transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative z-10 flex flex-col min-h-full px-6 py-8 max-w-5xl mx-auto w-full">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-700/20 border border-blue-600/40 rounded-xl mb-3">
            <MapPin size={22} className="text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-wider">SELECT AIRSPACE REGION</h1>
          <p className="text-gray-500 text-sm mt-1">
            airspace_simulation · 20 objects · 5 states · 2-second WebSocket feed
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
          {REGIONS.map(region => {
            const c = COLOR_MAP[region.color]
            const isSel = selected === region.id
            return (
              <button
                key={region.id}
                onClick={() => setSelected(region.id)}
                className={`text-left p-5 rounded-xl border-2 transition-all duration-200
                  ${isSel
                    ? `${c.border} ${c.bg} shadow-lg scale-[1.02]`
                    : 'border-gray-800 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-800/50'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{region.icon}</span>
                  {isSel && (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${c.border} ${c.bg}`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${c.text.replace('text-', 'bg-')}`} />
                    </div>
                  )}
                </div>
                <h3 className={`font-bold text-base mb-0.5 ${isSel ? c.text : 'text-gray-200'}`}>{region.label}</h3>
                <p className="text-xs text-gray-500 mb-2">{region.sub}</p>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">{region.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(region.stats).map(([k, v]) => (
                    <span key={k} className={`text-xs px-2 py-0.5 rounded-full ${isSel ? c.badge : 'bg-gray-800 text-gray-500'}`}>
                      {v}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-8 flex justify-center">
          <button
            onClick={handleLaunch}
            disabled={!selected}
            className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed px-10 py-3.5 rounded-xl font-bold tracking-wider text-sm transition-all shadow-lg shadow-blue-900/40"
          >
            <Plane size={16} />
            LAUNCH MONITOR
            <ChevronRight size={16} />
          </button>
        </div>
        <p className="text-center text-xs text-gray-700 mt-3">
          You can switch regions anytime from the map buttons
        </p>
      </div>
    </div>
  )
}
