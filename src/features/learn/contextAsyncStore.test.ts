import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsyncContextStore } from './contextAsyncStore'
import { ContextDatabase } from './contextDatabase'
import { ContextRepository } from './contextRepository'
import { parseContextState } from './contextPersistence'
import { testSense } from './contextTestFixtures'

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
})
