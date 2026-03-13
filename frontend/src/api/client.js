import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 12000,
})

// ── Objects ────────────────────────────────────────────────────────────────────
export const getObjects    = ()      => api.get('/agent/objects')
export const getObject     = (id)    => api.get(`/agent/object/${id}`)
export const getTrajectory = (id)    => api.get(`/agent/trajectory/${id}`)
export const getRiskScores = ()      => api.get('/agent/risk')
export const getAnomalies  = ()      => api.get('/agent/anomalies')
export const getZones      = ()      => api.get('/agent/zones')
export const getLog        = ()      => api.get('/agent/log')

// ── Agent ──────────────────────────────────────────────────────────────────────
export const agentQuery   = (query)  => api.post('/agent/query',  { query })
export const explainObj   = (id)     => api.post(`/agent/explain/${id}`)
export const systemStatus = ()       => api.get('/status')

export default api