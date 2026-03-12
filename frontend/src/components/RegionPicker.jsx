import { useState } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'
import { MapPin, Plane, Shield, Radio, ChevronRight } from 'lucide-react'

const REGIONS = [
  {
    id: 'all',
    label: 'All 5 States',
    sublabel: 'Full coverage area',
    description: 'Monitor entire airspace across Maharashtra, Goa, Karnataka, Telangana & Gujarat',
    stats: { area: '~800,000 km²', zones: '7 restricted', airports: '15+' },
    color: 'blue',
    icon: '🗺️',
  },
  {
    id: 'maharashtra',
    label: 'Maharashtra',
    sublabel: 'Mumbai · Pune · Nashik',
    description: 'High-density airspace with Mumbai CSIA, Pune Air Base and BARC exclusion zones',
    stats: { area: '307,713 km²', zones: '3 restricted', airports: '6' },
    color: 'orange',
    icon: '🏙️',
  },
  {
    id: 'goa',
    label: 'Goa',
    sublabel: 'Panaji · Vasco',
    description: 'Coastal airspace with INS Hansa naval air station and Dabolim airport',
    stats: { area: '3,702 km²', zones: '1 restricted', airports: '2' },
    color: 'green',
    icon: '🏖️',
  },
  {
    id: 'karnataka',
    label: 'Karnataka',
    sublabel: 'Bengaluru · Karwar',
    description: 'Tech hub airspace with Karwar Naval Base (INS Kadamba) exclusion zone',
    stats: { area: '191,791 km²', zones: '1 restricted', airports: '5' },
    color: 'purple',
    icon: '🌿',
  },
  {
    id: 'telangana',
    label: 'Telangana',
    sublabel: 'Hyderabad · Secunderabad',
    description: 'Hyderabad Begumpet airport zone and growing drone activity corridor',
    stats: { area: '112,077 km²', zones: '1 restricted', airports: '3' },
    color: 'yellow',
    icon: '🏰',
  },
  {
    id: 'gujarat',
    label: 'Gujarat',
    sublabel: 'Ahmedabad · Surat · Rajkot',
    description: 'Western coastal airspace with industrial corridors and border proximity',
    stats: { area: '196,024 km²', zones: '0 restricted', airports: '5' },
    color: 'cyan',
    icon: '⚓',
  },
]

const COLOR_MAP = {
  blue:   { border: 'border-blue-600/50',   bg: 'bg-blue-900/20',   text: 'text-blue-400',   badge: 'bg-blue-900/40 text-blue-300'   },
  orange: { border: 'border-orange-600/50', bg: 'bg-orange-900/20', text: 'text-orange-400', badge: 'bg-orange-900/40 text-orange-300' },
  green:  { border: 'border-green-600/50',  bg: 'bg-green-900/20',  text: 'text-green-400',  badge: 'bg-green-900/40 text-green-300'  },
  purple: { border: 'border-purple-600/50', bg: 'bg-purple-900/20', text: 'text-purple-400', badge: 'bg-purple-900/40 text-purple-300' },
  yellow: { border: 'border-yellow-600/50', bg: 'bg-yellow-900/20', text: 'text-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300' },
  cyan:   { border: 'border-cyan-600/50',   bg: 'bg-cyan-900/20',   text: 'text-cyan-400',   badge: 'bg-cyan-900/40 text-cyan-300'   },
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

      {/* Background grid */}
      <div className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(59,130,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      <div className="relative z-10 flex flex-col min-h-full px-6 py-8 max-w-5xl mx-auto w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-700/20 border border-blue-600/40 rounded-xl mb-3">
            <MapPin size={22} className="text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-wider">SELECT AIRSPACE REGION</h1>
          <p className="text-gray-500 text-sm mt-1">Choose the region you want to monitor</p>
        </div>

        {/* Region grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
          {REGIONS.map(region => {
            const c = COLOR_MAP[region.color]
            const isSelected = selected === region.id
            return (
              <button
                key={region.id}
                onClick={() => setSelected(region.id)}
                className={`text-left p-5 rounded-xl border-2 transition-all duration-200
                  ${isSelected
                    ? `${c.border} ${c.bg} shadow-lg scale-[1.02]`
                    : 'border-gray-800 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-800/50'
                  }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{region.icon}</span>
                  {isSelected && (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${c.bg} border ${c.border}`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${c.text.replace('text-', 'bg-')}`} />
                    </div>
                  )}
                </div>

                <h3 className={`font-bold text-base mb-0.5 ${isSelected ? c.text : 'text-gray-200'}`}>
                  {region.label}
                </h3>
                <p className="text-xs text-gray-500 mb-2">{region.sublabel}</p>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">{region.description}</p>

                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(region.stats).map(([k, v]) => (
                    <span key={k} className={`text-xs px-2 py-0.5 rounded-full ${isSelected ? c.badge : 'bg-gray-800 text-gray-500'}`}>
                      {v}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        {/* Launch button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={handleLaunch}
            disabled={!selected}
            className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500
                       disabled:opacity-30 disabled:cursor-not-allowed
                       px-10 py-3.5 rounded-xl font-bold tracking-wider text-sm
                       transition-all shadow-lg shadow-blue-900/40"
          >
            <Plane size={16} />
            LAUNCH MONITOR
            <ChevronRight size={16} />
          </button>
        </div>

        <p className="text-center text-xs text-gray-700 mt-3">
          You can switch regions anytime from the map
        </p>
      </div>
    </div>
  )
}