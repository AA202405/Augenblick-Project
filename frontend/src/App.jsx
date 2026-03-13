import { useEffect, useRef, useState } from 'react'
import { useAirspaceStore } from './store/airspaceStore'
import { useWebSocket } from './hooks/useWebSocket'

import StatusBar   from './components/StatusBar'
import AirspaceMap from './components/Map'
import ObjectPanel from './components/ObjectPanel'
import AlertFeed   from './components/AlertFeed'
import Charts      from './components/Charts'
import AIAssistant from './components/AIAssistant'
import HomePage    from './components/HomePage'
import RegionPicker from './components/RegionPicker'

import { Plane, Bell, Activity, Bot, MapPin } from 'lucide-react'

const TABS = [
  { id: 'objects', label: 'Objects', icon: Plane    },
  { id: 'alerts',  label: 'Alerts',  icon: Bell     },
  { id: 'charts',  label: 'Charts',  icon: Activity },
  { id: 'agent',   label: 'AI',      icon: Bot      },
]

export default function App() {
  const {
    activePanel, setActivePanel,
    activeRegion, setActiveRegion,
    showHome, setShowHome,
  } = useAirspaceStore()

  // Always connect WebSocket — no auth needed
  useWebSocket()

  // Show home page on first load
  if (showHome) {
    return (
      <HomePage onEnter={(preselectedRegion) => {
        setShowHome(false)
        if (preselectedRegion) {
          setActiveRegion(preselectedRegion)
        }
      }} />
    )
  }

  // If no region chosen yet, show picker
  if (!activeRegion) {
    return <RegionPicker />
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-950">

      {/* ── TOP HEADER ── */}
      <header className="h-11 bg-gray-900/95 border-b border-gray-700/60 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <Plane size={13} className="text-white" />
          </div>
          <span className="font-bold text-sm text-gray-100 tracking-widest">
            AIRSPACE MONITOR
          </span>
          <span className="text-xs text-gray-600 hidden md:block">
            Maharashtra · Goa · Telangana · Gujarat · Delhi/NCR
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveRegion(null)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors"
            title="Change region"
          >
            <MapPin size={12} />
            <span className="hidden sm:block">Region</span>
          </button>
          <button
            onClick={() => setShowHome(true)}
            className="text-xs text-gray-600 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-gray-700/60 hover:border-gray-600"
          >
            ⌂ Home
          </button>
        </div>
      </header>

      {/* ── STATUS BAR ── */}
      <StatusBar />

      {/* ── MAIN LAYOUT ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Map — takes all remaining width */}
        <div className="flex-1 p-2 overflow-hidden min-w-0">
          <AirspaceMap />
        </div>

        {/* Right sidebar */}
        <div className="w-72 flex flex-col border-l border-gray-700/60 flex-shrink-0 bg-gray-950">

          {/* Tab bar */}
          <div className="flex border-b border-gray-700/60 flex-shrink-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActivePanel(id)}
                className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors
                  ${activePanel === id
                    ? 'text-blue-400 border-b-2 border-blue-500 bg-gray-900/50'
                    : 'text-gray-500 hover:text-gray-300'}`}
              >
                <Icon size={12} />
                <span className="mt-0.5">{label}</span>
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {activePanel === 'objects' && <ObjectPanel />}
            {activePanel === 'alerts'  && <AlertFeed />}
            {activePanel === 'charts'  && <Charts />}
            {activePanel === 'agent'   && <AIAssistant />}
          </div>

        </div>
      </div>
    </div>
  )
}
