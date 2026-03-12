/**
 * HomePage.jsx — Augenblick landing page
 * Mix: Radar Room + Mission Briefing terminal + State tiles + Alert ticker
 *
 * Props:
 *   onEnter(preselectedRegion | null)
 *
 * Rules: zero store writes, zero auth side-effects, all animation via RAF/DOM.
 */
import { useEffect, useRef, useState } from 'react'

// ── Boot lines ────────────────────────────────────────────────────────────────
const BOOT_LINES = [
  { text: '> AUGENBLICK v1.0.0  INITIALISING...',  color: '#38bdf8', delay: 0    },
  { text: '> AIRSPACE DATABASE................. OK', color: '#4ade80', delay: 480  },
  { text: '> OPENSKY NETWORK FEED.............. OK', color: '#4ade80', delay: 940  },
  { text: '> ML CLASSIFIER (RandomForest)...... OK', color: '#4ade80', delay: 1360 },
  { text: '> TRAJECTORY MODEL (HGBT)........... OK', color: '#4ade80', delay: 1740 },
  { text: '> ISOLATION FOREST ANOMALY DET...... OK', color: '#4ade80', delay: 2080 },
  { text: '> RESTRICTED ZONES LOADED............ 7', color: '#fbbf24', delay: 2380 },
  { text: '> COVERAGE: MH · GA · KA · TS · GJ',    color: '#c084fc', delay: 2680 },
  { text: '> AI AGENT  GROQ / GEMINI......... LIVE', color: '#4ade80', delay: 3020 },
  { text: '> WEBSOCKET BROADCAST @ 2s.......... OK', color: '#4ade80', delay: 3300 },
  { text: '> AWAITING OPERATOR AUTHENTICATION',      color: '#f87171', delay: 3660, blink: true },
]

// ── Ticker ────────────────────────────────────────────────────────────────────
const TICKER_MSGS = [
  '⚠ OS-800BE6 entered Mumbai CSIA exclusion zone — CRITICAL',
  '✈ AIR-FED313 risk score 74 — HIGH — Maharashtra',
  '🚫 DRO-4F41F2 no transponder — UNKNOWN type — Gujarat',
  '📡 OpenSky feed: 51 live flights ingested — All 5 States',
  '⚡ AIR-3A2500 rapid altitude change +1200 m/min — Anomaly',
  '🔴 OS-8016B9 breached Pune Air Base zone — CRITICAL',
  '✅ Karwar Naval Base airspace — CLEAR',
  '⚡ BIR-09AA12 erratic heading — 127° deviation',
  '🟠 UNK-0AF3FF unknown + no transponder — HIGH — Telangana',
  '🤖 AI Agent summary generated — 58 objects active',
]
const TICKER_TEXT = TICKER_MSGS.join('          ·          ')

// ── State tiles ───────────────────────────────────────────────────────────────
const STATE_TILES = [
  { id: 'all',         icon: '🗺️', label: 'All 5 States',  sub: 'Full Coverage',          accent: '#38bdf8', objects: '58+', zones: 7 },
  { id: 'maharashtra', icon: '🏙️', label: 'Maharashtra',    sub: 'Mumbai · Pune · Nashik', accent: '#fb923c', objects: '22',  zones: 3 },
  { id: 'goa',         icon: '🏖️', label: 'Goa',            sub: 'Panaji · Vasco',         accent: '#4ade80', objects: '4',   zones: 1 },
  { id: 'karnataka',   icon: '🌿', label: 'Karnataka',      sub: 'Bengaluru · Karwar',     accent: '#c084fc', objects: '11',  zones: 1 },
  { id: 'telangana',   icon: '🏰', label: 'Telangana',      sub: 'Hyderabad',              accent: '#facc15', objects: '9',   zones: 1 },
  { id: 'gujarat',     icon: '⚓', label: 'Gujarat',        sub: 'Ahmedabad · Surat',      accent: '#22d3ee', objects: '12',  zones: 0 },
]

