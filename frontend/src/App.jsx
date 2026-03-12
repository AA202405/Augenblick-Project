import { useEffect, useRef, useState } from 'react'
import { useAirspaceStore } from './store/airspaceStore'
import { useWebSocket } from './hooks/useWebSocket'
import { useVoice } from './hooks/useVoice'
import { isInRegion } from './lib/regionBounds'

import StatusBar    from './components/StatusBar'
import AirspaceMap  from './components/Map'
import ObjectPanel  from './components/ObjectPanel'
import AlertFeed    from './components/AlertFeed'
import Charts       from './components/Charts'
import AIAssistant  from './components/AIAssistant'
import LoginPage    from './components/LoginModal'
import RegionPicker from './components/RegionPicker'
import HomePage     from './components/HomePage'

import { Plane, Bell, Activity, Bot, LogOut, MapPin } from 'lucide-react'

const TABS = [
  { id: 'objects', label: 'Objects', icon: Plane    },
  { id: 'alerts',  label: 'Alerts',  icon: Bell     },
  { id: 'charts',  label: 'Charts',  icon: Activity },
  { id: 'agent',   label: 'AI',      icon: Bot      },
]

export default function App() {
  const {
    token, clearToken,
    activePanel, setActivePanel,
    activeRegion,
    objects,
  } = useAirspaceStore()

  const { speakAlert } = useVoice()
  const prevObjectsRef = useRef({})

  // Home page is shown first; dismissed permanently once operator clicks ACCESS SYSTEM
  const [showHome, setShowHome] = useState(true)

  useWebSocket(token && activeRegion)

  // Voice alerts — only for objects inside the active region
  useEffect(() => {
    if (!token || !activeRegion) return
    objects.forEach(obj => {
      // Skip objects outside the active region
      if (!isInRegion(obj.lat, obj.lon, activeRegion)) return

      const prev  = prevObjectsRef.current[obj.object_id]
      const level = obj.risk_level
      if ((level === 'CRITICAL' || level === 'HIGH') && prev?.risk_level !== level) {
        speakAlert(obj)
      }
    })
    const map = {}
    objects.forEach(o => { map[o.object_id] = o })
    prevObjectsRef.current = map
  }, [objects, speakAlert, token, activeRegion])

  // Home page flow: HomePage → LoginPage → RegionPicker → Dashboard
  if (showHome) {
    return (
      <HomePage onEnter={(preselectedRegion) => {
        setShowHome(false)
        // If user picked a region on the home page AND is already logged in + has no region set,
        // pre-select it in the store so RegionPicker is skipped.
        // We DON'T set it if they're not logged in — RegionPicker will handle it after login.
        if (preselectedRegion && token && !activeRegion) {
          useAirspaceStore.getState().setActiveRegion(preselectedRegion)
        }
      }} />
    )
  }

  if (!token)        return <LoginPage />
  if (!activeRegion) return <RegionPicker />

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-950">

      {/* Top bar */}
      <header className="h-12 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue-700 rounded-lg flex items-center justify-center">
            <Plane size={14} />
          </div>
          <span className="font-bold text-sm text-gray-100 tracking-wide">
            AIRSPACE MONITOR
          </span>
          <span className="text-xs text-gray-600 hidden sm:block">
            Maharashtra · Goa · Karnataka · Telangana · Gujarat
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => useAirspaceStore.getState().setActiveRegion(null)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            title="Change region"
          >
            <MapPin size={13} />
            <span className="hidden sm:block">Region</span>
          </button>
          <button
            onClick={clearToken}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Logout"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <StatusBar />

      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 p-2 overflow-hidden min-w-0">
          <AirspaceMap />
        </div>

        {/* Right sidebar */}
        <div className="w-72 flex flex-col border-l border-gray-800 flex-shrink-0">
          <div className="flex border-b border-gray-700 flex-shrink-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActivePanel(id)}
                className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors
                  ${activePanel === id
                    ? 'text-blue-400 border-b-2 border-blue-500 bg-gray-900/50'
                    : 'text-gray-500 hover:text-gray-300'}`}
              >
                <Icon size={13} />
                <span className="mt-0.5">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden p-2">
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