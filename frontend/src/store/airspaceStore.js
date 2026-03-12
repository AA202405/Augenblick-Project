import { create } from 'zustand'
import { isInRegion } from '../lib/regionBounds'

function _isTokenValid(token) {
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

const storedToken = localStorage.getItem('airspace_token')
const initialToken = _isTokenValid(storedToken) ? storedToken : null
if (!initialToken && storedToken) localStorage.removeItem('airspace_token')

export const useAirspaceStore = create((set, get) => ({
  // ── Objects ────────────────────────────────────────────────────────────────
  objects: [],
  selectedObjectId: null,
  setObjects: (objects) => set({ objects }),
  selectObject: (id) => set({ selectedObjectId: id }),
  getSelectedObject: () => {
    const { objects, selectedObjectId } = get()
    return objects.find(o => o.object_id === selectedObjectId) || null
  },

  // Region-filtered objects selector — single source of truth for filtered data
  getRegionObjects: () => {
    const { objects, activeRegion } = get()
    return objects.filter(o => isInRegion(o.lat, o.lon, activeRegion))
  },

  // ── Alerts ─────────────────────────────────────────────────────────────────
  alerts: [],
  alertsSeen: new Set(),
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) => set(s => {
    if (s.alertsSeen.has(alert.id)) return s
    const newSeen = new Set(s.alertsSeen)
    newSeen.add(alert.id)
    return {
      alerts: [alert, ...s.alerts].slice(0, 100),
      alertsSeen: newSeen,
    }
  }),

  // ── Connection ─────────────────────────────────────────────────────────────
  connected: false,
  lastUpdate: null,
  setConnected: (c) => set({ connected: c, lastUpdate: c ? Date.now() : get().lastUpdate }),
  setLastUpdate: () => set({ lastUpdate: Date.now() }),

  // ── Voice ──────────────────────────────────────────────────────────────────
  voiceMuted: false,
  voiceVolume: 1.0,
  toggleMute: () => set(s => ({ voiceMuted: !s.voiceMuted })),
  setVolume: (v) => set({ voiceVolume: v }),

  // ── Auth ───────────────────────────────────────────────────────────────────
  token: initialToken,
  setToken: (token) => {
    localStorage.setItem('airspace_token', token)
    set({ token })
  },
  clearToken: () => {
    localStorage.removeItem('airspace_token')
    set({ token: null, activeRegion: null })
  },

  // ── Region ─────────────────────────────────────────────────────────────────
  activeRegion: initialToken ? (localStorage.getItem('airspace_region') || null) : null,
  setActiveRegion: (region) => {
    if (region) localStorage.setItem('airspace_region', region)
    set(s => ({
      activeRegion: region,
      // Clear selected object when switching regions — prevents stale Charts/data
      selectedObjectId: null,
      // Clear agent messages — old answers belong to old region
      agentMessages: [],
    }))
  },

  // ── Agent ──────────────────────────────────────────────────────────────────
  agentSummary: '',
  agentMessages: [],
  setAgentSummary: (s) => set({ agentSummary: s }),
  addAgentMessage: (msg) => set(s => ({ agentMessages: [...s.agentMessages, msg] })),
  clearAgentMessages: () => set({ agentMessages: [] }),

  // ── UI ─────────────────────────────────────────────────────────────────────
  activePanel: 'objects',
  setActivePanel: (p) => set({ activePanel: p }),
}))