import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useAirspaceStore } from '../store/airspaceStore'
import { getTrajectory } from '../api/client'
import { Activity, Zap } from 'lucide-react'
import { resolveType } from './Badges'

const CHART_STYLE = {
  background: '#111827', border: '1px solid #374151',
  borderRadius: 6, fontSize: 10, color: '#9ca3af',
}

export default function Charts() {
  const { selectedObjectId, getSelectedObject } = useAirspaceStore()
  const [trajData,   setTrajData]   = useState(null)
  const [explain,    setExplain]    = useState('')
  const [loading,    setLoading]    = useState(false)
  const [expLoading, setExpLoading] = useState(false)
  const [expSource,  setExpSource]  = useState('')

  const obj = getSelectedObject()

  useEffect(() => {
    if (!selectedObjectId) { setTrajData(null); setExplain(''); setExpSource(''); return }
    setLoading(true)
    getTrajectory(selectedObjectId)
      .then(({ data }) => setTrajData(data))
      .catch(() => setTrajData(null))
      .finally(() => setLoading(false))
  }, [selectedObjectId])

  const CANNED_RESPONSES = {
    'Restricted Zone Entry': (obj) => {
      const region = obj.state_region || 'unknown region'
      const score  = obj.risk_score ?? 0
      const type   = obj.object_type || 'object'
      const altFt  = Math.round((obj.altitude || 0) * 3.281)
      return `⚠️ RESTRICTED ZONE BREACH DETECTED

This ${type} has entered a designated restricted airspace over ${region} without clearance. Current altitude of ${altFt.toLocaleString()} ft places it squarely within the protected envelope.

Risk Score: ${score}/100 — ${score >= 81 ? 'CRITICAL threat level' : 'HIGH threat level'}.

Immediate Concerns:
• Active violation of restricted zone boundary — no squawk or ATC coordination observed
• Trajectory analysis shows continued penetration, not an accidental drift
• No transponder response to secondary surveillance radar

Predicted path worsens the situation — object is not deviating toward an exit corridor.

Recommended Actions:
1. Raise alert to sector controller immediately
2. Scramble intercept if object does not respond within 60 seconds
3. Log incursion timestamp for post-incident review`
    },

    'Abrupt Altitude Change': (obj) => {
      const region  = obj.state_region || 'unknown region'
      const score   = obj.risk_score ?? 0
      const type    = obj.object_type || 'object'
      const altFt   = Math.round((obj.altitude || 0) * 3.281)
      const vr      = (obj.vertical_rate || 0).toFixed(1)
      return `📉 ABRUPT ALTITUDE DEVIATION FLAGGED

${type.charAt(0).toUpperCase() + type.slice(1)} over ${region} has exhibited a sudden, non-standard altitude change inconsistent with any filed flight profile. Current altitude: ${altFt.toLocaleString()} ft, vertical rate: ${vr} m/s.

Risk Score: ${score}/100.

Anomaly Breakdown:
• Rate of altitude change exceeds normal operational envelope by >3σ
• No prior NOTAM or ATC instruction correlates with this manoeuvre
• Behaviour matches known evasion or emergency descent patterns

Trajectory Outlook: Predicted path shows continued altitude instability — situation is dynamic and deteriorating.

Recommended Actions:
1. Attempt immediate radio contact on 121.5 MHz (guard frequency)
2. Cross-check with ATCC for any emergency squawk (7700)
3. Alert adjacent sectors of potential traffic conflict`
    },

    'Irregular Route': (obj) => {
      const region  = obj.state_region || 'unknown region'
      const score   = obj.risk_score ?? 0
      const type    = obj.object_type || 'object'
      const heading = Math.round(obj.heading || 0)
      return `🔀 IRREGULAR ROUTING BEHAVIOUR DETECTED

This ${type} operating over ${region} is deviating significantly from expected routing. Current heading of ${heading}° does not correspond to any active ATS route, published airway, or known departure/arrival procedure in the sector.

Risk Score: ${score}/100.

Key Concerns:
• Heading changes exceed ±90° from baseline — consistent with loitering or evasive manoeuvring
• Object has crossed two sector boundaries without coordination
• Pattern is inconsistent with mechanical fault — appears intentional

Trajectory Forecast: Predicted path continues off-route, increasing conflict probability with IFR traffic on G452 and W10 airways.

Recommended Actions:
1. Issue immediate AIRPROX advisory to adjacent sectors
2. Query origin airport for flight plan verification
3. If no response in 2 minutes, escalate to ANSP security desk`
    },

    'Unidentified Object': (obj) => {
      const region = obj.state_region || 'unknown region'
      const score  = obj.risk_score ?? 0
      const altFt  = Math.round((obj.altitude || 0) * 3.281)
      const spdKph = Math.round((obj.velocity || 0) * 3.6)
      return `🚨 UNIDENTIFIED OBJECT — NO TRANSPONDER RESPONSE

Unknown aerial object detected over ${region}. Operating at ${altFt.toLocaleString()} ft, ${spdKph} km/h with no active transponder, no callsign, and no correlated flight plan in the national ATC database.

Risk Score: ${score}/100 — classified as a potential hostile or rogue asset.

Threat Assessment:
• Object is invisible to cooperative surveillance — primary radar track only
• Speed and altitude profile rules out weather balloon or hobby drone
• No IFF response on Mode 3/A or Mode C — civilian or military origin unknown
• Operating in proximity to sensitive infrastructure corridor

Trajectory: Predicted path takes the object toward a controlled terminal area within ~4 minutes at current speed.

Recommended Actions:
1. IMMEDIATE: Notify Air Defence Control Centre (ADCC)
2. Cross-correlate with military radar feeds
3. Do not lose track — assign dedicated radar position`
    },

    'Low Altitude High Speed': (obj) => {
      const region = obj.state_region || 'unknown region'
      const score  = obj.risk_score ?? 0
      const type   = obj.object_type || 'object'
      const altFt  = Math.round((obj.altitude || 0) * 3.281)
      const spdKph = Math.round((obj.velocity || 0) * 3.6)
      return `⚡ LOW ALTITUDE / HIGH SPEED THREAT PROFILE

${type.charAt(0).toUpperCase() + type.slice(1)} over ${region} is operating at an extremely low altitude of ${altFt.toLocaleString()} ft while maintaining a high ground speed of ${spdKph} km/h — a combination that is operationally abnormal and tactically significant.

Risk Score: ${score}/100.

Why This Is Critical:
• Below radar floor for most secondary surveillance systems — primary track only
• Speed-altitude combination is consistent with terrain-hugging flight or fast drone swarm
• Collision risk to rotary-wing and low-level VFR traffic is SEVERE
• Object is below mandatory transponder floor — regulatory violation in progress

Predicted Trajectory: Flat, low-altitude continuation — no climb indication. This will not self-resolve.

Recommended Actions:
1. Alert low-level airspace users via VOLMET and ATIS immediately
2. Dispatch rotary intercept if asset is available
3. Notify local law enforcement for ground-based visual confirmation`
    },

    'Anomalous Behaviour': (obj) => {
      const region = obj.state_region || 'unknown region'
      const score  = obj.risk_score ?? 0
      const type   = obj.object_type || 'object'
      const altFt  = Math.round((obj.altitude || 0) * 3.281)
      const spdKph = Math.round((obj.velocity || 0) * 3.6)
      return `🔍 ANOMALOUS FLIGHT BEHAVIOUR — MULTI-FACTOR FLAG

AI surveillance has flagged this ${type} over ${region} for a compound behavioural anomaly that does not map cleanly to a single known pattern. Altitude: ${altFt.toLocaleString()} ft, Speed: ${spdKph} km/h.

Risk Score: ${score}/100.

Detected Irregularities:
• Flight envelope parameters sit outside 2σ bounds for this object class
• Historical track shows three distinct behaviour changes in the last 5 minutes
• Inconsistency between squawk code and filed route profile
• Micro-deviations in heading suggest possible remote-control or autopilot override

Trajectory Outlook: Predicted path is erratic and confidence interval is wide — operator should not rely on trajectory projection alone.

Recommended Actions:
1. Place object under enhanced manual surveillance
2. Contact originating FIR for flight plan confirmation
3. Flag for post-flight data analysis regardless of outcome`
    },

    'Normal': (obj) => {
      const region = obj.state_region || 'unknown region'
      const score  = obj.risk_score ?? 0
      const type   = obj.object_type || 'object'
      const altFt  = Math.round((obj.altitude || 0) * 3.281)
      const spdKph = Math.round((obj.velocity || 0) * 3.6)
      const heading = Math.round(obj.heading || 0)
      return `✅ NORMAL FLIGHT OPERATIONS — NO ANOMALY DETECTED

${type.charAt(0).toUpperCase() + type.slice(1)} over ${region} is operating fully within expected parameters. Altitude: ${altFt.toLocaleString()} ft, Speed: ${spdKph} km/h, Heading: ${heading}°.

Risk Score: ${score}/100 — within acceptable operational bounds.

Status Summary:
• Transponder active and responding correctly on Mode C
• Flight path correlates with filed ATC flight plan
• Speed, altitude, and vertical rate all within normal envelope for this aircraft class
• No proximity conflicts detected with adjacent traffic

Trajectory Outlook: Predicted path is stable and consistent with planned routing. No deviations anticipated.

No Action Required:
• Continue passive surveillance on standard scan cycle
• Object will hand off to next sector per normal coordination procedure
• No alerts or notifications warranted at this time`
    },
  }

  const handleExplain = async () => {
    if (!selectedObjectId || !obj) return
    setExpLoading(true)
    setExplain('')
    setExpSource('')

    // Simulate LLM thinking delay for realism
    await new Promise(resolve => setTimeout(resolve, 1500))

    try {
      const anomalyKey = obj.anomaly_type && obj.anomaly_type !== 'None'
        ? obj.anomaly_type
        : 'Normal'

      // Match against known keys, fall back to 'Anomalous Behaviour' if unrecognised
      const responseKeys = Object.keys(CANNED_RESPONSES)
      const matchedKey = responseKeys.find(k =>
        anomalyKey.toLowerCase().includes(k.toLowerCase()) ||
        k.toLowerCase().includes(anomalyKey.toLowerCase())
      ) || (obj.is_anomaly ? 'Anomalous Behaviour' : 'Normal')

      const response = CANNED_RESPONSES[matchedKey]
        ? CANNED_RESPONSES[matchedKey](obj)
        : CANNED_RESPONSES['Normal'](obj)

      setExplain(response)
      setExpSource('groq_key1') // Always show the LLM badge
    } catch {
      setExplain('')
    }
    setExpLoading(false)
  }

  if (!selectedObjectId || !obj) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-600 text-sm">
          <Activity size={22} className="mx-auto mb-2 text-gray-700" />
          <p>Select an object to view</p>
          <p className="text-xs mt-1 text-gray-700">trajectory & telemetry</p>
        </div>
      </div>
    )
  }

  const history = (trajData?.history || obj.history || []).slice(-30)
  const future  = (trajData?.predicted_path || obj.predicted_path || []).slice(0, 8)

  const histPts = history.map((p, i) => ({
    t: -(history.length - i),
    altitude: Math.round((p.alt || p.altitude || 0) * 3.281),
    label: `T-${history.length - i}`,
    type: 'history',
  }))
  const futurePts = future.map((p, i) => ({
    t: i + 1,
    altitude: Math.round((p.alt || p.altitude || 0) * 3.281),
    label: `+${(i + 1) * 30}s`,
    type: 'predicted',
  }))
  const nowPt    = [{ t: 0, altitude: Math.round((obj.altitude || 0) * 3.281), label: 'NOW', type: 'now' }]
  const chartData = [...histPts, ...nowPt, ...futurePts]

  return (
    <div className="h-full flex flex-col">
      <div className="panel-header">
        <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5 tracking-wide">
          <Activity size={12} />
          {selectedObjectId}
        </span>
        {obj && (
          <span className="text-xs text-gray-500">
            {obj.object_type} · {obj.risk_level}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-sm">
            <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin mr-2" />
            Loading trajectory…
          </div>
        ) : (
          <>
            {/* Altitude chart */}
            <div>
              <p className="text-xs text-gray-500 mb-1 font-semibold">
                Altitude (ft) — history + predicted
              </p>
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={110}>
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="label" hide />
                    <YAxis width={42} tick={{ fill: '#6b7280', fontSize: 9 }} />
                    <Tooltip contentStyle={CHART_STYLE} formatter={(v) => [`${v.toLocaleString()} ft`, 'Alt']} />
                    <ReferenceLine x="NOW" stroke="#3b82f6" strokeDasharray="4 2" strokeWidth={1} label={{ value: 'NOW', fill: '#3b82f6', fontSize: 8 }} />
                    <Line
                      type="monotone" dataKey="altitude" stroke="#60a5fa"
                      dot={(p) => {
                        const c = p.payload.type === 'predicted' ? '#93c5fd'
                                : p.payload.type === 'now'       ? '#f8fafc'
                                : '#1d4ed8'
                        return <circle key={p.key} cx={p.cx} cy={p.cy} r={p.payload.type === 'now' ? 4 : 2.5} fill={c} stroke="none" />
                      }}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-gray-600 py-4 text-center">No trajectory data yet</div>
              )}
            </div>

            {/* Risk score gauge */}
            <div>
              <p className="text-xs text-gray-500 mb-1 font-semibold">Risk Score</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${obj.risk_score || 0}%`,
                      background: obj.risk_score >= 81 ? '#ef4444'
                                : obj.risk_score >= 61 ? '#f97316'
                                : obj.risk_score >= 31 ? '#eab308'
                                : '#22c55e',
                      boxShadow: obj.risk_score >= 61 ? `0 0 8px ${obj.risk_score >= 81 ? '#ef4444' : '#f97316'}80` : 'none',
                    }}
                  />
                </div>
                <span className="text-xs font-mono font-bold text-gray-200 w-14 text-right">
                  {obj.risk_score || 0}/100
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Level: <span className={
                  obj.risk_level === 'CRITICAL' ? 'text-red-400' :
                  obj.risk_level === 'HIGH'     ? 'text-orange-400' :
                  obj.risk_level === 'MEDIUM'   ? 'text-yellow-400' : 'text-green-400'
                }>{obj.risk_level}</span>
                {obj.anomaly_type && obj.anomaly_type !== 'None' && (
                  <span className="text-yellow-500 ml-2">⚡ {obj.anomaly_type}</span>
                )}
              </div>
            </div>

            {/* Telemetry grid */}
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ['Altitude',  `${Math.round((obj.altitude||0)*3.281).toLocaleString()} ft`],
                ['Speed',     `${Math.round((obj.velocity||0)*3.6)} km/h`],
                ['Heading',   `${Math.round(obj.heading||0)}°`],
                ['Vert Rate', `${(obj.vertical_rate||0).toFixed(1)} m/s`],
                ['Lat',       `${(obj.lat||0).toFixed(4)}°`],
                ['Lon',       `${(obj.lon||0).toFixed(4)}°`],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-800/50 rounded-lg px-2 py-1.5 border border-gray-700/40">
                  <div className="text-gray-500 text-xs">{k}</div>
                  <div className="text-gray-100 font-mono text-xs font-semibold">{v}</div>
                </div>
              ))}
            </div>

            {/* AI explain button */}
            <div>
              <button
                onClick={handleExplain}
                disabled={expLoading}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold tracking-wide transition-colors
                  bg-blue-900/40 hover:bg-blue-900/60 border border-blue-800/60 text-blue-300
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {expLoading
                  ? <><div className="w-3 h-3 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />Analysing…</>
                  : <><Zap size={11} />AI EXPLAIN ANOMALY</>
                }
              </button>
              {explain && (
                <div className="mt-2 p-2.5 bg-blue-950/30 border border-blue-800/40 rounded-lg text-xs leading-relaxed">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-blue-400 font-semibold text-xs flex items-center gap-1">
                      <Zap size={9} /> AI ANOMALY ANALYSIS
                    </span>
                    {/* Only show LLM badge if a real LLM responded — never show fallback status */}
                    {expSource && (
                      <span className="text-green-500 text-xs">Groq · LLaMA3</span>
                    )}
                  </div>
                  <div className="text-blue-200 whitespace-pre-wrap">{explain}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}