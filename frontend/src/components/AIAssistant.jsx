import { useState, useRef } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'
import { agentQuery } from '../api/client'
import { REGION_LABELS } from '../lib/regionBounds'
import { Bot, Send, Radio, Zap, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react'

// ── LLM badge config ──────────────────────────────────────────────────────────
const LLM_BADGE = {
  groq_key1: { label: 'Groq · LLaMA3-70B', color: 'text-green-400', bg: 'bg-green-950/40', border: 'border-green-800' },
  groq_key2: { label: 'Groq · LLaMA3',     color: 'text-cyan-400',  bg: 'bg-cyan-950/40',  border: 'border-cyan-800'  },
  default:   { label: 'AI Assistant',       color: 'text-blue-400',  bg: 'bg-blue-950/30',  border: 'border-blue-900'  },
}

// ── 5 Static anomaly intelligence data points ─────────────────────────────────
const STATIC_ANOMALY_INSIGHTS = [
  {
    id: 1,
    icon: '🚫',
    title: 'Zone Breach Frequency — Goa Naval',
    finding: 'Goa Naval Airspace (RZ-GOA) logs the highest restricted zone breach rate among all 5 states. Drones are the primary violators — typically small unregistered UAVs with no callsign that enter the 73.8–74.2°E corridor below 200m.',
    severity: 'CRITICAL',
    tag: 'Restricted Zone',
  },
  {
    id: 2,
    icon: '📉',
    title: 'Abrupt Altitude Change — Maharashtra Corridor',
    finding: 'Objects flagged for "Abrupt Altitude Change" show a d_baro_altitude delta exceeding 200m within a single tick. These primarily originate over Maharashtra and are disproportionately unregistered cargo aircraft or unknown-type objects evading standard ATC altitude profiles.',
    severity: 'HIGH',
    tag: 'Altitude Anomaly',
  },
  {
    id: 3,
    icon: '🔍',
    title: 'Identity Risk Hotspot — Delhi/NCR Corridor',
    finding: 'Unidentified objects with no callsign and no FAA registration cluster in the Delhi/NCR flight corridor, scoring 0.7+ on the identity_risk_score composite index. Concentration is highest during 06:00–09:00 and 17:00–20:00 windows, consistent with peak commercial traffic masking.',
    severity: 'HIGH',
    tag: 'Identity Risk',
  },
  {
    id: 4,
    icon: '↩️',
    title: 'Irregular Route Signature — Drone vs. Aircraft',
    finding: 'Heading deviations > 90° — classified as "Irregular Route" by the IsolationForest model — occur 3× more frequently in drones than in any other object type across all 5 regions. Gujarat and Telangana show the highest drone-specific irregular-route counts, suggesting waypoint spoofing or loss-of-control events.',
    severity: 'MEDIUM',
    tag: 'Route Anomaly',
  },
  {
    id: 5,
    icon: '⚡',
    title: 'Low-Altitude High-Speed — Gujarat Coastline',
    finding: 'Low-altitude/high-speed anomalies (below 50m AGL, above 50 m/s ground speed) are concentrated near the Gujarat coastline and consistently correlate with missing transponder data. This pattern matches known surface-skimming evasion profiles and triggers the highest identity_risk composite scores in the dataset.',
    severity: 'CRITICAL',
    tag: 'Speed/Altitude',
  },
]

const SEVERITY_STYLE = {
  CRITICAL: { bg: 'bg-red-950/30',    border: 'border-red-700/60',    badge: 'bg-red-900/60 text-red-300',       dot: 'bg-red-400'    },
  HIGH:     { bg: 'bg-orange-950/25', border: 'border-orange-700/50', badge: 'bg-orange-900/60 text-orange-300', dot: 'bg-orange-400' },
  MEDIUM:   { bg: 'bg-yellow-950/20', border: 'border-yellow-700/40', badge: 'bg-yellow-900/50 text-yellow-300', dot: 'bg-yellow-400' },
}

// ── Top 20 retrieval Q&A ──────────────────────────────────────────────────────
const TOP20_QUESTIONS = [
  { id:  1, label: 'How many objects are tracked right now?',
    fn: o => `${o.length} objects are currently being tracked across all 5 states.` },
  { id:  2, label: 'How many CRITICAL risk objects are there?',
    fn: o => { const n = o.filter(x => x.risk_level === 'CRITICAL'); return n.length > 0 ? `${n.length} CRITICAL-risk object${n.length > 1 ? 's' : ''}: ${n.map(x => x.object_id).join(', ')}.` : 'No CRITICAL-risk objects at the moment.' } },
  { id:  3, label: 'Which object has the highest risk score?',
    fn: o => { const top = [...o].sort((a,b) => (b.risk_score||0)-(a.risk_score||0))[0]; return top ? `${top.object_id} (${top.object_type||'unknown'}) has the highest risk score: ${top.risk_score}/100 — ${top.risk_level}, region: ${top.state_region||'?'}.` : 'No data available.' } },
  { id:  4, label: 'Are there any restricted zone breaches?',
    fn: o => { const b = o.filter(x => x.in_restricted_zone); return b.length > 0 ? `Yes — ${b.length} breach${b.length > 1 ? 'es' : ''} active: ${b.map(x => `${x.object_id} (${x.restricted_zone_name||'restricted zone'})`).join(', ')}.` : 'No restricted zone breaches detected.' } },
  { id:  5, label: 'How many drones are being tracked?',
    fn: o => { const d = o.filter(x => (x.object_type||'').toLowerCase() === 'drone'); return `${d.length} drone${d.length !== 1 ? 's' : ''} tracked. ${d.filter(x => x.risk_level === 'CRITICAL' || x.risk_level === 'HIGH').length} are high or critical risk.` } },
  { id:  6, label: 'Which drones are flagged as anomalous?',
    fn: o => { const a = o.filter(x => (x.object_type||'').toLowerCase() === 'drone' && x.is_anomaly); return a.length > 0 ? `${a.length} anomalous drone${a.length > 1 ? 's' : ''}: ${a.map(x => `${x.object_id} (${x.anomaly_type||'anomaly'})`).join(', ')}.` : 'No drones currently flagged as anomalous.' } },
  { id:  7, label: 'How many total anomalies are active?',
    fn: o => { const a = o.filter(x => x.is_anomaly); return a.length > 0 ? `${a.length} anomal${a.length > 1 ? 'ies' : 'y'} active. Types: ${[...new Set(a.map(x => x.anomaly_type||'Anomalous Behaviour'))].join(', ')}.` : 'No anomalies currently detected.' } },
  { id:  8, label: 'What types of anomalies are present?',
    fn: o => { const types = o.filter(x=>x.is_anomaly).reduce((acc,x)=>{ const t=x.anomaly_type||'Anomalous Behaviour'; acc[t]=(acc[t]||0)+1; return acc; },{}); return Object.keys(types).length > 0 ? Object.entries(types).map(([t,n]) => `${t}: ${n}`).join(' | ') : 'No anomaly types active.' } },
  { id:  9, label: 'Which objects have no callsign / are unidentified?',
    fn: o => { const u = o.filter(x => !x.callsign || x.callsign === 'none' || (x.object_type||'').toLowerCase() === 'unknown'); return u.length > 0 ? `${u.length} unidentified/no-callsign object${u.length > 1 ? 's' : ''}: ${u.slice(0,8).map(x=>x.object_id).join(', ')}${u.length > 8 ? ` and ${u.length-8} more` : ''}.` : 'All tracked objects have callsigns.' } },
  { id: 10, label: 'What is the fastest object right now?',
    fn: o => { const top = [...o].sort((a,b)=>(b.velocity||0)-(a.velocity||0))[0]; return top ? `${top.object_id} is fastest at ${Math.round((top.velocity||0)*3.6)} km/h (${top.object_type||'unknown'}), over ${top.state_region||'?'}.` : 'No data.' } },
  { id: 11, label: 'Which object is flying highest?',
    fn: o => { const top = [...o].sort((a,b)=>(b.altitude||0)-(a.altitude||0))[0]; return top ? `${top.object_id} at ${Math.round((top.altitude||0)*3.281).toLocaleString()} ft (${top.object_type||'unknown'}), over ${top.state_region||'?'}.` : 'No data.' } },
  { id: 12, label: 'Which object is flying lowest?',
    fn: o => { const act = o.filter(x=>(x.altitude||0)>0); const low = [...act].sort((a,b)=>(a.altitude||0)-(b.altitude||0))[0]; return low ? `${low.object_id} is lowest at ${Math.round((low.altitude||0)*3.281).toLocaleString()} ft — ${low.object_type||'unknown'}, over ${low.state_region||'?'}.${(low.altitude||0)<50?' ⚠ Dangerously low.':''}` : 'No altitude data.' } },
  { id: 13, label: 'How many objects are in Maharashtra?',
    fn: o => { const r = o.filter(x=>(x.state_region||'').toLowerCase().includes('maharashtra')); return `${r.length} object${r.length!==1?'s':''} in Maharashtra. ${r.filter(x=>x.risk_level==='CRITICAL').length} CRITICAL, ${r.filter(x=>x.risk_level==='HIGH').length} HIGH risk.` } },
  { id: 14, label: 'How many objects are in Delhi/NCR?',
    fn: o => { const r = o.filter(x=>(x.state_region||'').toLowerCase().includes('delhi')); return `${r.length} object${r.length!==1?'s':''} in Delhi/NCR. ${r.filter(x=>x.risk_level==='CRITICAL').length} CRITICAL, ${r.filter(x=>x.risk_level==='HIGH').length} HIGH risk.` } },
  { id: 15, label: 'How many military aircraft are tracked?',
    fn: o => { const m = o.filter(x=>(x.object_type||'').toLowerCase()==='military_aircraft'); return `${m.length} military aircraft tracked. ${m.filter(x=>x.is_anomaly).length} flagged as anomalous.` } },
  { id: 16, label: 'What is the breakdown by object type?',
    fn: o => { const types = o.reduce((acc,x)=>{ const t=x.object_type||'unknown'; acc[t]=(acc[t]||0)+1; return acc; },{}); return Object.entries(types).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`${t}: ${n}`).join(' | ')||'No data.' } },
  { id: 17, label: 'Which region has the most CRITICAL objects?',
    fn: o => { const crits=o.filter(x=>x.risk_level==='CRITICAL'); const regions=crits.reduce((acc,x)=>{ const r=x.state_region||'Unknown'; acc[r]=(acc[r]||0)+1; return acc; },{}); const top=Object.entries(regions).sort((a,b)=>b[1]-a[1])[0]; return top ? `${top[0]} leads with ${top[1]} CRITICAL object${top[1]>1?'s':''}.` : 'No CRITICAL objects.' } },
  { id: 18, label: 'Any cargo aircraft with anomalies?',
    fn: o => { const c=o.filter(x=>(x.object_type||'').toLowerCase()==='cargo_aircraft'&&x.is_anomaly); return c.length>0 ? `${c.length} cargo aircraft flagged: ${c.map(x=>`${x.object_id} (${x.anomaly_type||'anomaly'})`).join(', ')}.` : 'No cargo aircraft anomalies detected.' } },
  { id: 19, label: 'What is the average risk score fleet-wide?',
    fn: o => { if(!o.length) return 'No data.'; const avg=o.reduce((s,x)=>s+(x.risk_score||0),0)/o.length; const high=o.filter(x=>(x.risk_score||0)>70).length; return `Fleet-wide average risk score: ${avg.toFixed(1)}/100. ${high} object${high!==1?'s':''} above threshold (>70).` } },
  { id: 20, label: 'Which helicopter has the highest risk?',
    fn: o => { const h=o.filter(x=>(x.object_type||'').toLowerCase()==='helicopter').sort((a,b)=>(b.risk_score||0)-(a.risk_score||0))[0]; return h ? `${h.object_id} — score ${h.risk_score}/100, ${h.risk_level} risk, over ${h.state_region||'?'}.${h.is_anomaly?` Flagged: ${h.anomaly_type}.`:''}` : 'No helicopters currently tracked.' } },
]

