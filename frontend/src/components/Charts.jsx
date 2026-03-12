import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { useAirspaceStore } from '../store/airspaceStore'
import { getHistory } from '../api/client'
import { isInRegion } from '../lib/regionBounds'
import { REGION_LABELS } from '../lib/regionBounds'
import { Activity } from 'lucide-react'

export default function Charts() {
  const { selectedObjectId, getSelectedObject, selectObject, activeRegion } = useAirspaceStore()
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(false)

  const obj = getSelectedObject()

  // When region changes — if selected object is outside new region, deselect it
  useEffect(() => {
    if (!obj) return
    if (!isInRegion(obj.lat, obj.lon, activeRegion)) {
      selectObject(null)
      setHistory([])
    }
  }, [activeRegion, obj, selectObject])

  useEffect(() => {
    if (!selectedObjectId) { setHistory([]); return }
    setLoading(true)
    getHistory(selectedObjectId, 60)
      .then(({ data }) => {
        const pts = [...data].reverse().map((r, i) => ({
          t:        i,
          altitude: Math.round(r.altitude || 0),
          speed:    Math.round(r.speed    || 0),
          risk:     r.risk_score || 0,
          time:     r.recorded_at
            ? new Date(r.recorded_at).toLocaleTimeString()
            : `T-${data.length - i}`,
        }))
        setHistory(pts)
      })
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
  }, [selectedObjectId])

  const regionLabel = REGION_LABELS[activeRegion] || 'All 5 States'

  if (!selectedObjectId) {
    return (
      <div className="panel h-full flex items-center justify-center">
        <div className="text-center text-gray-600 text-sm">
          <Activity size={24} className="mx-auto mb-2 text-gray-700" />
          <p>Select an object in</p>
          <p className="text-blue-500 text-xs mt-1">{regionLabel}</p>
          <p className="text-xs mt-1">to view charts</p>
        </div>
      </div>
    )
  }

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header">
        <span className="text-sm font-semibold text-gray-200 flex items-center gap-1.5">
          <Activity size={14} />
          {selectedObjectId}
        </span>
        {obj && (
          <span className="text-xs text-gray-500">
            {obj.predicted_type || obj.object_type} · {obj.risk_level}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          Loading...
        </div>
      ) : history.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          No history data yet
        </div>
      ) : (
        <div className="flex-1 overflow-hidden p-3 space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Altitude (m)</p>
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" hide />
                <YAxis width={45} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }} />
                <Line type="monotone" dataKey="altitude" stroke="#60a5fa" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Speed (m/s)</p>
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" hide />
                <YAxis width={45} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }} />
                <Line type="monotone" dataKey="speed" stroke="#34d399" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Risk Score</p>
            <ResponsiveContainer width="100%" height={75}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" hide />
                <YAxis domain={[0, 100]} width={45} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }} />
                <Line type="monotone" dataKey="risk" stroke="#f87171" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}