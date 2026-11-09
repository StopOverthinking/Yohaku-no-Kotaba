import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerContext, emptyContextState, profileKey, reviewProfile, startContext, undoContext } from './contextEngine'
import { estimateJlptFromHistory } from './jlptLearningEstimate'
import { ContextDatabase } from './contextDatabase'
import { ContextRepository } from './contextRepository'
import { createAsyncContextStore } from './contextAsyncStore'
import { CONTEXT_STORAGE_KEY, parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import { currentJlptGrade, resultJlptGrades } from './jlptEstimate'
import { legacyContextState, testSense } from './contextTestFixtures'
import type { ContextState } from './contextTypes'

const day = '2026-11-06'
const senses = Array.from({ length: 6 }, (_, i) => testSense(`new-${i}`, 20 + i * 4))
const options = { setId: 'all', setName: 'test', candidateWordIds: senses.map(s => s.wordId), requiredWordIds: [], wordCount: 6, allowEarly: false }
const calibrated = (): ContextState => ({ ...emptyContextState(),
  level: { value: 30, assessedWordIds: Array.from({ length: 20 }, (_, i) => `old-${i}`) },
  jlptEstimate: { policyVersion: 1, value: 30 },
})
const databases: ContextDatabase[] = []
afterEach(async () => { vi.restoreAllMocks(); localStorage.clear(); await Promise.all(databases.splice(0).map(db => db.close())) })
async function setup(seed: ContextState = calibrated()) {
  localStorage.clear()
  const db = new ContextDatabase(new IDBFactory()); databases.push(db)
  const repo = new ContextRepository(db, localStorage)
  localStorage.setItem(CONTEXT_STORAGE_KEY, serializeContextState(seed))
  const store = createAsyncContextStore(senses, () => repo, () => day)
  return { db, repo, store }
}

describe('JLPT estimate across learning and storage', () => {
  it.each([2, 4] as const)('reestimates schema v%s history atomically once, including backup restore and stale tabs', async version => {
    const pool = Array.from({ length: 24 }, (_, i) => testSense(`past-${i}`, 25))
    const seed = legacyContextState(calibrated())
    for (const [i, sense] of pool.entries()) seed.profiles[profileKey(sense)] = {
      ...reviewProfile(undefined, sense, sense.examples[0], i % 4 !== 0, false, '2026-11-01'), levelDay: '2026-11-01',
    }
    if (version === 4) { seed.version = 4; seed.jlptEstimate = { policyVersion: 1, value: 45 } }
    const { db, repo } = await setup(seed)
    const content = [...senses, ...pool]
    const store = createAsyncContextStore(content, () => repo, () => day)
    vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'))
    await store.getState().hydrate()
    expect(store.getState().ready).toBe(false)
    const stale = (await db.read())!
    expect(stale.data).toEqual(seed)
    await store.getState().hydrate()
    const fitted = store.getState().data
    expect(fitted.jlptHistoryReestimate).toEqual({ version: 1, wordCount: 24 })
    expect(fitted.jlptEstimate!.value).toBe(estimateJlptFromHistory(seed, content)!.value)
    expect(fitted.profiles).toEqual(seed.profiles)
    expect(fitted.level).toEqual(seed.level)
    await expect(repo.save(stale, seed)).rejects.toThrow('다른 화면')
    const raw = await repo.exportRaw()
    await repo.restoreRaw(raw)
    await store.getState().hydrate()
    expect(store.getState().data.jlptEstimate).toEqual(fitted.jlptEstimate)
    expect(store.getState().data.jlptHistoryReestimate).toEqual(fitted.jlptHistoryReestimate)
    await store.getState().start({ ...options, candidateWordIds: ['new-0'], wordCount: 1 })
    await store.getState().answer(false)
    const changed = store.getState().data.jlptEstimate
    await store.getState().hydrate()
    expect(store.getState().data.jlptEstimate).toEqual(changed)
    await store.getState().undo()
    expect(store.getState().data.jlptEstimate).toEqual(fitted.jlptEstimate)
  })

  it('defers an older v4 reestimate until completion and records the actual resulting estimate', async () => {
    const pool = Array.from({ length: 24 }, (_, i) => testSense(`past-${i}`, 25))
    const seed = calibrated()
    for (const [i, sense] of pool.entries()) seed.profiles[profileKey(sense)] = {
      ...reviewProfile(undefined, sense, sense.examples[0], i % 4 !== 0, false, '2026-11-01'), levelDay: '2026-11-01',
    }
    let active = startContext(seed, { ...options, candidateWordIds: ['new-0'], wordCount: 1 }, [...senses, ...pool], day)
    delete active.jlptHistoryReestimate
    active = answerContext(active, false, [...senses, ...pool], day)
    const { repo } = await setup(active)
    const store = createAsyncContextStore([...senses, ...pool], () => repo, () => day)
    await store.getState().hydrate()
    expect(store.getState().data).toEqual(active)
    await store.getState().answer(true)
    const complete = store.getState().data
    expect(complete.jlptHistoryReestimate!.wordCount).toBe(25)
    expect(complete.lastScoreChange!.jlpt!.before).toBe(30)
    expect(complete.lastScoreChange!.jlpt!.after).toBe(complete.jlptEstimate!.value)
    expect(store.getState().lastResult!.score).toEqual(complete.lastScoreChange)
  })
  it('preserves recommendation, card selection and review profiles against the legacy engine, and round-trips every undo', () => {
    const original = startContext(calibrated(), options, senses, day, () => 0.5)
    let state = original, legacy = legacyContextState(original), n = 0
    while (state.session && n < 50) {
      const known = n++ % 3 !== 0
      state = answerContext(state, known, senses, day)
      legacy = answerContext(legacy, known, senses, day)
      expect(state.level).toEqual(legacy.level)
      expect(state.profiles).toEqual(legacy.profiles)
      expect(state.session).toEqual(legacy.session)
      expect(parseContextState(serializeContextState(state))).toEqual(state)
    }
    expect(state.session).toBeNull()
    expect(state.jlptEstimate!.value).not.toBe(state.level.value)
    while (state.history.length) state = undoContext(parseContextState(serializeContextState(state)))
    expect(state).toEqual(original)
  })

  it('has the same estimate when identical responses are split across sessions', () => {
    const pool = senses.map(sense => ({ ...sense, examples: sense.examples.map(e => ({ ...e, difficulty: 25 })) }))
    let together = startContext(calibrated(), options, pool, day, () => 0.5)
    let split = calibrated()
    while (together.session) {
      const id = pool.find(s => s.id === together.session!.current.senseId)!.wordId
      split = startContext({ ...split, history: [] }, { ...options, candidateWordIds: [id], wordCount: 1 }, pool, day)
      together = answerContext(together, true, pool, day)
      split = answerContext(split, true, pool, day)
    }
    expect(split.jlptEstimate).toEqual(together.jlptEstimate)
    expect(split.level).toEqual(together.level)
  })

  it('leaves both scores unchanged on same-day retries, reveals and hints', async () => {
    const { store } = await setup()
    await store.getState().hydrate()
    await store.getState().start({ ...options, candidateWordIds: ['new-0'], wordCount: 1 })
    const before = store.getState().data.jlptEstimate
    await store.getState().reveal(); await store.getState().toggleHint()
    expect(store.getState().data.jlptEstimate).toEqual(before)
    await store.getState().answer(false)
    const first = store.getState().data
    await store.getState().answer(true)
    expect(store.getState().data.jlptEstimate).toEqual(first.jlptEstimate)
    expect(store.getState().data.level).toEqual(first.level)
    expect(store.getState().lastResult!.score.jlpt).toEqual({ policyVersion: 1, before: 30, after: first.jlptEstimate!.value })
  })

  it('commits the estimate with the card, survives reload/backup, and preserves it on removal and conflict', async () => {
    const { db, repo, store } = await setup()
    await store.getState().hydrate()
    await store.getState().start(options)
    const before = store.getState().data
    vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'))
    expect(await store.getState().answer(false)).toBe(false)
    expect(store.getState().data).toBe(before)
    expect((await db.read())!.data).toEqual(before)
    expect(await store.getState().answer(false)).toBe(true)
    const answered = store.getState().data
    await store.getState().hydrate()
    expect(store.getState().data).toEqual(answered)
    const raw = await repo.exportRaw()
    await repo.restoreRaw(raw)
    expect(await store.getState().undo()).toBe(false)
    expect((await db.read())!.data.jlptEstimate).toEqual(answered.jlptEstimate)
    await store.getState().hydrate()
    expect(await store.getState().undo()).toBe(true)
    expect(store.getState().data.jlptEstimate).toEqual(before.jlptEstimate)
    await store.getState().answer(false)
    const estimate = store.getState().data.jlptEstimate
    const word = senses.find(s => s.id === before.session!.current.senseId)!.wordId
    await store.getState().removeReviewWord(word)
    expect(store.getState().data.jlptEstimate).toEqual(estimate)
    await store.getState().resetLearning()
    expect(store.getState().data.jlptEstimate).toEqual({ policyVersion: 1, value: null })
    expect(currentJlptGrade(store.getState().data)).toBeNull()
  })

  it('records a null starting grade when the twentieth word finishes calibration, including undo', async () => {
    const seed = calibrated()
    seed.level.assessedWordIds.pop(); seed.jlptEstimate!.value = null
    const { store } = await setup(seed)
    await store.getState().hydrate(); await store.getState().start(options)
    await store.getState().answer(true)
    const after = store.getState().data.level.value
    expect(store.getState().data.jlptEstimate!.value).toBe(after)
    await store.getState().undo()
    expect(store.getState().data.jlptEstimate!.value).toBeNull()
    await store.getState().answer(true)
    while (store.getState().data.session) await store.getState().answer(true)
    const result = store.getState().lastResult!
    expect(result.score.jlpt!.before).toBeNull()
    expect(result.score.jlpt!.after).toBe(store.getState().data.jlptEstimate!.value)
    expect(resultJlptGrades(result.score, store.getState().data).before).toBeNull()
  })

  it.each(['complete', 'discard'])('keeps a legacy active session and undo intact until %s', async action => {
    let active = startContext(calibrated(), { ...options, candidateWordIds: ['new-0'], wordCount: 1 }, senses, day)
    active = legacyContextState(answerContext(active, false, senses, day))
    const { store, repo } = await setup(active)
    await store.getState().hydrate()
    expect(store.getState().data).toEqual(active)
    expect(store.getState().data.version).toBe(2)
    await store.getState().undo()
    expect(store.getState().data.jlptEstimate).toBeUndefined()
    await store.getState().answer(false)
    expect(store.getState().data).toMatchObject({ version: 2, level: active.level })
    const before = store.getState().data
    vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'))
    const finish = () => action === 'complete' ? store.getState().answer(true) : store.getState().discard()
    expect(await finish()).toBe(false)
    expect(store.getState().data).toBe(before)
    expect(await finish()).toBe(true)
    const migrated = store.getState().data
    expect(migrated.version).toBe(4)
    expect(migrated.jlptEstimate!.value).toBe(active.level.value)
    expect(parseContextState(await repo.exportRaw())).toEqual(migrated)
    await store.getState().hydrate()
    expect(store.getState().data).toEqual(migrated)
  })

  it('retries a failed idle migration without losing the legacy record or initializing twice', async () => {
    const legacy = legacyContextState(calibrated())
    const { db, repo, store } = await setup(legacy)
    vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'))
    await store.getState().hydrate()
    expect(store.getState().ready).toBe(false)
    expect((await db.read())!.data).toEqual(legacy)
    await store.getState().hydrate()
    const migrated = store.getState().data
    expect(migrated.version).toBe(4)
    expect(migrated.jlptEstimate!.value).toBe(legacy.level.value)
    await store.getState().hydrate()
    expect(store.getState().data).toEqual(migrated)
  })

  it('initializes from the completed legacy calibration before aliases reduce its twenty IDs', async () => {
    const legacy = legacyContextState(calibrated())
    legacy.level.assessedWordIds.splice(0, 2, senses[0].wordId, senses[1].wordId)
    const { repo } = await setup(legacy)
    const group = { id: 'same', representativeWordId: senses[1].wordId,
      members: senses.slice(0, 2).map(s => ({ wordId: s.wordId, senseId: s.id, version: s.version })) }
    const store = createAsyncContextStore(senses, () => repo, () => day, [group])
    await store.getState().hydrate()
    expect(store.getState().ready).toBe(true)
    expect(store.getState().data.level.assessedWordIds).toHaveLength(19)
    expect(store.getState().data.jlptEstimate!.value).toBe(30)
    expect(currentJlptGrade(store.getState().data)).toBe('N3.5')
  })

  it.each([
    (state: any) => { delete state.jlptEstimate },
    (state: any) => { state.jlptEstimate.policyVersion = 99 },
    (state: any) => { state.jlptEstimate.value = '30' },
    (state: any) => { delete state.history[0].jlptEstimate },
    (state: any) => { state.history[0].jlptEstimate.value = {} },
    (state: any) => { state.jlptHistoryReestimate = { version: 99, wordCount: 24 } },
    (state: any) => { state.jlptHistoryReestimate = { version: 1, wordCount: -1 } },
    (state: any) => { state.lastScoreChange = { before: 30, after: 31, completedAt: day, jlpt: { policyVersion: 99, before: 30, after: 31 } } },
  ])('rejects damaged or unsupported estimates before a backup can write', async damage => {
    const active = answerContext(startContext(calibrated(), options, senses, day), false, senses, day)
    const broken = JSON.parse(serializeContextState(active)); damage(broken)
    const { db, repo, store } = await setup()
    await store.getState().hydrate()
    const before = await db.read()
    await expect(repo.restoreRaw(JSON.stringify(broken))).rejects.toThrow()
    expect(await db.read()).toEqual(before)
  })
})
