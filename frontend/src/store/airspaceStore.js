import { create } from 'zustand'
import { isInRegion } from '../lib/regionBounds'

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
  getRegionObjects: () => {
    const { objects, activeRegion } = get()
    return objects.filter(o => isInRegion(o.lat, o.lon, activeRegion))
  },

  // ── Connection ─────────────────────────────────────────────────────────────
  connected: false,
  lastUpdate: null,
  tick: 0,
  setConnected: (c) => set({ connected: c }),
  setLastUpdate: (tick) => set({ lastUpdate: Date.now(), tick: tick || 0 }),

  // ── Region ─────────────────────────────────────────────────────────────────
  activeRegion: localStorage.getItem('airspace_region') || 'all',
  setActiveRegion: (region) => {
    if (region) localStorage.setItem('airspace_region', region)
    set({ activeRegion: region, selectedObjectId: null, agentMessages: [] })
  },

  // ── Alerts (local derived from WS) ────────────────────────────────────────
  alerts: [],
  addAlert: (alert) => set(s => {
    const exists = s.alerts.find(a => a.id === alert.id)
    if (exists) return s
    return { alerts: [alert, ...s.alerts].slice(0, 150) }
  }),
  clearAlerts: () => set({ alerts: [] }),

  // ── Voice ──────────────────────────────────────────────────────────────────
  voiceMuted: false,
  voiceVolume: 1.0,
  toggleMute: () => set(s => ({ voiceMuted: !s.voiceMuted })),
  setVolume: (v) => set({ voiceVolume: v }),

  // ── Agent / AI ─────────────────────────────────────────────────────────────
  agentMessages: [],
  addAgentMessage: (msg) => set(s => ({ agentMessages: [...s.agentMessages, msg] })),

  // ── UI ─────────────────────────────────────────────────────────────────────
  activePanel: 'objects',
  setActivePanel: (p) => set({ activePanel: p }),
  showHome: true,
  setShowHome: (v) => set({ showHome: v }),
}))