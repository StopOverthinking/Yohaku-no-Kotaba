import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsyncContextStore } from './contextAsyncStore'
import { ContextDatabase } from './contextDatabase'
import { ContextRepository } from './contextRepository'
import { parseContextState } from './contextPersistence'
import { testSense } from './contextTestFixtures'
import { emptyContextState, profileKey, reviewProfile } from './contextEngine'
import { reviewList } from './reviewList'
import type { ContextState } from './contextTypes'

const senses = ['a', 'b'].map((id) => testSense(id))
const options = { setId: 'all', setName: 'test', candidateWordIds: ['a', 'b'], requiredWordIds: [], wordCount: 2, allowEarly: true }
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe('asynchronous learning store', () => {
  let db: ContextDatabase
  let repo: ContextRepository
  let store: ReturnType<typeof createAsyncContextStore>
  beforeEach(() => {
    localStorage.clear()
    db = new ContextDatabase(new IDBFactory())
    repo = new ContextRepository(db, localStorage)
    store = createAsyncContextStore(senses, () => repo, () => '2026-09-30')
  })
  afterEach(async () => { vi.restoreAllMocks(); await db.close() })

  it('commits retired-card recovery atomically and retries after a failed save without losing undo or profiles', async () => {
    await store.getState().hydrate()
    await store.getState().start({ ...options, candidateWordIds: ['a'], wordCount: 1 })
    await store.getState().answer(false)
    const previous = store.getState().data
    const original = senses[0], removed = original.examples[0], kept = original.examples[1]
    const updated = createAsyncContextStore([{ ...original, examples: [kept] }, senses[1]], () => repo,
      () => '2026-10-02', [], [{ senseId: original.id, senseVersion: original.version,
        exampleId: removed.id, exampleVersion: removed.version,
        replacementId: kept.id, replacementVersion: kept.version }])
    vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'))
    await updated.getState().hydrate()
    expect(updated.getState().ready).toBe(false)
    expect((await db.read())!.data).toEqual(previous)
    await updated.getState().hydrate()
    expect(updated.getState().ready).toBe(true)
    expect(updated.getState().data.session!.current.exampleId).toBe(kept.id)
    expect(updated.getState().data.profiles).toEqual(previous.profiles)
    expect(updated.getState().data.level).toEqual(previous.level)
    expect((await db.read())!.data).toEqual(updated.getState().data)
    const revision = updated.getState().data.revision
    await updated.getState().hydrate()
    expect(updated.getState().data.revision).toBe(revision)
    expect(await updated.getState().undo()).toBe(true)
    expect(updated.getState().data.session!.current.exampleId).toBe(kept.id)
    expect(await updated.getState().answer(true)).toBe(true)
  })

  it('keeps the beginner score from first hydration through start and reload', async () => {
    await store.getState().hydrate()
    expect(store.getState().data.level).toEqual({ value: 16, assessedWordIds: [] })
    expect(await store.getState().start({ ...options, candidateWordIds: ['b'], wordCount: 1 })).toBe(true)
    const started = store.getState().data
    expect(started.level.value).toBe(16)
    expect(started.session!.current.senseId).toBe('sense-b')
    await store.getState().hydrate()
    expect(store.getState().data).toEqual(started)
    await store.getState().answer(true)
    const learned = store.getState().data
    await store.getState().hydrate()
    expect(store.getState().data.level).toEqual(learned.level)
    expect(await store.getState().start({ ...options, candidateWordIds: ['a'], wordCount: 1 })).toBe(true)
    expect(store.getState().data.level).toEqual(learned.level)
  })

  it('coalesces hydration, and blocks a new session until loading succeeds', async () => {
    const gate = deferred()
    const load = repo.load.bind(repo)
    const spy = vi.spyOn(repo, 'load').mockImplementation(async (...args) => { await gate.promise; return load(...args) })
    const first = store.getState().hydrate()
    const second = store.getState().hydrate()
    expect(first).toBe(second)
    expect(await store.getState().start(options)).toBe(false)
    gate.resolve()
    await first
    expect(spy).toHaveBeenCalledTimes(1)
    expect(store.getState().ready).toBe(true)
    expect(await store.getState().start(options)).toBe(true)
  })

  it('keeps the visible card until commit and rejects duplicate input immediately', async () => {
    await store.getState().hydrate()
    await store.getState().start(options)
    const before = store.getState().data
    const token = `${before.session!.id}:${before.session!.decisions}`
    const gate = deferred()
    const save = repo.save.bind(repo)
    vi.spyOn(repo, 'save').mockImplementation(async (...args) => { await gate.promise; return save(...args) })
    const pending = store.getState().answer(false, token)
    expect(store.getState().busy).toBe(true)
    expect(store.getState().data).toBe(before)
    expect(await store.getState().answer(false, token)).toBe(false)
    expect(await store.getState().undo()).toBe(false)
    gate.resolve()
    expect(await pending).toBe(true)
    expect(store.getState().data.session!.decisions).toBe(1)
    expect(await store.getState().answer(true, token)).toBe(false)
  })

  it('preserves the current card on failure and allows exactly one retry', async () => {
    await store.getState().hydrate()
    await store.getState().start(options)
    const before = store.getState().data
    const spy = vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'))
    expect(await store.getState().answer(false)).toBe(false)
    expect(store.getState().data).toBe(before)
    expect(store.getState().busy).toBe(false)
    expect(store.getState().error).toContain('저장하지 못했습니다')
    expect(await store.getState().answer(false)).toBe(true)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(store.getState().data.session!.decisions).toBe(1)
  })

  it('waits for a pending save before rehydrating instead of loading a stale snapshot', async () => {
    await store.getState().hydrate()
    await store.getState().start(options)
    const gate = deferred()
    const save = repo.save.bind(repo)
    vi.spyOn(repo, 'save').mockImplementation(async (...args) => { await gate.promise; return save(...args) })
    const answer = store.getState().answer(false)
    const reload = store.getState().hydrate()
    expect(await store.getState().reveal()).toBe(false)
    gate.resolve()
    await Promise.all([answer, reload])
    expect(store.getState().ready).toBe(true)
    expect(store.getState().data.session!.decisions).toBe(1)
    expect((await db.read())?.data).toEqual(store.getState().data)
  })

  it('preserves independent hint/reveal, all undo state, result score and v2 export', async () => {
    await store.getState().hydrate()
    await store.getState().start(options)
    await store.getState().toggleHint()
    expect(store.getState().data.session!.revealed).toBe(false)
    await store.getState().reveal()
    const before = store.getState().data
    await store.getState().answer(false)
    await store.getState().hydrate()
    await store.getState().undo()
    expect(store.getState().data.session).toEqual(before.session)
    expect(store.getState().data.profiles).toEqual(before.profiles)
    await store.getState().answer(true)
    await store.getState().answer(true)
    expect(store.getState().data.session).toBeNull()
    expect(store.getState().data.history).toEqual([])
    expect(store.getState().lastResult!.score.before).toBe(before.level.value)
    expect(store.getState().lastResult!.score.after).toBe(store.getState().data.level.value)
    const exported = parseContextState(await repo.exportRaw())
    expect(exported.lastScoreChange).toEqual(store.getState().lastResult!.score)
    await store.getState().hydrate()
    expect(store.getState().data).toEqual(exported)
    expect(store.getState().lastResult).toBeNull()
  })

  it('makes a stale tab read again after another tab commits', async () => {
    await store.getState().hydrate()
    await store.getState().start(options)
    const peer = createAsyncContextStore(senses, () => repo, () => '2026-09-30')
    await peer.getState().hydrate()
    await store.getState().answer(false)
    expect(await peer.getState().answer(true)).toBe(false)
    expect(peer.getState().ready).toBe(false)
    expect(peer.getState().error).toContain('다른 화면')
    await peer.getState().hydrate()
    expect(peer.getState().data).toEqual(store.getState().data)
  })

  it('does not overwrite the DB after a failed hydration', async () => {
    vi.spyOn(repo, 'load').mockRejectedValueOnce(new Error('unavailable'))
    await store.getState().hydrate()
    expect(await store.getState().start(options)).toBe(false)
    expect(await db.read()).toBeNull()
    await store.getState().hydrate()
    expect(await store.getState().start(options)).toBe(true)
  })

  it('resets all learning data only after commit, preserves settings and rejects stale-tab writes', async () => {
    await store.getState().hydrate()
    await store.getState().start({ ...options, candidateWordIds: ['a'], wordCount: 1 })
    await store.getState().answer(true)
    const completed = store.getState().lastResult
    await store.getState().start({ ...options, candidateWordIds: ['b'], wordCount: 1 })
    await store.getState().answer(false)
    await store.getState().removeReviewWord('a')
    store.setState({ lastResult: completed })
    const before = store.getState().data
    expect(before.history.length).toBeGreaterThan(0)
    expect(before.lastScoreChange).toBeDefined()
    const peer = createAsyncContextStore(senses, () => repo, () => '2026-09-30')
    await peer.getState().hydrate()
    localStorage.setItem('jsp-react:preferences', 'settings')
    localStorage.setItem('jsp-react:favorites', 'favorites')
    const localBefore = { ...localStorage }
    const gate = deferred()
    const save = repo.save.bind(repo)
    vi.spyOn(repo, 'save').mockImplementationOnce(async (...args) => { await gate.promise; return save(...args) })
    const pending = store.getState().resetLearning()
    expect(store.getState().busy).toBe(true)
    expect(store.getState().data).toBe(before)
    expect(store.getState().lastResult).toBe(completed)
    expect(await store.getState().resetLearning()).toBe(false)
    expect(await store.getState().undo()).toBe(false)
    expect((await db.read())!.data).toEqual(before)
    gate.resolve()
    expect(await pending).toBe(true)
    const reset = { ...emptyContextState(), revision: before.revision + 1 }
    expect(store.getState().data).toEqual(reset)
    expect(store.getState().lastResult).toBeNull()
    expect((await db.read())!.data).toEqual(reset)
    expect(await store.getState().undo()).toBe(false)
    expect({ ...localStorage }).toEqual(localBefore)
    expect(parseContextState(await repo.exportRaw())).toEqual(reset)
    expect(await peer.getState().answer(true)).toBe(false)
    expect(peer.getState().ready).toBe(false)
    expect((await db.read())!.data).toEqual(reset)
    await store.getState().hydrate()
    expect(store.getState().data).toEqual(reset)
    expect(await store.getState().start({ ...options, candidateWordIds: ['a'], wordCount: 1 })).toBe(true)
  })

  it('preserves the whole state and result on a failed reset, then retries successfully', async () => {
    await store.getState().hydrate()
    await store.getState().start({ ...options, candidateWordIds: ['a'], wordCount: 1 })
    await store.getState().answer(true)
    const before = store.getState().data
    const result = store.getState().lastResult
    vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'))
    expect(await store.getState().resetLearning()).toBe(false)
    expect(store.getState().data).toBe(before)
    expect(store.getState().lastResult).toBe(result)
    expect((await db.read())!.data).toEqual(before)
    expect(await store.getState().resetLearning()).toBe(true)
    expect(store.getState().data.profiles).toEqual({})
    expect(store.getState().lastResult).toBeNull()
  })

  it('blocks reset before hydration and refuses to erase a newer commit from another tab', async () => {
    expect(await store.getState().resetLearning()).toBe(false)
    expect(await db.read()).toBeNull()
    await store.getState().hydrate()
    const peer = createAsyncContextStore(senses, () => repo, () => '2026-09-30')
    await peer.getState().hydrate()
    await peer.getState().start(options)
    await peer.getState().answer(false)
    const newer = peer.getState().data
    expect(await store.getState().resetLearning()).toBe(false)
    expect(store.getState().ready).toBe(false)
    expect(store.getState().error).toContain('다른 화면')
    expect((await db.read())!.data).toEqual(newer)
  })

  it('clears archived alias learning and recreates empty current alias metadata without restoring progress', async () => {
    const group = { id: 'a-b', representativeWordId: 'a', members: senses.map(sense => ({
      wordId: sense.wordId, senseId: sense.id, version: sense.version,
    })) }
    store = createAsyncContextStore(senses, () => repo, () => '2026-09-30', [group])
    await store.getState().hydrate()
    await store.getState().start({ ...options, wordCount: 1 })
    await store.getState().answer(true)
    await store.getState().removeReviewWord('b')
    const before = store.getState().data
    const archived = { ...before, aliasMigrations: { ...before.aliasMigrations,
      [group.id]: { ...before.aliasMigrations![group.id], profiles: before.profiles, level: before.level },
    } }
    const snapshot = await repo.save(store.getState().snapshot!, archived)
    store.setState({ data: snapshot.data, snapshot })
    expect(await store.getState().resetLearning()).toBe(true)
    const reset = store.getState().data
    expect(reset.profiles).toEqual({})
    expect(reset.excludedWordIds).toBeUndefined()
    expect(reset.aliasMigrations![group.id].profiles).toEqual({})
    expect(reset.aliasMigrations![group.id].level).toEqual(emptyContextState().level)
    await store.getState().hydrate()
    expect(store.getState().data).toEqual(reset)
    expect(parseContextState(await repo.exportRaw())).toEqual(reset)
  })

  it('keeps a removed word out of retries, undo, all later sessions and backup while preserving its profile and score', async () => {
    await store.getState().hydrate()
    await store.getState().start({ ...options, requiredWordIds: ['a'] })
    await store.getState().answer(false)
    const before = store.getState().data
    const gate = deferred()
    const save = repo.save.bind(repo)
    const saveSpy = vi.spyOn(repo, 'save').mockImplementationOnce(async (...args) => { await gate.promise; return save(...args) })
    const pending = store.getState().removeReviewWord('a')
    expect(store.getState().data).toBe(before)
    expect(await store.getState().removeReviewWord('a')).toBe(false)
    gate.resolve()
    expect(await pending).toBe(true)
    saveSpy.mockRestore()
    expect(store.getState().data.profiles).toEqual(before.profiles)
    expect(store.getState().data.level).toEqual(before.level)
    expect(store.getState().data.session!.retry).toEqual([])
    expect(reviewList(store.getState().data, senses)).toEqual([])
    await store.getState().undo()
    expect(store.getState().data.session!.current.senseId).toBe('sense-b')
    await store.getState().answer(true)
    expect(store.getState().data.session).toBeNull()
    const exported = await repo.exportRaw()
    await repo.restoreRaw(exported)
    await store.getState().hydrate()
    expect(store.getState().data.excludedWordIds).toEqual(['a'])
    expect(await store.getState().start({ ...options, candidateWordIds: ['a'], requiredWordIds: ['a'] })).toBe(false)
  })

  it('preserves the row on a failed removal and commits exclusion on retry', async () => {
    await store.getState().hydrate()
    await store.getState().start({ ...options, candidateWordIds: ['a'], wordCount: 1 })
    await store.getState().answer(false)
    const before = store.getState().data
    vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'))
    expect(await store.getState().removeReviewWord('a')).toBe(false)
    expect(store.getState().data).toBe(before)
    expect((await db.read())!.data).toEqual(before)
    expect(await store.getState().removeReviewWord('a')).toBe(true)
    expect(store.getState().data.session).toBeNull()
    expect(store.getState().data.profiles).toEqual(before.profiles)
    expect(parseContextState(await repo.exportRaw()).excludedWordIds).toEqual(['a'])
  })

  it('atomically persists v3 stage migration in existing IndexedDB, retries failure and never maps it twice', async () => {
    const base = await repo.load(emptyContextState())
    const legacy = emptyContextState()
    legacy.profiles[profileKey(senses[0])] = { ...reviewProfile(undefined, senses[0], senses[0].examples[0], false, false, '2026-09-01'),
      step: 14, due: '2027-03-01', levelDay: '2026-09-01' }
    await db.write(base, { ...legacy, scheduleVersion: 3 } as unknown as ContextState)
    vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'))
    await store.getState().hydrate()
    expect(store.getState().ready).toBe(false)
    expect((await db.read())!.needsScheduleMigration).toBe(true)
    await store.getState().hydrate()
    expect(store.getState().ready).toBe(true)
    expect(store.getState().data.profiles[profileKey(senses[0])]).toMatchObject({ step: 11, due: '2027-03-01', failures: 1 })
    expect((await db.read())!.needsScheduleMigration).toBeUndefined()
    const migrated = store.getState().data
    await store.getState().hydrate()
    expect(store.getState().data).toEqual(migrated)
  })
})
