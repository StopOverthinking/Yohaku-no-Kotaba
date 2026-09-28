import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContextStore, CONTEXT_STORAGE_KEY, parseContextState } from './contextStore'
import { buildBackupEnvelope, parseRestorePayload, applyImportedBackup } from '@/features/share/share'

vi.mock('./contextContent', async () => {
  const { testSense } = await import('./contextTestFixtures')
  const senses = [testSense('a'), testSense('b')]
  return { contextSenses: senses, contextSenseMap: new Map(senses.map((s) => [s.id, s])) }
})
const options = {
  setId: 'all',
  setName: '테스트',
  candidateWordIds: ['a', 'b'],
  requiredWordIds: [],
  wordCount: 2,
  allowEarly: false,
}

describe('context persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useContextStore.setState({ loadedRaw: null, error: null, lastResult: null })
    useContextStore.getState().hydrate()
  })

  it('stores before advancing, resumes reveal/hint and supports undo after reload', () => {
    const store = useContextStore.getState()
    expect(store.start(options)).toBe(true)
    store.reveal()
    store.toggleHint()
    const before = structuredClone(useContextStore.getState().data)
    store.answer(false)
    store.hydrate()
    expect(store.undo()).toBe(true)
    expect(useContextStore.getState().data.session).toEqual(before.session)
    expect(useContextStore.getState().data.level).toEqual(before.level)
    expect(useContextStore.getState().data.profiles).toEqual(before.profiles)
  })

  it('does not advance when writing fails and accepts retry exactly once', () => {
    useContextStore.getState().start(options)
    const before = useContextStore.getState().data
    const token = `${before.session!.id}:${before.session!.decisions}`
    const failing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(useContextStore.getState().answer(false, token)).toBe(false)
    expect(useContextStore.getState().data).toBe(before)
    failing.mockRestore()
    expect(useContextStore.getState().answer(false, token)).toBe(true)
    expect(useContextStore.getState().answer(false, token)).toBe(false)
  })

  it('preserves progress across backup restore and rejects stale tabs', () => {
    useContextStore.getState().start(options)
    useContextStore.getState().answer(false)
    const before = localStorage.getItem(CONTEXT_STORAGE_KEY)
    const backup = buildBackupEnvelope()
    const parsed = parseRestorePayload(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error('parse failed')
    localStorage.clear()
    applyImportedBackup(parsed.data)
    useContextStore.getState().hydrate()
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(before)
    const foreign = JSON.stringify({ ...useContextStore.getState().data, revision: 999 })
    localStorage.setItem(CONTEXT_STORAGE_KEY, foreign)
    expect(useContextStore.getState().answer(true)).toBe(false)
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(foreign)
  })

  it('keeps malformed raw data intact instead of overwriting it', () => {
    localStorage.setItem(CONTEXT_STORAGE_KEY, '{broken')
    useContextStore.getState().hydrate()
    expect(useContextStore.getState().start(options)).toBe(false)
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe('{broken')
    expect(() => parseContextState('{"version":2}')).toThrow()
    expect(parseRestorePayload(JSON.stringify({ data: { [CONTEXT_STORAGE_KEY]: '{"version":2}' } })).ok).toBe(
      false,
    )
  })

  it('discard keeps reviewed profiles and completion removes session-only history', () => {
    useContextStore.getState().start(options)
    useContextStore.getState().answer(false)
    const profiles = useContextStore.getState().data.profiles
    useContextStore.getState().discard()
    expect(useContextStore.getState().data).toMatchObject({ session: null, profiles, history: [] })
    useContextStore.getState().start({ ...options, allowEarly: true, wordCount: 1 })
    useContextStore.getState().answer(true)
    expect(useContextStore.getState().lastResult).not.toBeNull()
    expect(useContextStore.getState().data.history).toEqual([])
  })

  it('rejects damaged undo snapshots and card identities before they can be restored', () => {
    useContextStore.getState().start(options)
    useContextStore.getState().answer(false)
    const saved = structuredClone(useContextStore.getState().data)
    saved.history[0].session.current.exampleVersion = 0
    expect(() => parseContextState(JSON.stringify(saved))).toThrow()
    const broken = structuredClone(useContextStore.getState().data)
    broken.history[0].profile = { ...Object.values(broken.profiles)[0], failures: -1 }
    expect(() => parseContextState(JSON.stringify(broken))).toThrow()
  })
})
