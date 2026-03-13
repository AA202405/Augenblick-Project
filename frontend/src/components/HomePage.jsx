import { useEffect, useRef, useState } from 'react'

const BOOT_LINES = [
  { text: '> AIRSPACE MONITOR v2.0  INITIALISING...', color: '#38bdf8', delay: 0    },
  { text: '> STATIC SIMULATION ENGINE............ OK', color: '#4ade80', delay: 500  },
  { text: '> 20 OBJECTS LOADED (5 STATES)......... OK', color: '#4ade80', delay: 960  },
  { text: '> ML CLASSIFIER (RandomForest)......... OK', color: '#4ade80', delay: 1380 },
  { text: '> ANOMALY DETECTION (IsolationForest).. OK', color: '#4ade80', delay: 1760 },
  { text: '> TRAJECTORY PREDICTOR................ OK', color: '#4ade80', delay: 2100 },
  { text: '> RISK ENGINE (weighted formula)....... OK', color: '#4ade80', delay: 2400 },
  { text: '> RESTRICTED ZONES LOADED.............. 5',  color: '#fbbf24', delay: 2700 },
  { text: '> COVERAGE: MH · GOA · TS · GJ · DEL',      color: '#c084fc', delay: 2980 },
  { text: '> AI AGENT  GROQ LLaMA3-70B......... LIVE', color: '#4ade80', delay: 3250 },
  { text: '> WEBSOCKET BROADCAST @ 2s............. OK', color: '#4ade80', delay: 3520 },
  { text: '> SYSTEM READY — AWAITING OPERATOR',         color: '#f87171', delay: 3820, blink: true },
]

const TICKER = [
  '⚠ DRONE-MUM-01 entering Mumbai TMA — CRITICAL',
  '🚫 UNK-DEL-02 no transponder — Approaching Delhi — HIGH',
  '⚡ IX404 abrupt altitude drop — Maharashtra',
  '📡 20 simulation objects active — 5 states',
  '🔴 DRONE-HYD-02 low altitude + high speed — Telangana',
  '✈ AI101 Mumbai → Delhi nominal — LOW risk',
  '⚡ QP505 erratic heading deviation — HIGH',
  '🟠 IAF-HEL02 speed burst detected — Gujarat',
  '✅ GOA Naval airspace — monitoring active',
  '🤖 AI agent summary generated — Groq LLaMA3',
].join('      ·      ')

const STATE_TILES = [
  { id:'all',         icon:'🗺️', label:'All 5 States',  sub:'Full coverage',       accent:'#38bdf8', obj:'20', zones:5  },
  { id:'maharashtra', icon:'🏙️', label:'Maharashtra',    sub:'Mumbai · Pune',       accent:'#fb923c', obj:'7',  zones:1  },
  { id:'goa',         icon:'🏖️', label:'Goa',            sub:'Panaji · Naval',      accent:'#4ade80', obj:'3',  zones:1  },
  { id:'telangana',   icon:'🏰', label:'Telangana',      sub:'Hyderabad',           accent:'#facc15', obj:'4',  zones:1  },
  { id:'gujarat',     icon:'⚓', label:'Gujarat',        sub:'Ahmedabad',           accent:'#22d3ee', obj:'3',  zones:1  },
  { id:'delhi',       icon:'🏛️', label:'Delhi / NCR',    sub:'Delhi TMA',           accent:'#c084fc', obj:'3',  zones:1  },
]

const SZ=220, CX=110, CY=110, R=96, TRAIL=55
const BLIPS=[
  {a:22,r:0.44},{a:75,r:0.66},{a:122,r:0.33},{a:168,r:0.78},
  {a:210,r:0.52},{a:255,r:0.40},{a:298,r:0.61},{a:335,r:0.29},{a:52,r:0.85},
]
function polar(deg,radius){
  const rad=(deg-90)*(Math.PI/180)
  return[CX+radius*Math.cos(rad),CY+radius*Math.sin(rad)]
}
function wedge(angle,trail,r){
  const[tx,ty]=polar(angle,r),[sx,sy]=polar(angle-trail,r)
  return`M ${CX} ${CY} L ${sx} ${sy} A ${r} ${r} 0 0 1 ${tx} ${ty} Z`
}

