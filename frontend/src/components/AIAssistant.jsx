import { useState, useEffect, useRef } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'
import { agentQuery, agentSummary } from '../api/client'
import { REGION_LABELS, REGION_BOUNDS } from '../lib/regionBounds'
import { Bot, Send, RefreshCw, Zap, AlertTriangle, Radio } from 'lucide-react'
import axios from 'axios'

const LLM_BADGE = {
  groq:    { label: 'Groq · Llama 3.3',  color: 'text-green-400',  bg: 'bg-green-950/50',  border: 'border-green-700'  },
  gemini:  { label: 'Gemini 2.0 Flash',  color: 'text-blue-400',   bg: 'bg-blue-950/50',   border: 'border-blue-700'   },
  rules:   { label: 'Offline · Rules',   color: 'text-yellow-400', bg: 'bg-yellow-950/50', border: 'border-yellow-700' },
  unknown: { label: 'Initialising...',   color: 'text-gray-500',   bg: 'bg-gray-900',      border: 'border-gray-700'   },
}

/** Builds a region context prefix so the LLM knows which state is being monitored */
function buildRegionContext(activeRegion) {
  const label  = REGION_LABELS[activeRegion] || 'All 5 States'
  const bounds = REGION_BOUNDS[activeRegion]
  if (!bounds) return `[Viewing: ${label}] `
  return (
    `[Viewing: ${label} | ` +
    `lat ${bounds.latMin}–${bounds.latMax}, ` +
    `lon ${bounds.lonMin}–${bounds.lonMax}] `
  )
}

export default function AIAssistant() {
  const {
    token, agentMessages, addAgentMessage,
    agentSummary: summary, setAgentSummary,
    activeRegion,
  } = useAirspaceStore()

  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [llmMode, setLlmMode]         = useState('unknown')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const bottomRef = useRef(null)
  const convId    = useRef(`conv-${Date.now()}`)

  // Reset conversation ID when region changes so context is fresh
  const prevRegionRef = useRef(activeRegion)
  useEffect(() => {
    if (prevRegionRef.current !== activeRegion) {
      convId.current = `conv-${Date.now()}`
      prevRegionRef.current = activeRegion
      // Clear summary so stale region summary isn't shown
      setAgentSummary('')
    }
  }, [activeRegion, setAgentSummary])

  // Fetch agent LLM status
  useEffect(() => {
    if (!token) return
    const fetchStatus = async () => {
      try {
        const { data } = await axios.get('/api/agent/status', {
          headers: { Authorization: `Bearer ${token}` }
        })
        setLlmMode(data.llm_mode || 'unknown')
      } catch {}
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 15000)
    return () => clearInterval(interval)
  }, [token])

  // Auto-fetch summary every 30s — includes region context
  useEffect(() => {
    if (!token) return
    const fetchSum = async () => {
      try {
        const { data } = await agentSummary()
        setAgentSummary(data.summary)
      } catch {}
    }
    fetchSum()
    const interval = setInterval(fetchSum, 30000)
    return () => clearInterval(interval)
  }, [token, activeRegion, setAgentSummary])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentMessages])

  const refreshSummary = async () => {
    setSummaryLoading(true)
    try {
      const { data } = await agentSummary()
      setAgentSummary(data.summary)
    } catch {}
    setSummaryLoading(false)
  }

  const sendQuery = async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    addAgentMessage({ role: 'user', text: q, ts: Date.now() })
    setLoading(true)
    try {
      // Prepend region context to every query
      const regionContext = buildRegionContext(activeRegion)
      const { data } = await agentQuery(regionContext + q, convId.current)
      setLlmMode(data.llm_used || 'unknown')
      addAgentMessage({
        role: 'assistant',
        text: data.response,
        llm: data.llm_used,
        ts: Date.now(),
      })
    } catch {
      addAgentMessage({
        role: 'assistant',
        text: 'Agent unavailable. Please try again.',
        ts: Date.now(),
      })
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="panel h-full flex items-center justify-center">
        <p className="text-gray-600 text-sm">Login to access AI Assistant</p>
      </div>
    )
  }

  const badge       = LLM_BADGE[llmMode] || LLM_BADGE.unknown
  const isOffline   = llmMode === 'rules'
  const regionLabel = REGION_LABELS[activeRegion] || 'All 5 States'

  return (
    <div className="panel h-full flex flex-col">
      {/* Header */}
      <div className="panel-header">
        <span className="text-sm font-semibold text-gray-200 flex items-center gap-1.5">
          <Bot size={14} />
          AI — {regionLabel}
        </span>
        <button
          onClick={refreshSummary}
          disabled={summaryLoading}
          className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
          title="Refresh summary"
        >
          <RefreshCw size={13} className={summaryLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* LLM mode badge */}
      <div className={`mx-3 mt-2 px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${badge.bg} ${badge.border}`}>
        {isOffline
          ? <AlertTriangle size={11} className="text-yellow-400 flex-shrink-0" />
          : <Radio size={11} className={`${badge.color} flex-shrink-0 animate-pulse`} />
        }
        <span className={badge.color}>{badge.label}</span>
        {isOffline && (
          <span className="text-yellow-600 text-xs ml-auto">No API key</span>
        )}
      </div>

      {/* Auto-summary banner — labeled with region */}
      {summary && (
        <div className="mx-3 mt-2 p-2.5 bg-blue-950/60 border border-blue-800/50 rounded-lg text-xs text-blue-200 leading-relaxed">
          <p className="text-blue-400 font-semibold mb-1 text-xs flex items-center gap-1">
            <Zap size={10} />
            SUMMARY — {regionLabel}
          </p>
          <div className="whitespace-pre-wrap">{summary}</div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {agentMessages.length === 0 && (
          <div className="text-center text-gray-600 text-xs pt-4 space-y-2">
            <Bot size={24} className="mx-auto text-gray-700" />
            <p>Asking about <span className="text-blue-500">{regionLabel}</span> airspace.</p>
            <div className="flex flex-col gap-1.5 mt-3">
              {[
                'What are the critical objects?',
                'Any zone breaches right now?',
                'Summarize airspace status',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-xs text-blue-500 hover:text-blue-300 border border-blue-900
                             hover:border-blue-700 rounded px-2 py-1 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {agentMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] px-3 py-2 rounded-lg text-xs leading-relaxed
              ${msg.role === 'user'
                ? 'bg-blue-700 text-white'
                : 'bg-gray-800 text-gray-200 border border-gray-700'}`}>
              <div className="whitespace-pre-wrap">{msg.text}</div>
              {msg.llm && (
                <div className={`mt-1 text-xs ${LLM_BADGE[msg.llm]?.color || 'text-gray-500'}`}>
                  via {LLM_BADGE[msg.llm]?.label || msg.llm}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs
                            text-gray-400 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-700 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendQuery()}
          placeholder={`Ask about ${regionLabel}...`}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs
                     text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-600
                     transition-colors"
        />
        <button
          onClick={sendQuery}
          disabled={loading || !input.trim()}
          className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed
                     px-3 py-2 rounded-lg transition-colors"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}