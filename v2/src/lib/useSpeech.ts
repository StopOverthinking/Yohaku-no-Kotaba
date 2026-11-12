import { useCallback, useEffect, useRef, useState } from 'react'

// Free, on-device (or browser-provided) Japanese speech via the Web Speech API.
// Quality depends on the platform voice: Edge "Natural", Apple "Enhanced/Premium"
// and Google voices read pitch accent noticeably better than the basic ones.
const VOICE_RANK = [/natural|neural/i, /enhanced|premium/i, /google/i, /online/i]
const SPEECH_RATE = 0.9

function isJapanese(voice: SpeechSynthesisVoice) {
  return voice.lang.replace('_', '-').toLowerCase().startsWith('ja')
}

function voiceScore(voice: SpeechSynthesisVoice) {
  const rank = VOICE_RANK.findIndex((pattern) => pattern.test(voice.name))
  const quality = rank < 0 ? 0 : VOICE_RANK.length - rank
  return quality * 2 + (voice.lang.replace('_', '-').toLowerCase() === 'ja-jp' ? 1 : 0)
}

export function pickJapaneseVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  let best: SpeechSynthesisVoice | undefined
  for (const voice of voices) {
    if (isJapanese(voice) && (!best || voiceScore(voice) > voiceScore(best))) best = voice
  }
  return best
}

function speechSynthesisOrUndefined() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
    ? window.speechSynthesis
    : undefined
}

/**
 * Reads Japanese text aloud. `resetKey` changes (new card, hidden answer) stop any playback.
 * `available` is false when the browser has no Japanese voice, so callers can hide the control.
 */
export function useJapaneseSpeech(resetKey: string) {
  const [synth] = useState(speechSynthesisOrUndefined)
  const [voice, setVoice] = useState(() => (synth ? pickJapaneseVoice(synth.getVoices()) : undefined))
  const [speaking, setSpeaking] = useState(false)
  const current = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    if (!synth) return
    const update = () => setVoice(pickJapaneseVoice(synth.getVoices()))
    update()
    synth.addEventListener?.('voiceschanged', update)
    return () => synth.removeEventListener?.('voiceschanged', update)
  }, [synth])

  useEffect(
    () => () => {
      if (!synth || !current.current) return
      current.current = null
      synth.cancel()
      setSpeaking(false)
    },
    [synth, resetKey],
  )

  const toggle = useCallback(
    (text: string) => {
      if (!synth) return
      if (current.current) {
        current.current = null
        synth.cancel()
        setSpeaking(false)
        return
      }
      const chosen = voice ?? pickJapaneseVoice(synth.getVoices())
      if (!chosen || !text.trim()) return
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = chosen
      utterance.lang = chosen.lang
      utterance.rate = SPEECH_RATE
      utterance.onend = utterance.onerror = () => {
        if (current.current !== utterance) return
        current.current = null
        setSpeaking(false)
      }
      // Chrome can drop an utterance queued right after cancel(), so only clear real leftovers.
      if (synth.speaking || synth.pending) synth.cancel()
      current.current = utterance
      synth.speak(utterance)
      setSpeaking(true)
    },
    [synth, voice],
  )

  return { available: Boolean(voice), speaking, toggle }
}
