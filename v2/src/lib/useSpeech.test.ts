import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickJapaneseVoice, useJapaneseSpeech } from './useSpeech'

const voice = (name: string, lang: string) => ({ name, lang, localService: true, default: false, voiceURI: name }) as SpeechSynthesisVoice

class FakeUtterance {
  text: string
  voice: SpeechSynthesisVoice | null = null
  lang = ''
  rate = 1
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

function installSpeech(voices: SpeechSynthesisVoice[]) {
  const listeners = new Set<() => void>()
  const synth = {
    voices,
    speaking: false,
    pending: false,
    spoken: [] as FakeUtterance[],
    getVoices: () => synth.voices,
    speak: vi.fn((utterance: FakeUtterance) => {
      synth.spoken.push(utterance)
      synth.speaking = true
    }),
    cancel: vi.fn(() => {
      synth.speaking = false
      const last = synth.spoken.at(-1)
      last?.onerror?.()
    }),
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    fireVoicesChanged: () => listeners.forEach((fn) => fn()),
  }
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth })
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  return synth
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  Reflect.deleteProperty(window, 'speechSynthesis')
  vi.unstubAllGlobals()
})

describe('pickJapaneseVoice', () => {
  it('prefers natural, then enhanced, then Google Japanese voices and ignores other languages', () => {
    const basic = voice('Microsoft Haruka', 'ja-JP')
    const google = voice('Google 日本語', 'ja-JP')
    const natural = voice('Microsoft Nanami Online (Natural) - Japanese (Japan)', 'ja-JP')
    expect(pickJapaneseVoice([voice('Samantha', 'en-US'), basic])).toBe(basic)
    expect(pickJapaneseVoice([basic, google])).toBe(google)
    expect(pickJapaneseVoice([google, natural, basic])).toBe(natural)
    expect(pickJapaneseVoice([voice('Kyoko', 'ja_JP')])?.name).toBe('Kyoko')
    expect(pickJapaneseVoice([voice('Natural Korean', 'ko-KR')])).toBeUndefined()
  })
})

describe('useJapaneseSpeech', () => {
  it('is unavailable without the Web Speech API or a Japanese voice', () => {
    expect(renderHook(() => useJapaneseSpeech('a')).result.current.available).toBe(false)
    installSpeech([voice('Samantha', 'en-US')])
    expect(renderHook(() => useJapaneseSpeech('a')).result.current.available).toBe(false)
  })

  it('becomes available when Japanese voices load later', () => {
    const synth = installSpeech([])
    const { result } = renderHook(() => useJapaneseSpeech('a'))
    expect(result.current.available).toBe(false)
    synth.voices = [voice('Kyoko', 'ja-JP')]
    act(() => synth.fireVoicesChanged())
    expect(result.current.available).toBe(true)
  })

  it('speaks with the Japanese voice, toggles off, and stops when the card changes', () => {
    const kyoko = voice('Kyoko', 'ja-JP')
    const synth = installSpeech([kyoko])
    const { result, rerender } = renderHook(({ key }) => useJapaneseSpeech(key), { initialProps: { key: 'card-1' } })

    act(() => result.current.toggle('毎朝コーヒーを飲みます。'))
    expect(synth.spoken[0]).toMatchObject({ text: '毎朝コーヒーを飲みます。', voice: kyoko, lang: 'ja-JP' })
    expect(result.current.speaking).toBe(true)

    act(() => result.current.toggle('毎朝コーヒーを飲みます。'))
    expect(synth.cancel).toHaveBeenCalledTimes(1)
    expect(result.current.speaking).toBe(false)

    act(() => result.current.toggle('毎朝コーヒーを飲みます。'))
    expect(result.current.speaking).toBe(true)
    rerender({ key: 'card-2' })
    expect(synth.cancel).toHaveBeenCalledTimes(2)
    expect(result.current.speaking).toBe(false)
  })

  it('returns to idle when the utterance ends', () => {
    const synth = installSpeech([voice('Kyoko', 'ja-JP')])
    const { result } = renderHook(() => useJapaneseSpeech('a'))
    act(() => result.current.toggle('はい。'))
    act(() => synth.spoken[0].onend?.())
    expect(result.current.speaking).toBe(false)
  })
})
