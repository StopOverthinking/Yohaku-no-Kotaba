import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextConflictError, ContextDatabase } from './contextDatabase'
import { answerContext, emptyContextState, profileKey, reviewProfile, startContext, undoContext } from './contextEngine'
import { serializeContextState } from './contextSerialization'
import { testSense } from './contextTestFixtures'

const senses = ['a', 'b', 'c'].map((id) => testSense(id))
const empty = () => emptyContextState(senses)
const start = () => startContext(empty(), {
  setId: 'all', setName: 'test', candidateWordIds: ['a', 'b', 'c'], requiredWordIds: [],
  wordCount: 3, allowEarly: false,
}, senses, '2026-09-30')

describe('transactional learning database', () => {
  let db: ContextDatabase
  let peer: ContextDatabase
  beforeEach(() => {
    const factory = new IDBFactory()
    db = new ContextDatabase(factory)
    peer = new ContextDatabase(factory)
  })
  afterEach(async () => { vi.restoreAllMocks(); await db.close(); await peer.close() })

  it('retains the original blob and all scores, hints, cards and undo through migration', async () => {
    let state = start()
    state.session = { ...state.session!, revealed: true, hintShown: true, hintUsed: true }
    const initial = state
    state = answerContext(state, false, senses, '2026-09-30')
    const raw = serializeContextState(state)
    const snapshot = await db.migrate(raw, empty())
    expect(snapshot.data).toEqual(state)
    expect(await db.readOriginal()).toBe(raw)
    const next = await db.write(snapshot, undoContext(snapshot.data))
    expect((await peer.read())?.data).toEqual(initial)
    expect(await db.readOriginal()).toBe(raw)
    // Repeating migration must not reset newer answers to the old local blob.
    expect(await db.migrate(raw, empty())).toEqual(next)
  })

  it('rejects damaged migration without creating a substitute empty record', async () => {
    await expect(db.migrate('{broken', empty())).rejects.toThrow()
    expect(await db.read()).toBeNull()
    expect(await db.readOriginal()).toBeNull()
  })

  it('resolves competing initial migrations to one committed snapshot', async () => {
    const raw = serializeContextState(start())
    const results = await Promise.all([db.migrate(raw, empty()), peer.migrate(raw, empty())])
    expect(results[0]).toEqual(results[1])
    expect(await db.readOriginal()).toBe(raw)
  })

  it('atomically rejects a stale tab, even when state revision numbers match', async () => {
    const base = await db.migrate(null, start())
    const other = await peer.read()
    const next = answerContext(base.data, true, senses, '2026-09-30')
    await db.write(base, next)
    await expect(peer.write(other, answerContext(other!.data, false, senses, '2026-09-30')))
      .rejects.toBeInstanceOf(ContextConflictError)
    expect((await db.read())?.data).toEqual(next)
  })

  it('does not report success or partly advance after a transaction fails', async () => {
    const base = await db.migrate(null, start())
    const next = answerContext(base.data, false, senses, '2026-09-30')
    const put = IDBObjectStore.prototype.put
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'meta') throw new DOMException('disk full', 'QuotaExceededError')
      return put.apply(this, args)
    })
    await expect(db.write(base, next)).rejects.toThrow('disk full')
    spy.mockRestore()
    expect(await db.read()).toEqual(base)
    await db.write(base, next)
    expect((await db.read())?.data).toEqual(next)
  })

  it('writes only changed profiles and removes obsolete ones in the same commit', async () => {
    const initial = answerContext(start(), true, senses, '2026-09-30')
    const base = await db.migrate(null, initial)
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put')
    const next = answerContext(base.data, true, senses, '2026-09-30')
    const saved = await db.write(base, next)
    expect(spy.mock.contexts.filter((store: unknown) => store instanceof IDBObjectStore && store.name === 'profiles')).toHaveLength(1)
    const revealed = { ...saved.data, session: { ...saved.data.session!, revealed: true } }
    spy.mockClear()
    const shown = await db.write(saved, revealed)
    expect(spy.mock.contexts.filter((store: unknown) => store instanceof IDBObjectStore && store.name === 'profiles')).toHaveLength(0)
    await db.write(shown, empty())
    expect((await peer.read())?.data.profiles).toEqual({})
  })

  it('persists 12,000 profiles and 500 decisions without rewriting the whole profile collection', async () => {
    const large = Array.from({ length: 12000 }, (_, i) => testSense(`database-scale-${i}`, i % 60 + 5))
    let state = emptyContextState(large)
    for (const sense of large) state.profiles[profileKey(sense)] = {
      ...reviewProfile(undefined, sense, sense.examples[0], true, false, '2026-09-20'),
      levelDay: '2026-09-20',
    }
    state = startContext(state, {
      setId: 'all', setName: 'scale', candidateWordIds: large.map((s) => s.wordId), requiredWordIds: [],
      wordCount: 501, allowEarly: false,
    }, large, '2026-09-30')
    const first = state.session!.current
    let saved = await db.migrate(null, state)
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put')
    for (let i = 0; i < 500; i++) {
      state = answerContext(saved.data, true, large, '2026-09-30')
      saved = await db.write(saved, state)
    }
    expect(spy.mock.contexts.filter((store: unknown) => store instanceof IDBObjectStore && store.name === 'profiles')).toHaveLength(500)
    spy.mockRestore()
    const restored = await peer.read()
    expect(restored?.data).toEqual(state)
    let undone = restored!.data
    for (let i = 0; i < 500; i++) undone = undoContext(undone)
    expect(undone.session!.current).toEqual(first)
    expect(undone.session!.decisions).toBe(0)
    expect(Object.keys(undone.profiles)).toHaveLength(12000)
    await peer.write(restored, undone)
    expect((await db.read())?.data).toEqual(undone)
  }, 60000)
})
