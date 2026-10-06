import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { createAliasCatalog, migrateContextAliases } from './contextAliases'
import { addDays, emptyContextState, profileKey, reviewProfile, startContext } from './contextEngine'
import { parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import { ContextDatabase } from './contextDatabase'
import { ContextRepository } from './contextRepository'
import { createAsyncContextStore } from './contextAsyncStore'
import { testSense } from './contextTestFixtures'
import { contextSenses, contextAliasGroups } from './contextContent'
import type { ContextAliasGroup } from './contextTypes'

const day = '2026-09-30'
const senses = [testSense('a'), testSense('b')]
const groups: ContextAliasGroup[] = [{ id: 'same-word', representativeWordId: 'b',
  members: senses.map(sense => ({ wordId: sense.wordId, senseId: sense.id, version: sense.version })),
}]
const catalog = createAliasCatalog(senses, groups)
const keyA = profileKey(senses[0]), keyB = profileKey(senses[1])
const options = { setId: 'test', setName: 'test', candidateWordIds: ['a', 'b'], requiredWordIds: ['a', 'b'], wordCount: 2, allowEarly: true }
function existing() {
  const state = emptyContextState()
  state.level = { value: 42, assessedWordIds: ['a', 'b', 'another'] }
  state.profiles[keyA] = { ...reviewProfile(undefined, senses[0], senses[0].examples[0], true, false, day),
    due: '2026-10-20', step: 4, failures: 1, failedDays: 1, dailyAttempts: 2, levelDay: day }
  state.profiles[keyB] = { ...reviewProfile(undefined, senses[1], senses[1].examples[0], false, true, '2026-09-29'),
    due: '2026-10-01', step: 1, failures: 2, failedDays: 2, dailyAttempts: 3, levelDay: '2026-09-29' }
  return state
}

describe('reviewed equivalent-word progress migration', () => {
  it('excludes every alias when removing a word from an unmigrated in-progress session', async () => {
    localStorage.clear()
    const db = new ContextDatabase(new IDBFactory())
    try {
      const repo = new ContextRepository(db, localStorage)
      const base = await repo.load(emptyContextState())
      const active = startContext(emptyContextState(), { ...options, requiredWordIds: ['a'], wordCount: 1 }, senses, day)
      await repo.save(base, active)
      const store = createAsyncContextStore(senses, () => repo, () => day, groups)
      await store.getState().hydrate()
      expect(await store.getState().answer(false)).toBe(true)
      expect(store.getState().data.session!.current.senseId).toBe(senses[0].id)
      const before = store.getState().data.profiles
      expect(await store.getState().removeReviewWord('a')).toBe(true)
      expect(store.getState().data.session).toBeNull()
      expect(store.getState().data.profiles).toEqual(before)
      expect(new Set(store.getState().data.excludedWordIds)).toEqual(new Set(['a', 'b']))
      await store.getState().hydrate()
      expect(store.getState().data.excludedWordIds).toEqual(['b'])
      expect(await store.getState().start(options)).toBe(false)
    } finally { await db.close() }
  })
  it('preserves policy-v2 alias archives and only merges completion when every existing profile is complete', () => {
    const state = existing()
    state.profiles[keyA].mastered = true
    const pending = migrateContextAliases(state, catalog, day)
    expect(pending.profiles[keyB].mastered).toBeUndefined()
    const old = JSON.parse(serializeContextState(pending))
    old.scheduleVersion = 2
    expect(parseContextState(JSON.stringify(old))).toEqual(pending)
    state.profiles[keyB].mastered = true
    const complete = migrateContextAliases(state, catalog, day)
    expect(complete.profiles[keyB].mastered).toBe(true)
    expect(parseContextState(serializeContextState(complete))).toEqual(complete)
  })
  it('adds a later reviewed group to an existing v3 record without changing the earlier archive', () => {
    const first = migrateContextAliases(existing(), catalog, day)
    const extra = [testSense('c'), testSense('d')]
    const additional: ContextAliasGroup = { id: 'later-word', representativeWordId: 'd',
      members: extra.map(sense => ({ wordId: sense.wordId, senseId: sense.id, version: sense.version })) }
    const nextCatalog = createAliasCatalog([...senses, ...extra], [...groups, additional])
    const previous = { ...first, profiles: { ...first.profiles,
      [profileKey(extra[0])]: { ...reviewProfile(undefined, extra[0], extra[0].examples[0], true, false, day), levelDay: day } } }
    const next = migrateContextAliases(previous, nextCatalog, day)
    expect(next.aliasMigrations!['same-word']).toEqual(first.aliasMigrations!['same-word'])
    expect(next.profiles[keyB]).toEqual(first.profiles[keyB])
    expect(next.profiles[profileKey(extra[0])]).toBeUndefined()
    expect(next.profiles[profileKey(extra[1])].due).toBe(previous.profiles[profileKey(extra[0])].due)
    expect(next.aliasMigrations!['later-word'].profiles).toEqual({
      [profileKey(extra[0])]: previous.profiles[profileKey(extra[0])] })
    expect(next.level.value).toBe(first.level.value)
    expect(parseContextState(serializeContextState(next))).toEqual(next)
    expect(migrateContextAliases(next, nextCatalog, day)).toBe(next)
  })
  it('keeps originals and score, takes the earlier date and lower stage, and never sums counters', () => {
    const before = existing(), raw = serializeContextState(before)
    const next = migrateContextAliases(before, catalog, day)
    expect(serializeContextState(before)).toBe(raw)
    expect(next.version).toBe(3)
    expect(next.level).toEqual({ value: 42, assessedWordIds: ['b', 'another'] })
    expect(next.profiles[keyA]).toBeUndefined()
    expect(next.profiles[keyB]).toMatchObject({ due: '2026-10-01', step: 1, failures: 2, failedDays: 2,
      lastDay: day, dailyAttempts: 2, levelDay: day })
    expect(next.profiles[keyB].examples['a-e1']).toEqual(before.profiles[keyA].examples['a-e1'])
    expect(next.profiles[keyB].examples['b-e1']).toEqual(before.profiles[keyB].examples['b-e1'])
    expect(next.profiles[keyB].examples['b-e2']).toBeUndefined()
    expect(next.aliasMigrations?.['same-word'].profiles).toEqual(before.profiles)
    expect(next.aliasMigrations?.['same-word'].level).toEqual(before.level)
    expect(migrateContextAliases(next, catalog, day)).toBe(next)
  })
  it('carries an alias-only record without moving its exposure counts to unseen examples', () => {
    const before = existing(); delete before.profiles[keyB]
    const next = migrateContextAliases(before, catalog, day)
    expect(next.profiles[keyB]).toMatchObject({ due: '2026-10-20', step: 4, senseId: 'sense-b' })
    expect(next.profiles[keyB].examples['b-e1']).toBeUndefined()
  })
  it('waits for the old session and undo history to finish', () => {
    const before = startContext(existing(), options, senses, '2026-10-20')
    expect(migrateContextAliases(before, catalog, day)).toBe(before)
  })
  it('preserves archives through backup serialization and rejects corrupt or conflicting mappings', () => {
    const next = migrateContextAliases(existing(), catalog, day)
    expect(parseContextState(serializeContextState(next))).toEqual(next)
    const broken = structuredClone(next)
    broken.aliasMigrations!['same-word'].profiles[keyA].senseId = 'wrong'
    expect(() => parseContextState(serializeContextState(broken))).toThrow('프로필')
    expect(() => parseContextState(serializeContextState({ ...next, version: 2 }))).toThrow('버전')
    expect(() => migrateContextAliases(next, createAliasCatalog(senses, []), day)).toThrow('연결 정보')
    expect(() => createAliasCatalog(senses, [...groups, { ...groups[0], id: 'duplicate' }])).toThrow('연결 대상')
  })
  it('atomically completes the old session, keeps undo until then, and deduplicates future study and score', async () => {
    localStorage.clear()
    const db = new ContextDatabase(new IDBFactory())
    try {
      const repo = new ContextRepository(db, localStorage)
      const base = await repo.load(emptyContextState())
      const source = existing()
      source.profiles[keyA].due = day
      source.profiles[keyA].lastDay = '2026-09-29'
      source.profiles[keyA].levelDay = '2026-09-29'
      const original = startContext(source, { ...options, candidateWordIds: ['a'], requiredWordIds: ['a'], wordCount: 1 }, senses, day)
      await repo.save(base, original)
      const store = createAsyncContextStore(senses, () => repo, () => day, groups)
      await store.getState().hydrate()
      expect(store.getState().data.version).toBe(2)
      expect(await store.getState().answer(false)).toBe(true)
      expect(store.getState().data.version).toBe(2)
      expect(await store.getState().undo()).toBe(true)
      expect(store.getState().data.profiles).toEqual(original.profiles)
      expect(await store.getState().answer(true)).toBe(true)
      const migrated = store.getState().data
      expect(migrated.version).toBe(3)
      expect(migrated.session).toBeNull()
      expect(await store.getState().start(options)).toBe(false)
      const dueStore = createAsyncContextStore(senses, () => repo, () => addDays(day, 1), groups)
      await dueStore.getState().hydrate()
      expect(await dueStore.getState().start(options)).toBe(true)
      expect(dueStore.getState().data.session).toMatchObject({ candidateWordIds: ['b'], requiredWordIds: ['b'], targetCount: 1 })
      expect(await dueStore.getState().answer(true)).toBe(true)
      expect(dueStore.getState().data.level.assessedWordIds).toEqual(migrated.level.assessedWordIds)
      const backup = await repo.exportRaw()
      await repo.restoreRaw(backup)
      expect((await db.read())!.data.aliasMigrations).toEqual(migrated.aliasMigrations)
    } finally { await db.close() }
  })
  it('keeps the pre-migration database when a boundary save fails and retries on hydrate', async () => {
    localStorage.clear()
    const db = new ContextDatabase(new IDBFactory())
    try {
      const repo = new ContextRepository(db, localStorage)
      const base = await repo.load(emptyContextState())
      const saved = await repo.save(base, existing())
      const failure = vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('disk full'))
      const store = createAsyncContextStore(senses, () => repo, () => day, groups)
      await store.getState().hydrate()
      expect(store.getState().ready).toBe(false)
      expect((await db.read())!.data).toEqual(saved.data)
      failure.mockRestore()
      await store.getState().hydrate()
      expect(store.getState().ready).toBe(true)
      expect(store.getState().data.version).toBe(3)
      const archive = store.getState().data.aliasMigrations
      await store.getState().hydrate()
      expect(store.getState().data.aliasMigrations).toEqual(archive)
    } finally { await db.close() }
  })
  it('migrates the reviewed production pair and rejects a stale pre-migration tab write', async () => {
    localStorage.clear()
    const db = new ContextDatabase(new IDBFactory())
    try {
      const group = contextAliasGroups.find(group => group.representativeWordId === 'lex-jmdict-1501350')!
      expect(group.members.map(member => member.wordId)).toContain('JLPTN3_179')
      const old = contextSenses.find(sense => sense.wordId === 'JLPTN3_179')!
      const representative = contextSenses.find(sense => sense.wordId === group.representativeWordId)!
      const state = emptyContextState()
      state.profiles[profileKey(old)] = { ...reviewProfile(undefined, old, old.examples[0], true, false, day), levelDay: day }
      const repo = new ContextRepository(db, localStorage)
      const base = await repo.load(state)
      const stale = await repo.save(base, state)
      let today = day
      const store = createAsyncContextStore(contextSenses, () => repo, () => today, contextAliasGroups)
      await store.getState().hydrate()
      expect(store.getState().ready).toBe(true)
      const migrated = store.getState().data
      expect(migrated.profiles[profileKey(representative)].due).toBe(state.profiles[profileKey(old)].due)
      expect(migrated.aliasMigrations![group.id].profiles[profileKey(old)]).toEqual(state.profiles[profileKey(old)])
      await expect(repo.save(stale, { ...state, revision: state.revision + 1 })).rejects.toThrow()
      expect((await db.read())!.data).toEqual(migrated)
      expect(await store.getState().start({ ...options, candidateWordIds: group.members.map(member => member.wordId), requiredWordIds: ['JLPTN3_179'] })).toBe(false)
      today = migrated.profiles[profileKey(representative)].due
      expect(await store.getState().start({ ...options, candidateWordIds: group.members.map(member => member.wordId),
        requiredWordIds: ['JLPTN3_179'] })).toBe(true)
      expect(store.getState().data.session).toMatchObject({ candidateWordIds: [representative.wordId], targetCount: 1 })
    } finally { await db.close() }
  })
})