// ── Radar blips ───────────────────────────────────────────────────────────────
const BLIPS = [
  { a: 28,  r: 0.44, type: 'aircraft' }, { a: 72,  r: 0.67, type: 'drone'    },
  { a: 118, r: 0.31, type: 'aircraft' }, { a: 157, r: 0.75, type: 'unknown'  },
  { a: 203, r: 0.52, type: 'aircraft' }, { a: 241, r: 0.39, type: 'bird'     },
  { a: 287, r: 0.62, type: 'aircraft' }, { a: 328, r: 0.28, type: 'drone'    },
  { a: 351, r: 0.81, type: 'aircraft' }, { a: 48,  r: 0.88, type: 'aircraft' },
  { a: 98,  r: 0.57, type: 'unknown'  }, { a: 223, r: 0.73, type: 'aircraft' },
]
const BLIP_COLOR = { aircraft: '#38bdf8', drone: '#c084fc', bird: '#4ade80', unknown: '#fbbf24' }

// ── Radar geometry ────────────────────────────────────────────────────────────
const SZ = 240, CX = SZ / 2, CY = SZ / 2, R = 108, TRAIL = 55

function polar(deg, radius) {
  const rad = (deg - 90) * (Math.PI / 180)
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)]
}
function wedgePath(angle, trail, radius) {
  const [tx, ty] = polar(angle, radius)
  const [sx, sy] = polar(angle - trail, radius)
  return `M ${CX} ${CY} L ${sx} ${sy} A ${radius} ${radius} 0 0 1 ${tx} ${ty} Z`
}

// Inject ticker CSS once
if (typeof document !== 'undefined' && !document.getElementById('hp-anim')) {
  const s = document.createElement('style')
  s.id = 'hp-anim'
  s.textContent = `
    @keyframes hp-tick { from{transform:translateX(0)} to{transform:translateX(-50%)} }
    .hp-tick { animation: hp-tick 42s linear infinite; display:inline-block; white-space:nowrap; }
  `
  document.head.appendChild(s)
}

