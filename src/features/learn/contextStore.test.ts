import { getAppBackupText, restoreAppBackup } from '@/features/share/appBackup'
import { resetContextStorage, getTestRepository, persistence } from '@/test/contextStorage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContextStore, CONTEXT_STORAGE_KEY, parseContextState } from './contextStore'
import { parseRestorePayload } from '@/features/share/share'

vi.mock('./contextContent', async () => {
  const { testSense } = await import('./contextTestFixtures')
  const senses = [testSense('a'), testSense('b')]
  return { contextSenses: senses, contextAliasGroups: [], contextAliasCatalog: { resolveWordId: (id: string) => id }, contextSenseMap: new Map(senses.map((s) => [s.id, s])) }
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
  beforeEach(async () => {
    vi.restoreAllMocks()
    await resetContextStorage()
    useContextStore.setState({ snapshot: null, ready: false, busy: false, error: null, lastResult: null })
    await useContextStore.getState().hydrate()
  })

  it('preserves the complete session score change through undo, reload and backup', async () => {
    const store = useContextStore.getState()
    await store.start(options)
    const baseline = useContextStore.getState().data.level.value
    await store.answer(false)
    await store.undo()
    await store.answer(true)
    await store.hydrate()
    await store.answer(true)
    const finished = useContextStore.getState()
    expect(finished.data.session).toBeNull()
    expect(finished.lastResult?.score.before).toBe(baseline)
    expect(finished.lastResult?.score.after).toBe(finished.data.level.value)
    expect(finished.data.lastScoreChange).toEqual(finished.lastResult?.score)
    const raw = await getTestRepository().exportRaw()
    const restored = parseContextState(raw)
    expect(restored.lastScoreChange).toEqual(finished.lastResult?.score)
    expect(JSON.parse(await getAppBackupText()).data[CONTEXT_STORAGE_KEY]).toBe(raw)
    await store.hydrate()
    expect(useContextStore.getState().data.lastScoreChange).toEqual(restored.lastScoreChange)
    // Old v2 states without a summary retain all learned profiles.
    const old = JSON.parse(raw)
    delete old.lastScoreChange
    expect(parseContextState(JSON.stringify(old)).profiles).toEqual(restored.profiles)
  })

  it('stores before advancing, resumes reveal/hint and supports undo after reload', async () => {
    const store = useContextStore.getState()
    expect(await store.start(options)).toBe(true)
    await store.reveal()
    await store.toggleHint()
    const before = structuredClone(useContextStore.getState().data)
    await store.answer(false)
    await store.hydrate()
    expect(await store.undo()).toBe(true)
    expect(useContextStore.getState().data.session).toEqual(before.session)
    expect(useContextStore.getState().data.level).toEqual(before.level)
    expect(useContextStore.getState().data.profiles).toEqual(before.profiles)
  })

  it('does not advance when writing fails and accepts retry exactly once', async () => {
    await useContextStore.getState().start(options)
    const before = useContextStore.getState().data
    const token = `${before.session!.id}:${before.session!.decisions}`
    const failing = vi.spyOn(persistence, 'save').mockImplementation(async () => {
      throw new Error('QuotaExceededError')
    })
    expect(await useContextStore.getState().answer(false, token)).toBe(false)
    expect(useContextStore.getState().data).toBe(before)
    failing.mockRestore()
    expect(await useContextStore.getState().answer(false, token)).toBe(true)
    expect(await useContextStore.getState().answer(false, token)).toBe(false)
  })

  it('preserves progress across backup restore and rejects stale tabs', async () => {
    await useContextStore.getState().start(options)
    await useContextStore.getState().answer(false)
    const before = await getTestRepository().exportRaw()
    const backup = JSON.parse(await getAppBackupText())
    const parsed = parseRestorePayload(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error('parse failed')
    localStorage.clear()
    await restoreAppBackup(parsed.data)
    await useContextStore.getState().hydrate()
    expect(await getTestRepository().exportRaw()).toBe(before.replace(/"revision":\d+/, `"revision":${useContextStore.getState().data.revision}`))
    const foreign = JSON.stringify({ ...useContextStore.getState().data, revision: 999 })
    localStorage.setItem(CONTEXT_STORAGE_KEY, foreign)
    expect(await useContextStore.getState().answer(true)).toBe(false)
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(foreign)
  })

  it('keeps malformed raw data intact instead of overwriting it', async () => {
    localStorage.setItem(CONTEXT_STORAGE_KEY, '{broken')
    await useContextStore.getState().hydrate()
    expect(await useContextStore.getState().start(options)).toBe(false)
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe('{broken')
    expect(() => parseContextState('{"version":2}')).toThrow()
    expect(parseRestorePayload(JSON.stringify({ data: { [CONTEXT_STORAGE_KEY]: '{"version":2}' } })).ok).toBe(
      false,
    )
  })

  it('discard keeps reviewed profiles and completion removes session-only history', async () => {
    await useContextStore.getState().start(options)
    await useContextStore.getState().answer(false)
    const profiles = useContextStore.getState().data.profiles
    await useContextStore.getState().discard()
    expect(useContextStore.getState().data).toMatchObject({ session: null, profiles, history: [] })
    await useContextStore.getState().start({ ...options, allowEarly: true, wordCount: 1 })
    await useContextStore.getState().answer(true)
    expect(useContextStore.getState().lastResult).not.toBeNull()
    expect(useContextStore.getState().data.history).toEqual([])
  })

  it('rejects damaged undo snapshots and card identities before they can be restored', async () => {
    await useContextStore.getState().start(options)
    await useContextStore.getState().answer(false)
    const saved = structuredClone(useContextStore.getState().data)
    saved.history[0].session.current.exampleVersion = 0
    expect(() => parseContextState(JSON.stringify(saved))).toThrow()
    const broken = structuredClone(useContextStore.getState().data)
    broken.history[0].profile = { ...Object.values(broken.profiles)[0], failures: -1 }
    expect(() => parseContextState(JSON.stringify(broken))).toThrow()
  })
})

vi.mock('./contextBrowserPersistence', async () => {
  const fixture = await import('@/test/contextStorage')
  return { browserContextPersistence: fixture.persistence, getBrowserBackupCoordinator: fixture.getTestCoordinator }
})
