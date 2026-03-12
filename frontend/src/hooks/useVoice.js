import { useCallback, useRef } from 'react'
import { useAirspaceStore } from '../store/airspaceStore'

const SEVERITY_CONFIG = {
  CRITICAL: { rate: 1.2, pitch: 1.5, volume: 1.0 },
  HIGH:     { rate: 1.0, pitch: 1.2, volume: 0.9 },
  MEDIUM:   { rate: 0.9, pitch: 1.0, volume: 0.8 },
  LOW:      { rate: 0.8, pitch: 0.9, volume: 0.7 },
}

export function useVoice() {
  const { voiceMuted, voiceVolume } = useAirspaceStore()
  const queue = useRef([])
  const speaking = useRef(false)

  const processQueue = useCallback(() => {
    if (speaking.current || queue.current.length === 0) return
    const { text, severity } = queue.current.shift()
    const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.MEDIUM

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate   = cfg.rate
    utterance.pitch  = cfg.pitch
    utterance.volume = cfg.volume * voiceVolume
    utterance.lang   = 'en-IN'

    utterance.onend = () => {
      speaking.current = false
      processQueue()
    }
    utterance.onerror = () => {
      speaking.current = false
      processQueue()
    }

    speaking.current = true
    window.speechSynthesis.speak(utterance)
  }, [voiceVolume])

  const speak = useCallback((text, severity = 'MEDIUM') => {
    if (voiceMuted) return
    if (!window.speechSynthesis) return

    // CRITICAL alerts jump the queue
    if (severity === 'CRITICAL') {
      window.speechSynthesis.cancel()
      queue.current = [{ text, severity }, ...queue.current]
    } else {
      queue.current.push({ text, severity })
    }
    processQueue()
  }, [voiceMuted, processQueue])

  const speakAlert = useCallback((object) => {
    const level = object.risk_level
    if (level === 'LOW' || level === 'MEDIUM') return

    let msg = ''
    if (level === 'CRITICAL') {
      if (object.zone_breach) {
        msg = `Critical alert. Object ${object.object_id}, type ${object.predicted_type || object.object_type}, has entered restricted zone ${object.zone_breach.zone_name}. Immediate action required.`
      } else {
        msg = `Critical alert. Object ${object.object_id} is at critical risk. Score ${object.risk_score}. Immediate review required.`
      }
    } else if (level === 'HIGH') {
      msg = `Warning. Object ${object.object_id} elevated risk. Score ${object.risk_score}.`
    }

    speak(msg, level)
  }, [speak])

  const cancel = useCallback(() => {
    queue.current = []
    window.speechSynthesis?.cancel()
  }, [])

  return { speak, speakAlert, cancel }
}
