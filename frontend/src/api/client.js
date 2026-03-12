import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('airspace_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (username, password) => {
  const form = new URLSearchParams()
  form.append('username', username)
  form.append('password', password)
  return api.post('/auth/token', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
}

// ── Objects ───────────────────────────────────────────────────────────────────
export const getObjects   = ()     => api.get('/objects')
export const getObject    = (id)   => api.get(`/objects/${id}`)
export const getHistory   = (id, limit = 60) => api.get(`/objects/${id}/history?limit=${limit}`)

// ── Alerts ────────────────────────────────────────────────────────────────────
export const getAlerts    = (limit = 50) => api.get(`/alerts?limit=${limit}`)

// ── Zones ─────────────────────────────────────────────────────────────────────
export const getZones     = ()     => api.get('/zones')
export const createZone   = (data) => api.post('/zones', data)
export const deleteZone   = (id)   => api.delete(`/zones/${id}`)

// ── Prediction ────────────────────────────────────────────────────────────────
export const predictTrajectory = (objectId) =>
  api.post('/predict', { object_id: objectId, horizons_sec: [60, 120, 300] })

// ── Agent ─────────────────────────────────────────────────────────────────────
export const agentQuery   = (query, conversationId) =>
  api.post('/agent/query', { query, conversation_id: conversationId })
export const agentSummary = () => api.get('/agent/summarize')

export default api

// ── Agent status ───────────────────────────────────────────────────────────────
export const agentStatus  = () => api.get('/agent/status')