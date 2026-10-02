import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextConflictError, ContextDatabase } from './contextDatabase'
import { CONTEXT_MIGRATED_MARKER, ContextRepository } from './contextRepository'
import { CONTEXT_STORAGE_KEY, parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import { answerContext, emptyContextState, startContext } from './contextEngine'
import { testSense } from './contextTestFixtures'

const senses = ['a', 'b'].map((id) => testSense(id))
const empty = () => emptyContextState()
const initial = () => startContext(empty(), {
  setId: 'all', setName: 'test', candidateWordIds: ['a', 'b'], requiredWordIds: [],
  wordCount: 2, allowEarly: false,
}, senses, '2026-09-30')

describe('legacy handoff to IndexedDB', () => {
  let db: ContextDatabase
  let repo: ContextRepository
  beforeEach(() => {
    localStorage.clear()
    db = new ContextDatabase(new IDBFactory())
    repo = new ContextRepository(db, localStorage)
  })
  afterEach(async () => { vi.restoreAllMocks(); await db.close() })

  it('verifies the migrated state, retains exact original and exports latest answers', async () => {
    const state = initial()
    const raw = serializeContextState(state)
    localStorage.setItem(CONTEXT_STORAGE_KEY, raw)
    const loaded = await repo.load(empty())
    expect(loaded.data).toEqual(state)
    expect(await db.readOriginal()).toBe(raw)
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(CONTEXT_MIGRATED_MARKER)
    const next = answerContext(state, false, senses, '2026-09-30')
    await repo.save(loaded, next)
    expect(parseContextState(await repo.exportRaw())).toEqual(next)
    expect((await repo.load(empty())).data).toEqual(next)
    expect(await db.readOriginal()).toBe(raw)
  })

  it('keeps damaged local data without initializing an empty DB', async () => {
    localStorage.setItem(CONTEXT_STORAGE_KEY, '{broken')
    await expect(repo.load(empty())).rejects.toThrow()
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe('{broken')
    expect(await db.read()).toBeNull()
  })

  it('does not interpret a missing migrated DB as a new learner', async () => {
    localStorage.setItem(CONTEXT_STORAGE_KEY, CONTEXT_MIGRATED_MARKER)
    await expect(repo.load(empty())).rejects.toThrow('찾지 못했습니다')
    expect(await db.read()).toBeNull()
  })

  it('recovers a missing migrated DB only from an explicit valid backup restore', async () => {
    localStorage.setItem(CONTEXT_STORAGE_KEY, CONTEXT_MIGRATED_MARKER)
    const state = initial()
    await repo.restoreRaw(serializeContextState(state))
    expect((await repo.load(empty())).data).toEqual({ ...state, revision: 1 })
  })

  it('retries a marker-write failure without losing the original or newer DB', async () => {
    const raw = serializeContextState(initial())
    localStorage.setItem(CONTEXT_STORAGE_KEY, raw)
    const failing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    await expect(repo.load(empty())).rejects.toThrow('quota')
    expect(await db.readOriginal()).toBe(raw)
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(raw)
    failing.mockRestore()
    expect((await repo.load(empty())).data).toEqual(parseContextState(raw))
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(CONTEXT_MIGRATED_MARKER)
  })

  it('preserves both histories if an old tab writes during migration', async () => {
    const state = initial()
    const raw = serializeContextState(state)
    const foreign = serializeContextState(answerContext(state, false, senses, '2026-09-30'))
    localStorage.setItem(CONTEXT_STORAGE_KEY, raw)
    const migrate = db.migrate.bind(db)
    vi.spyOn(db, 'migrate').mockImplementation(async (...args) => {
      const result = await migrate(...args)
      localStorage.setItem(CONTEXT_STORAGE_KEY, foreign)
      return result
    })
    await expect(repo.load(empty())).rejects.toBeInstanceOf(ContextConflictError)
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(foreign)
    expect(await db.readOriginal()).toBe(raw)
    expect((await db.read())?.data).toEqual(state)
  })

  it('rejects changed legacy data on a later reload rather than hiding it behind the DB', async () => {
    const loaded = await repo.load(initial())
    const foreign = serializeContextState(answerContext(loaded.data, false, senses, '2026-09-30'))
    localStorage.setItem(CONTEXT_STORAGE_KEY, foreign)
    await expect(repo.load(empty())).rejects.toBeInstanceOf(ContextConflictError)
    await expect(repo.save(loaded, empty())).rejects.toBeInstanceOf(ContextConflictError)
    expect(await db.read()).toEqual(loaded)
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(foreign)
  })

  it('allows two new tabs to finish the same migration and rejects the stale writer', async () => {
    const peer = new ContextRepository(db, localStorage)
    localStorage.setItem(CONTEXT_STORAGE_KEY, serializeContextState(initial()))
    const [first, second] = await Promise.all([repo.load(empty()), peer.load(empty())])
    expect(first).toEqual(second)
    await repo.save(first, answerContext(first.data, true, senses, '2026-09-30'))
    await expect(peer.save(second, empty())).rejects.toBeInstanceOf(ContextConflictError)
  })

  it('blocks a legacy change immediately before IDB writes and aborts the whole transaction', async () => {
    const base = await repo.load(initial())
    const originalWrite = db.write.bind(db)
    vi.spyOn(db, 'write').mockImplementation(async (...args) => {
      localStorage.setItem(CONTEXT_STORAGE_KEY, 'foreign')
      return originalWrite(...args)
    })
    await expect(repo.save(base, empty())).rejects.toBeInstanceOf(ContextConflictError)
    expect(await db.read()).toEqual(base)
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe('foreign')
  })

  it('restores old v2 backup including undo, drops replaced profiles and invalidates stale tabs', async () => {
    const starting = initial()
    const checkpoint = answerContext(starting, false, senses, '2026-09-30')
    const raw = serializeContextState(checkpoint)
    const oldClient = await repo.load(empty())
    const restored = await repo.restoreRaw(raw)
    expect(restored.data).toEqual({ ...checkpoint, revision: oldClient.data.revision + 1 })
    await expect(repo.save(oldClient, empty())).rejects.toBeInstanceOf(ContextConflictError)
    expect(parseContextState(await repo.exportRaw())).toEqual(restored.data)
    await repo.restoreRaw(serializeContextState(empty()))
    expect((await repo.load(empty())).data).toMatchObject({ profiles: {}, history: [], session: null })
  })

  it('rejects malformed backup without changing the current committed snapshot', async () => {
    const saved = await repo.load(initial())
    await expect(repo.restoreRaw('{broken')).rejects.toThrow()
    expect(await db.read()).toEqual(saved)
  })

  it('keeps large learning backups out of localStorage after handoff', async () => {
    await repo.load(empty())
    const localWrite = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const restored = await repo.restoreRaw(serializeContextState(initial()))
    expect(parseContextState(await repo.exportRaw())).toEqual(restored.data)
    expect(localWrite).not.toHaveBeenCalled()
  })
})