function Radar(){
  const svgRef=useRef(null)
  const st=useRef({angle:0,ages:BLIPS.map(()=>1),last:null})
  useEffect(()=>{
    let raf
    const tick=(now)=>{
      const s=st.current
      const dt=s.last?(now-s.last)/1000:0
      s.last=now; s.angle=(s.angle+dt*36)%360
      BLIPS.forEach((_,i)=>{
        const diff=((s.angle-BLIPS[i].a)+360)%360
        if(diff<5)s.ages[i]=0
        else s.ages[i]=Math.min(1,s.ages[i]+dt*0.4)
      })
      const svg=svgRef.current
      if(svg){
        svg.querySelector('#rw')?.setAttribute('d',wedge(s.angle,TRAIL,R))
        const ln=svg.querySelector('#rl')
        if(ln){const[lx,ly]=polar(s.angle,R);ln.setAttribute('x2',lx);ln.setAttribute('y2',ly)}
        BLIPS.forEach((_,i)=>{
          const el=svg.querySelector(`#rb${i}`)
          if(!el)return
          el.style.opacity=Math.max(0.05,1-s.ages[i]*0.93)
          el.style.transform=`scale(${1+(1-s.ages[i])*1.3})`
        })
      }
      raf=requestAnimationFrame(tick)
    }
    raf=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(raf)
  },[])
  const[lx0,ly0]=polar(0,R)
  return(
    <svg ref={svgRef} width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} style={{display:'block'}}>
      <defs>
        <radialGradient id="rbg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#0f766e" stopOpacity="0.22"/>
          <stop offset="100%" stopColor="#0f766e" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="rsg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#2dd4bf" stopOpacity="0.45"/>
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0"/>
        </radialGradient>
        <filter id="rbf"><feGaussianBlur in="SourceGraphic" stdDeviation="3"/></filter>
        <filter id="rlf" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx={CX} cy={CY} r={R} fill="url(#rbg)"/>
      {[0.25,0.5,0.75,1].map(f=>(
        <circle key={f} cx={CX} cy={CY} r={R*f} fill="none" stroke="#0d9488" strokeWidth="0.6" strokeOpacity="0.35"/>
      ))}
      {[0,45,90,135].map(d=>{
        const[ax,ay]=polar(d,R),[bx,by]=polar(d+180,R)
        return<line key={d} x1={ax} y1={ay} x2={bx} y2={by} stroke="#0d9488" strokeWidth="0.4" strokeOpacity="0.2"/>
      })}
      {[0,90,180,270].map(d=>{
        const[px,py]=polar(d,R+10)
        return<text key={d} x={px} y={py} fill="#0d9488" fontSize="8" textAnchor="middle" dominantBaseline="middle" opacity="0.5">{d}°</text>
      })}
      <path id="rw" d={wedge(0,TRAIL,R)} fill="url(#rsg)"/>
      <line id="rl" x1={CX} y1={CY} x2={lx0} y2={ly0} stroke="#2dd4bf" strokeWidth="1.8" strokeOpacity="0.9" filter="url(#rlf)"/>
      {BLIPS.map((b,i)=>{
        const[bx,by]=polar(b.a,R*b.r)
        return(
          <g key={i} id={`rb${i}`} style={{opacity:0.05,transformOrigin:`${bx}px ${by}px`}}>
            <circle cx={bx} cy={by} r={7} fill="#38bdf8" filter="url(#rbf)"/>
            <circle cx={bx} cy={by} r={2.5} fill="#38bdf8"/>
          </g>
        )
      })}
      <circle cx={CX} cy={CY} r={3} fill="#2dd4bf"/>
      <circle cx={CX} cy={CY} r={7} fill="none" stroke="#2dd4bf" strokeWidth="0.8" strokeOpacity="0.4"/>
    </svg>
  )
}