// ── Radar — writes directly to DOM each frame, no React re-renders ────────────
function Radar() {
  const svgRef = useRef(null)
  const state  = useRef({ angle: 0, ages: BLIPS.map(() => 1), last: null })

  useEffect(() => {
    let raf
    const tick = (now) => {
      const s  = state.current
      const dt = s.last ? (now - s.last) / 1000 : 0
      s.last   = now
      s.angle  = (s.angle + dt * 34) % 360   // ~10.6 sec/revolution

      BLIPS.forEach((b, i) => {
        const diff = ((s.angle - b.a) + 360) % 360
        if (diff < 6) s.ages[i] = 0
        else          s.ages[i] = Math.min(1, s.ages[i] + dt * 0.38)
      })

      const svg = svgRef.current
      if (svg) {
        const wedge = svg.querySelector('#hp-wedge')
        const line  = svg.querySelector('#hp-line')
        if (wedge) wedge.setAttribute('d', wedgePath(s.angle, TRAIL, R))
        if (line) {
          const [lx, ly] = polar(s.angle, R)
          line.setAttribute('x2', lx); line.setAttribute('y2', ly)
        }
        BLIPS.forEach((_, i) => {
          const el = svg.querySelector(`#hp-blip-${i}`)
          if (!el) return
          const opacity = Math.max(0.06, 1 - s.ages[i] * 0.92)
          const scale   = 1 + (1 - s.ages[i]) * 1.4
          el.style.opacity   = opacity
          el.style.transform = `scale(${scale})`
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const [lx0, ly0] = polar(0, R)

  return (
    <svg ref={svgRef} width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} style={{ display: 'block' }}>
      <defs>
        <radialGradient id="hp-rbg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#0f766e" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#0f766e" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="hp-swg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#2dd4bf" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0"/>
        </radialGradient>
        <filter id="hp-bg"><feGaussianBlur in="SourceGraphic" stdDeviation="3"/></filter>
        <filter id="hp-lg" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <circle cx={CX} cy={CY} r={R} fill="url(#hp-rbg)"/>
      {[0.25, 0.5, 0.75, 1].map(f =>
        <circle key={f} cx={CX} cy={CY} r={R*f} fill="none" stroke="#0d9488" strokeWidth="0.6" strokeOpacity="0.35"/>
      )}
      {[0,45,90,135].map(d => {
        const [ax,ay] = polar(d, R); const [bx,by] = polar(d+180, R)
        return <line key={d} x1={ax} y1={ay} x2={bx} y2={by} stroke="#0d9488" strokeWidth="0.4" strokeOpacity="0.2"/>
      })}
      {[0,90,180,270].map(d => {
        const [px,py] = polar(d, R+10)
        return <text key={d} x={px} y={py} fill="#0d9488" fontSize="8" textAnchor="middle" dominantBaseline="middle" opacity="0.5">{d}°</text>
      })}

      <path id="hp-wedge" d={wedgePath(0, TRAIL, R)} fill="url(#hp-swg)"/>
      <line id="hp-line" x1={CX} y1={CY} x2={lx0} y2={ly0}
        stroke="#2dd4bf" strokeWidth="1.8" strokeOpacity="0.9" filter="url(#hp-lg)"/>

      {BLIPS.map((b, i) => {
        const [bx,by] = polar(b.a, R*b.r)
        const c = BLIP_COLOR[b.type]
        return (
          <g key={i} id={`hp-blip-${i}`}
            style={{ opacity:0.06, transformOrigin:`${bx}px ${by}px`, transition:'none' }}>
            <circle cx={bx} cy={by} r={7} fill={c} filter="url(#hp-bg)"/>
            <circle cx={bx} cy={by} r={2.5} fill={c}/>
          </g>
        )
      })}

      <circle cx={CX} cy={CY} r={3} fill="#2dd4bf"/>
      <circle cx={CX} cy={CY} r={7} fill="none" stroke="#2dd4bf" strokeWidth="0.8" strokeOpacity="0.35"/>
    </svg>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage({ onEnter }) {
  const [lines,    setLines]    = useState([])
  const [bootDone, setBootDone] = useState(false)
  const [selected, setSelected] = useState(null)
  const [hovered,  setHovered]  = useState(null)
  const [counts,   setCounts]   = useState({ objects: 0, zones: 0, states: 0 })

  // Boot sequence
  useEffect(() => {
    const timers = BOOT_LINES.map(({ text, color, delay, blink }, i) =>
      setTimeout(() => {
        setLines(prev => [...prev, { text, color, blink: !!blink }])
        if (i === BOOT_LINES.length - 1) setTimeout(() => setBootDone(true), 300)
      }, delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  // Count-up animation
  useEffect(() => {
    if (!bootDone) return
    const T = { objects: 58, zones: 7, states: 5 }
    let step = 0
    const iv = setInterval(() => {
      step++
      const f = step / 45
      setCounts({ objects: Math.round(T.objects*f), zones: Math.round(T.zones*f), states: Math.round(T.states*f) })
      if (step >= 45) clearInterval(iv)
    }, 22)
    return () => clearInterval(iv)
  }, [bootDone])

  const selectedTile = STATE_TILES.find(s => s.id === selected)

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col overflow-hidden"
      style={{ fontFamily: "'Courier New', Courier, monospace", userSelect: 'none' }}>

      {/* Grid texture */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(56,189,248,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,0.025) 1px,transparent 1px)',
        backgroundSize: '52px 52px',
      }}/>
      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.06),rgba(0,0,0,0.06) 1px,transparent 1px,transparent 3px)',
      }}/>

      {/* ── TOP BAR ── */}
      <header className="relative z-20 flex items-center justify-between px-6 py-2.5 border-b border-gray-800/70 flex-shrink-0"
        style={{ background: 'rgba(2,6,23,0.97)' }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"
            style={{ boxShadow: '0 0 8px #4ade80' }}/>
          <span className="text-green-400 text-xs tracking-[0.2em]">ALL SYSTEMS NOMINAL</span>
        </div>
        <div className="text-center">
          <div className="text-white font-black text-xl tracking-[0.35em]"
            style={{ textShadow: '0 0 20px rgba(56,189,248,0.4)' }}>AUGENBLICK</div>
          <div className="text-sky-700 text-xs tracking-[0.2em]">INTELLIGENT AIRSPACE MONITOR</div>
        </div>
        <div className="text-gray-700 text-xs tracking-wider tabular-nums">
          {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} IST
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="relative z-10 flex-1 flex overflow-hidden min-h-0">

        {/* LEFT — Radar panel */}
        <div className="w-72 flex-shrink-0 border-r border-gray-800/60 flex flex-col items-center justify-center gap-4 px-5 py-5"
          style={{ background: 'rgba(2,6,23,0.75)' }}>

          <div className="relative">
            <div className="absolute inset-0 rounded-full pointer-events-none"
              style={{ boxShadow: 'inset 0 0 28px rgba(13,148,136,0.12), 0 0 36px rgba(13,148,136,0.07)' }}/>
            <Radar/>
          </div>

          <div className="text-center">
            <div className="text-teal-600 text-xs tracking-[0.2em]">SURVEILLANCE RADAR</div>
            <div className="text-gray-700 text-xs mt-0.5">5-STATE COVERAGE ZONE</div>
          </div>

          {/* Blip legend */}
          <div className="w-full grid grid-cols-2 gap-1.5">
            {Object.entries(BLIP_COLOR).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: color, boxShadow: `0 0 5px ${color}` }}/>
                <span className="text-gray-600 text-xs capitalize">{type}</span>
              </div>
            ))}
          </div>

          {/* Live counters */}
          <div className={`w-full grid grid-cols-3 gap-2 transition-opacity duration-700 ${bootDone ? 'opacity-100' : 'opacity-0'}`}>
            {[
              { label: 'OBJECTS', val: counts.objects, color: '#38bdf8' },
              { label: 'ZONES',   val: counts.zones,   color: '#f87171' },
              { label: 'STATES',  val: counts.states,  color: '#4ade80' },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-gray-800 p-2 text-center"
                style={{ background: 'rgba(0,0,0,0.5)' }}>
                <div className="font-black text-lg tabular-nums"
                  style={{ color: s.color, textShadow: `0 0 10px ${s.color}50` }}>{s.val}</div>
                <div className="text-gray-700 text-xs tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTRE — Terminal + tiles + CTA */}
        <div className="flex-1 flex flex-col justify-between py-5 px-6 min-w-0 overflow-hidden">

          {/* Boot terminal */}
          <div className="rounded-xl border border-gray-800 overflow-hidden flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.65)', maxHeight: '205px' }}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/80"
              style={{ background: 'rgba(0,0,0,0.4)' }}>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/70"/>
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70"/>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/70"/>
              </div>
              <span className="text-gray-700 text-xs tracking-widest ml-2">SYSTEM BOOT LOG — augenblick@atc:~</span>
            </div>
            <div className="p-4 space-y-0.5 overflow-y-auto" style={{ maxHeight: '155px' }}>
              {lines.map((line, i) => (
                <div key={i} className={`text-xs leading-relaxed ${line.blink ? 'animate-pulse' : ''}`}
                  style={{ color: line.color, letterSpacing: '0.04em' }}>
                  {line.text}
                </div>
              ))}
              {!bootDone && <div className="text-xs text-gray-700 animate-pulse">▋</div>}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-3 flex-shrink-0">
            <div className="h-px flex-1 bg-gray-800"/>
            <span className="text-gray-700 text-xs tracking-[0.18em]">SELECT MONITORING REGION</span>
            <div className="h-px flex-1 bg-gray-800"/>
          </div>

          {/* State tiles */}
          <div className="grid grid-cols-3 gap-2 flex-shrink-0">
            {STATE_TILES.map(tile => {
              const isSel = selected === tile.id
              const isHov = hovered  === tile.id
              return (
                <button key={tile.id}
                  onClick={() => setSelected(tile.id === selected ? null : tile.id)}
                  onMouseEnter={() => setHovered(tile.id)}
                  onMouseLeave={() => setHovered(null)}
                  className="relative text-left rounded-xl border p-3 transition-all duration-200 overflow-hidden"
                  style={{
                    borderColor: isSel ? tile.accent : isHov ? '#374151' : '#1f2937',
                    background:  isSel ? `linear-gradient(135deg,${tile.accent}14,${tile.accent}07)` : isHov ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.45)',
                    boxShadow:   isSel ? `0 0 18px ${tile.accent}22,inset 0 0 20px ${tile.accent}06` : 'none',
                  }}>
                  {isSel && (
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: tile.accent, boxShadow: `0 0 6px ${tile.accent}` }}/>
                  )}
                  <div className="text-xl mb-1.5">{tile.icon}</div>
                  <div className="text-xs font-bold text-white mb-0.5 truncate">{tile.label}</div>
                  <div className="text-xs text-gray-600 mb-2 truncate">{tile.sub}</div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded-md font-mono"
                      style={{ background: `${tile.accent}1a`, color: tile.accent }}>{tile.objects} obj</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-800/80 text-gray-600 font-mono">{tile.zones}z</span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* CTA */}
          <div className="mt-4 flex flex-col items-center gap-2 flex-shrink-0">
            <button onClick={() => onEnter(selected)} disabled={!bootDone}
              className="relative w-full max-w-sm py-3.5 rounded-xl font-black tracking-[0.25em] text-sm overflow-hidden transition-all duration-300 group disabled:opacity-25 disabled:cursor-not-allowed"
              style={{
                background: bootDone ? 'linear-gradient(135deg,#0c4a6e,#0369a1 50%,#0c4a6e)' : '#0f172a',
                border: `1px solid ${bootDone ? '#38bdf8' : '#1e293b'}`,
                boxShadow: bootDone ? '0 0 28px rgba(56,189,248,0.28),0 0 60px rgba(56,189,248,0.07)' : 'none',
                color: 'white',
              }}>
              {/* Shimmer */}
              {bootDone && (
                <div className="absolute inset-0 -skew-x-12 -translate-x-full group-hover:translate-x-[120%] transition-transform duration-700"
                  style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)' }}/>
              )}
              <span className="relative z-10 flex items-center justify-center gap-3">
                <span>✈</span>
                ACCESS SYSTEM
                <span className="text-sky-300 text-xs">▶</span>
              </span>
            </button>
            <div className="text-xs text-gray-700 h-4">
              {selectedTile
                ? <>Opening: <span style={{ color: selectedTile.accent }}>{selectedTile.label}</span> — switch region anytime from the map</>
                : bootDone ? 'No region selected — will show all 5 states' : 'System initialising...'}
            </div>
          </div>
        </div>

        {/* RIGHT — Capabilities */}
        <div className="w-52 flex-shrink-0 border-l border-gray-800/60 flex flex-col justify-center gap-2 px-4 py-5 overflow-y-auto"
          style={{ background: 'rgba(2,6,23,0.75)' }}>
          <div className="text-gray-700 text-xs tracking-[0.2em] mb-1">CAPABILITIES</div>
          {[
            { icon: '📡', title: 'Live Feed',     desc: 'OpenSky + simulator · 2s WebSocket broadcast'   },
            { icon: '🤖', title: 'AI Agent',       desc: 'Groq LLaMA 3.3 + Gemini 2.0 · real-time tools' },
            { icon: '🔴', title: 'Risk Engine',    desc: 'Weighted ML + zone breach hard override'         },
            { icon: '📍', title: 'Trajectory',     desc: 'HistGradientBoosting · R² 0.9998'               },
            { icon: '🔊', title: 'Voice Alerts',   desc: 'Web Speech API · CRITICAL jumps queue'          },
            { icon: '🔒', title: 'Region Lock',    desc: 'Hard map bounds · per-state pipeline'           },
            { icon: '🧠', title: 'Anomaly Det.',   desc: 'IsolationForest + rule-based fallback'          },
          ].map((cap, i) => (
            <div key={i} className="rounded-lg border border-gray-800/60 p-2.5 hover:border-gray-700 transition-colors"
              style={{ background: 'rgba(0,0,0,0.35)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{cap.icon}</span>
                <span className="text-xs font-bold text-gray-300">{cap.title}</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{cap.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── TICKER ── */}
      <div className="relative z-20 border-t border-gray-800/70 flex-shrink-0 overflow-hidden"
        style={{ background: 'rgba(2,6,23,0.97)', height: '30px' }}>
        <div className="flex items-center h-full">
          <div className="flex-shrink-0 flex items-center gap-2 px-3 h-full border-r border-gray-800">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>
            <span className="text-red-500 text-xs font-black tracking-widest">LIVE</span>
          </div>
          <div className="flex-1 overflow-hidden h-full flex items-center">
            <div className="hp-tick">
              <span className="text-xs text-gray-600 pr-20">{TICKER_TEXT}</span>
              <span className="text-xs text-gray-600 pr-20">{TICKER_TEXT}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}