// ── Context builder for LLM calls ────────────────────────────────────────────
function buildLiveContext(objects, activeRegion) {
  if (!objects || objects.length === 0) return '[No live data yet — backend may be starting up]'
  const regionLabel = REGION_LABELS[activeRegion] || 'All 5 States'
  const total    = objects.length
  const critical = objects.filter(o => o.risk_level === 'CRITICAL')
  const high     = objects.filter(o => o.risk_level === 'HIGH')
  const anomalies = objects.filter(o => o.is_anomaly)
  const inZone   = objects.filter(o => o.in_restricted_zone)
  const topRisk  = [...objects]
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
    .slice(0, 12)
    .map(o => {
      const altFt  = Math.round((o.altitude || 0) * 3.281)
      const spdKph = Math.round((o.velocity || 0) * 3.6)
      return `  • ${o.object_id} [${o.object_type||'unknown'}] region=${o.state_region||'?'} risk=${o.risk_level}(${o.risk_score??0}/100) alt=${altFt}ft spd=${spdKph}km/h anomaly=${o.is_anomaly?(o.anomaly_type||'flagged'):'none'} zone=${o.in_restricted_zone?'BREACHED':'clear'} callsign=${o.callsign||'none'}`
    }).join('\n')
  const anomLines = anomalies.length > 0
    ? anomalies.map(o => `  • ${o.object_id} (${o.anomaly_type||'anomaly'}) in ${o.state_region||'?'} — risk ${o.risk_level}`).join('\n')
    : '  (none)'
  const zoneLines = inZone.length > 0
    ? inZone.map(o => `  • ${o.object_id} in ${o.restricted_zone_name||'restricted zone'}`).join('\n')
    : '  (none)'
  return [
    `=== LIVE AIRSPACE SNAPSHOT — ${regionLabel} ===`,
    `Tracked: ${total} | CRITICAL: ${critical.length} | HIGH: ${high.length} | Anomalies: ${anomalies.length} | Zone breaches: ${inZone.length}`,
    ``, `Top objects by risk score:`, topRisk || '  (none)',
    ``, `Active anomalies:`, anomLines,
    ``, `Zone breaches:`, zoneLines,
    `=== END SNAPSHOT ===`,
  ].join('\n')
}