export default function HomePage({ onEnter }) {
  const [lines,    setLines]    = useState([])
  const [bootDone, setBootDone] = useState(false)
  const [selected, setSelected] = useState(null)
  const [hovered,  setHovered]  = useState(null)
  const [counts,   setCounts]   = useState({ objects:0, zones:0, states:0 })

  useEffect(()=>{
    const timers=BOOT_LINES.map(({text,color,delay,blink},i)=>
      setTimeout(()=>{
        setLines(prev=>[...prev,{text,color,blink:!!blink}])
        if(i===BOOT_LINES.length-1) setTimeout(()=>setBootDone(true),280)
      },delay)
    )
    return()=>timers.forEach(clearTimeout)
  },[])

  useEffect(()=>{
    if(!bootDone)return
    const T={objects:20,zones:5,states:5}
    let step=0
    const iv=setInterval(()=>{
      step++; const f=step/40
      setCounts({objects:Math.round(T.objects*f),zones:Math.round(T.zones*f),states:Math.round(T.states*f)})
      if(step>=40)clearInterval(iv)
    },22)
    return()=>clearInterval(iv)
  },[bootDone])

  const selectedTile=STATE_TILES.find(s=>s.id===selected)

  return(
    <div className="fixed inset-0 bg-gray-950 flex flex-col overflow-hidden select-none"
      style={{fontFamily:"'Courier New',monospace"}}>

      {/* Grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:'linear-gradient(rgba(56,189,248,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,0.025) 1px,transparent 1px)',
        backgroundSize:'52px 52px',
      }}/>
      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:'repeating-linear-gradient(0deg,rgba(0,0,0,0.06),rgba(0,0,0,0.06) 1px,transparent 1px,transparent 3px)',
      }}/>

      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-6 py-2.5 border-b border-gray-800/70 flex-shrink-0"
        style={{background:'rgba(2,6,23,0.97)'}}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" style={{boxShadow:'0 0 8px #4ade80'}}/>
          <span className="text-green-400 text-xs tracking-widest">SIMULATION ACTIVE</span>
        </div>
        <div className="text-center">
          <div className="text-white font-black text-xl tracking-widest" style={{textShadow:'0 0 20px rgba(56,189,248,0.4)'}}>
            AIRSPACE MONITOR
          </div>
          <div className="text-sky-700 text-xs tracking-widest">INDIA · AGENTIC AI SIMULATION</div>
        </div>
        <div className="text-gray-600 text-xs tracking-wider tabular-nums">
          {new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})} IST
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 flex-1 flex overflow-hidden min-h-0">

        {/* Left — Radar */}
        <div className="w-68 flex-shrink-0 border-r border-gray-800/60 flex flex-col items-center justify-center gap-4 px-5 py-5"
          style={{background:'rgba(2,6,23,0.75)',minWidth:240}}>
          <div className="relative">
            <div className="absolute inset-0 rounded-full pointer-events-none"
              style={{boxShadow:'inset 0 0 28px rgba(13,148,136,0.12),0 0 36px rgba(13,148,136,0.07)'}}/>
            <Radar/>
          </div>
          <div className="text-center">
            <div className="text-teal-600 text-xs tracking-widest">SURVEILLANCE RADAR</div>
            <div className="text-gray-700 text-xs mt-0.5">5-STATE COVERAGE</div>
          </div>
          <div className={`w-full grid grid-cols-3 gap-2 transition-opacity duration-700 ${bootDone?'opacity-100':'opacity-0'}`}>
            {[
              {label:'OBJECTS',val:counts.objects,color:'#38bdf8'},
              {label:'ZONES',  val:counts.zones,  color:'#f87171'},
              {label:'STATES', val:counts.states, color:'#4ade80'},
            ].map(s=>(
              <div key={s.label} className="rounded-lg border border-gray-800 p-2 text-center" style={{background:'rgba(0,0,0,0.5)'}}>
                <div className="font-black text-lg tabular-nums" style={{color:s.color,textShadow:`0 0 10px ${s.color}50`}}>{s.val}</div>
                <div className="text-gray-700 text-xs tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Centre */}
        <div className="flex-1 flex flex-col justify-between py-5 px-6 min-w-0 overflow-hidden">

          {/* Boot terminal */}
          <div className="rounded-xl border border-gray-800 overflow-hidden flex-shrink-0" style={{background:'rgba(0,0,0,0.65)',maxHeight:200}}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/80" style={{background:'rgba(0,0,0,0.4)'}}>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/70"/>
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70"/>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/70"/>
              </div>
              <span className="text-gray-700 text-xs tracking-widest ml-2">SYSTEM BOOT — airspace@monitor:~</span>
            </div>
            <div className="p-4 space-y-0.5 overflow-y-auto" style={{maxHeight:148}}>
              {lines.map((line,i)=>(
                <div key={i} className={`text-xs leading-relaxed ${line.blink?'animate-pulse':''}`}
                  style={{color:line.color,letterSpacing:'0.04em'}}>
                  {line.text}
                </div>
              ))}
              {!bootDone&&<div className="text-xs text-gray-700 boot-cursor">▋</div>}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-3 flex-shrink-0">
            <div className="h-px flex-1 bg-gray-800"/>
            <span className="text-gray-700 text-xs tracking-widest">SELECT MONITORING REGION</span>
            <div className="h-px flex-1 bg-gray-800"/>
          </div>

          {/* State tiles */}
          <div className="grid grid-cols-3 gap-2 flex-shrink-0">
            {STATE_TILES.map(tile=>{
              const isSel=selected===tile.id
              const isHov=hovered===tile.id
              return(
                <button key={tile.id}
                  onClick={()=>setSelected(tile.id===selected?null:tile.id)}
                  onMouseEnter={()=>setHovered(tile.id)}
                  onMouseLeave={()=>setHovered(null)}
                  className="relative text-left rounded-xl border p-3 transition-all duration-200 overflow-hidden"
                  style={{
                    borderColor:isSel?tile.accent:isHov?'#374151':'#1f2937',
                    background:isSel?`linear-gradient(135deg,${tile.accent}14,${tile.accent}07)`:isHov?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.45)',
                    boxShadow:isSel?`0 0 18px ${tile.accent}22`:undefined,
                  }}>
                  {isSel&&<span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full animate-pulse" style={{background:tile.accent,boxShadow:`0 0 6px ${tile.accent}`}}/>}
                  <div className="text-xl mb-1">{tile.icon}</div>
                  <div className="text-xs font-bold text-white mb-0.5 truncate">{tile.label}</div>
                  <div className="text-xs text-gray-600 mb-1.5 truncate">{tile.sub}</div>
                  <div className="flex gap-1.5">
                    <span className="text-xs px-1.5 py-0.5 rounded-md font-mono" style={{background:`${tile.accent}1a`,color:tile.accent}}>{tile.obj} obj</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-800/80 text-gray-600 font-mono">{tile.zones}z</span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* CTA */}
          <div className="mt-4 flex flex-col items-center gap-2 flex-shrink-0">
            <button onClick={()=>onEnter(selected)} disabled={!bootDone}
              className="relative w-full max-w-sm py-3.5 rounded-xl font-black tracking-widest text-sm overflow-hidden transition-all duration-300 group disabled:opacity-25 disabled:cursor-not-allowed"
              style={{
                background:bootDone?'linear-gradient(135deg,#0c4a6e,#0369a1 50%,#0c4a6e)':'#0f172a',
                border:`1px solid ${bootDone?'#38bdf8':'#1e293b'}`,
                boxShadow:bootDone?'0 0 28px rgba(56,189,248,0.28)':'none',color:'white',
              }}>
              {bootDone&&(
                <div className="absolute inset-0 -skew-x-12 -translate-x-full group-hover:translate-x-[120%] transition-transform duration-700"
                  style={{background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)'}}/>
              )}
              <span className="relative z-10 flex items-center justify-center gap-3">
                <span>✈</span>ACCESS SYSTEM<span className="text-sky-300 text-xs">▶</span>
              </span>
            </button>
            <div className="text-xs text-gray-700 h-4">
              {selectedTile
                ? <>Opening: <span style={{color:selectedTile.accent}}>{selectedTile.label}</span> — switch region from map anytime</>
                : bootDone?'No region selected — will show all 5 states':'Initialising…'}
            </div>
          </div>
        </div>

        {/* Right — capabilities */}
        <div className="w-52 flex-shrink-0 border-l border-gray-800/60 flex flex-col justify-center gap-1.5 px-4 py-5 overflow-y-auto"
          style={{background:'rgba(2,6,23,0.75)'}}>
          <div className="text-gray-700 text-xs tracking-widest mb-1">CAPABILITIES</div>
          {[
            {icon:'📡',title:'WebSocket Feed',    desc:'2-second live tick · 20 simulated objects'},
            {icon:'🤖',title:'AI Agent',           desc:'Groq LLaMA3-70B · 6 LangChain tools'},
            {icon:'🔴',title:'Risk Engine',        desc:'Weighted formula · hard override rules'},
            {icon:'📍',title:'Trajectory',         desc:'8-step predicted path + history trail'},
            {icon:'🔊',title:'Voice Alerts',       desc:'Web Speech API · CRITICAL priority queue'},
            {icon:'🚫',title:'Restricted Zones',   desc:'5 zones · Mumbai·Delhi·Goa·Hyd·Ahm'},
            {icon:'🧠',title:'Anomaly Detection',  desc:'IsolationForest + rule-based fallback'},
          ].map((cap,i)=>(
            <div key={i} className="rounded-lg border border-gray-800/60 p-2 hover:border-gray-700 transition-colors"
              style={{background:'rgba(0,0,0,0.35)'}}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm">{cap.icon}</span>
                <span className="text-xs font-bold text-gray-300">{cap.title}</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{cap.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ticker */}
      <div className="relative z-20 border-t border-gray-800/70 flex-shrink-0 overflow-hidden"
        style={{background:'rgba(2,6,23,0.97)',height:28}}>
        <div className="flex items-center h-full">
          <div className="flex-shrink-0 flex items-center gap-2 px-3 h-full border-r border-gray-800">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>
            <span className="text-red-500 text-xs font-black tracking-widest">LIVE</span>
          </div>
          <div className="flex-1 overflow-hidden h-full flex items-center">
            <div className="ticker-track">
              <span className="text-xs text-gray-600 pr-20">{TICKER}</span>
              <span className="text-xs text-gray-600 pr-20">{TICKER}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