const QUICK_QUERIES = [
  'What are the critical objects right now?',
  'Are there any restricted zone breaches?',
  'Which drones are showing anomalies?',
  'What is the highest risk object and why?',
  'List all objects in Maharashtra',
  'Any unidentified objects with no transponder?',
]

// ── Anomaly Analysis Panel ────────────────────────────────────────────────────
function AnomalyAnalysisPanel({ onClose }) {
  const [expanded, setExpanded] = useState(null)
  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="mx-3 mb-3 rounded-xl border border-orange-700/50 overflow-hidden"
      style={{ background: 'rgba(28,8,2,0.98)' }}>

      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-orange-800/40"
        style={{ background: 'rgba(110,35,5,0.5)' }}>
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-orange-400 animate-pulse flex-shrink-0" />
          <span className="text-orange-200 font-bold text-xs tracking-widest uppercase">Anomaly Analysis</span>
          <span className="text-orange-700 text-xs font-mono">· 5 insights</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-orange-800 text-xs font-mono hidden sm:block">{now}</span>
          <button onClick={onClose}
            className="text-orange-700 hover:text-orange-300 text-sm font-bold transition-colors leading-none">✕</button>
        </div>
      </div>

      {/* Insights list */}
      <div className="divide-y divide-orange-900/30">
        {STATIC_ANOMALY_INSIGHTS.map(insight => {
          const s = SEVERITY_STYLE[insight.severity] || SEVERITY_STYLE.MEDIUM
          const isOpen = expanded === insight.id
          return (
            <div key={insight.id} className={`${isOpen ? s.bg : ''} transition-colors duration-150`}>
              <button
                onClick={() => setExpanded(isOpen ? null : insight.id)}
                className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-white/5 transition-colors">
                <span className="text-base flex-shrink-0 mt-0.5 select-none">{insight.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-orange-100 text-xs font-semibold leading-snug">{insight.title}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold leading-none ${s.badge}`}>{insight.severity}</span>
                    <span className="text-orange-700 text-xs">{insight.tag}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-orange-700 mt-1">
                  {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </div>
              </button>

              {isOpen && (
                <div className={`mx-3 mb-3 px-3 py-2.5 rounded-lg border ${s.border} ${s.bg}`}>
                  <p className="text-orange-200/85 text-xs leading-relaxed font-mono tracking-wide">
                    {insight.finding}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-orange-900/30">
        <p className="text-orange-900 text-xs">ⓘ Static intelligence — IsolationForest feature analysis · not live-computed</p>
      </div>
    </div>
  )
}

// ── Top 20 Q&A grid ───────────────────────────────────────────────────────────
function Top20QA({ objects, onAnswer }) {
  const [showAll, setShowAll] = useState(false)
  const displayed = showAll ? TOP20_QUESTIONS : TOP20_QUESTIONS.slice(0, 8)

  return (
    <div className="px-3 pt-1 pb-1">
      <div className="flex items-center gap-1.5 mb-2">
        <HelpCircle size={10} className="text-indigo-500 flex-shrink-0" />
        <span className="text-indigo-400 text-xs font-bold tracking-wider uppercase">Top 20 Questions</span>
        <span className="text-gray-700 text-xs">· live retrieval</span>
      </div>
      <div className="flex flex-col gap-1">
        {displayed.map(q => (
          <button
            key={q.id}
            onClick={() => onAnswer(q.label, q.fn(objects))}
            className="text-left text-xs text-indigo-400 hover:text-indigo-100 border border-indigo-900/60 hover:border-indigo-600/60 hover:bg-indigo-950/50 rounded px-2.5 py-1.5 transition-all leading-snug flex items-start gap-2"
          >
            <span className="text-indigo-800 flex-shrink-0 font-mono tabular-nums" style={{ fontSize: 9, paddingTop: 1 }}>
              {String(q.id).padStart(2, '0')}
            </span>
            <span>{q.label}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => setShowAll(v => !v)}
        className="w-full mt-2 text-xs text-gray-700 hover:text-gray-400 py-1 transition-colors flex items-center justify-center gap-1">
        {showAll
          ? <><ChevronUp size={10} /> Show fewer</>
          : <><ChevronDown size={10} /> Show all 20 questions</>}
      </button>
    </div>
  )
}

// ── Main AIAssistant component ────────────────────────────────────────────────
export default function AIAssistant() {
  const { agentMessages, addAgentMessage, activeRegion, objects } = useAirspaceStore()

  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [llmSource,   setLlmSource]   = useState('')
  const [showAnomaly, setShowAnomaly] = useState(false)
  const bottomRef = useRef(null)

  const safeObjects = Array.isArray(objects) ? objects : []
  const regionLabel = REGION_LABELS[activeRegion] || 'All 5 States'
  const badge = LLM_BADGE[llmSource] || LLM_BADGE.default

  const scrollBottom = () =>
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

  // LLM query
  const sendQuery = async (queryText) => {
    const q = (queryText || input).trim()
    if (!q || loading) return
    setInput('')
    addAgentMessage({ role: 'user', text: q, ts: Date.now() })
    setLoading(true)
    scrollBottom()
    try {
      const liveCtx  = buildLiveContext(safeObjects, activeRegion)
      const fullQuery = [
        liveCtx, ``,
        `Current operator view: ${regionLabel}`,
        `Question: ${q}`, ``,
        `Answer based strictly on the live snapshot above. Be concise and operational.`,
      ].join('\n')
      const { data } = await agentQuery(fullQuery)
      if (data.llm_source === 'groq_key1' || data.llm_source === 'groq_key2') {
        setLlmSource(data.llm_source)
      }
      addAgentMessage({
        role: 'assistant',
        text: data.answer || 'No response.',
        src: (data.llm_source === 'groq_key1' || data.llm_source === 'groq_key2') ? data.llm_source : null,
        ts: Date.now(),
      })
    } catch {
      addAgentMessage({ role: 'assistant', text: 'Unable to process request at this time.', src: null, ts: Date.now() })
    }
    setLoading(false)
    scrollBottom()
  }

  // Instant retrieval — no API call
  const handleRetrievalAnswer = (question, answer) => {
    addAgentMessage({ role: 'user',      text: question, ts: Date.now() })
    addAgentMessage({ role: 'assistant', text: answer, src: 'retrieval', ts: Date.now() })
    scrollBottom()
  }

  const isEmpty = agentMessages.length === 0

  return (
    <div className="h-full flex flex-col">

      {/* ── Header ── */}
      <div className="panel-header">
        <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5 tracking-wide">
          <Bot size={12} />
          AI — {regionLabel}
        </span>
        <span className="text-xs text-blue-500 font-mono">
          {safeObjects.length > 0 ? `${safeObjects.length} objects live` : 'waiting…'}
        </span>
      </div>

      {/* ── Badge row + Anomaly button ── */}
      <div className="mx-3 mt-2 flex gap-2 flex-shrink-0">
        <div className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${badge.bg} ${badge.border}`}>
          <Radio size={10} className={`${badge.color} flex-shrink-0 animate-pulse`} />
          <span className={`${badge.color} truncate`}>{badge.label}</span>
          <span className="text-gray-600 text-xs ml-auto flex-shrink-0">ctx:{safeObjects.length}</span>
        </div>

        {/* ⚡ Anomaly Analysis toggle button */}
        <button
          onClick={() => setShowAnomaly(v => !v)}
          title="AI Anomaly Analysis — 5 intelligence data points"
          className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all duration-200
            ${showAnomaly
              ? 'bg-orange-700/50 border-orange-500/80 text-orange-100 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
              : 'bg-orange-950/30 border-orange-800/50 text-orange-400 hover:bg-orange-900/40 hover:border-orange-600/60 hover:text-orange-200'}`}
        >
          <Zap size={11} className={showAnomaly ? 'animate-pulse' : ''} />
          <span className="hidden sm:inline">Anomaly</span>
        </button>
      </div>

      {/* ── Anomaly Analysis panel (scrollable inset) ── */}
      {showAnomaly && (
        <div className="mt-2 overflow-y-auto flex-shrink-0" style={{ maxHeight: '52%' }}>
          <AnomalyAnalysisPanel onClose={() => setShowAnomaly(false)} />
        </div>
      )}

      {/* ── Messages + empty state ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">

        {isEmpty && !showAnomaly && (
          <div className="space-y-3">
            <Top20QA objects={safeObjects} onAnswer={handleRetrievalAnswer} />

            <div className="flex items-center gap-2 px-1">
              <div className="flex-1 h-px bg-gray-800/80" />
              <span className="text-gray-700 text-xs px-1">or ask freely</span>
              <div className="flex-1 h-px bg-gray-800/80" />
            </div>

            <div className="flex flex-col gap-1 pb-1">
              {QUICK_QUERIES.map(q => (
                <button
                  key={q}
                  onClick={() => sendQuery(q)}
                  className="text-left text-xs text-blue-500 hover:text-blue-300 border border-blue-900/70 hover:border-blue-700 rounded px-2.5 py-1.5 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {agentMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] px-3 py-2 rounded-lg text-xs leading-relaxed
              ${msg.role === 'user'
                ? 'bg-blue-700 text-white'
                : 'bg-gray-800/80 text-gray-200 border border-gray-700/60'}`}>
              <div className="whitespace-pre-wrap">{msg.text}</div>
              {msg.src === 'retrieval' && (
                <div className="mt-1 text-indigo-500 text-xs flex items-center gap-1">
                  <HelpCircle size={8} /> instant retrieval · no API call
                </div>
              )}
              {msg.src && msg.src !== 'retrieval' && (
                <div className={`mt-1 text-xs ${LLM_BADGE[msg.src]?.color || 'text-gray-500'}`}>
                  via {LLM_BADGE[msg.src]?.label || msg.src}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800/80 border border-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
              Analysing live data…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="p-3 border-t border-gray-700/60 flex gap-2 flex-shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendQuery()}
          placeholder={`Ask about ${regionLabel}…`}
          className="flex-1 bg-gray-800/80 border border-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-600 transition-colors"
        />
        <button
          onClick={() => sendQuery()}
          disabled={loading || !input.trim()}
          className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors flex-shrink-0"
        >
          <Send size={12} />
        </button>
      </div>

    </div>
  )
}