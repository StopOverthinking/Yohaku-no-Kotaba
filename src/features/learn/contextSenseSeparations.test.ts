import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { learnContent } from '@/features/vocab/data/learnContent'
import { senseSeparations } from '@/features/vocab/data/senseSeparations'
import sourceSeparations from '@/features/vocab/editor-data/senseSeparations.json'
import { exampleRetirements } from '@/features/vocab/data/exampleRetirements'
import { contextSenses, contextWordMap, loadContextSense } from './contextContent'
import { addDays, answerContext, emptyContextState, profileKey, reviewProfile, startContext, undoContext } from './contextEngine'
import { reconcileSeparatedSenses, separateContextSenses } from './contextSenseSeparations'
import { parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import { similarHintWords } from './contextPresentation'
import { reviewList } from './reviewList'
import { ContextDatabase } from './contextDatabase'
import { ContextRepository } from './contextRepository'
import { createAsyncContextStore } from './contextAsyncStore'
import { validateLearnContent } from './contentValidation'

const row = senseSeparations[0]
const original = learnContent.find(sense => sense.id === row.sourceSenseId)!
const separated = separateContextSenses([original], senseSeparations)
const [she, girlfriend] = separated
const day = '2026-10-15'
const options = { setId: 'jlpt-level-n4', setName: 'N4', candidateWordIds: [original.wordId], requiredWordIds: [], wordCount: 1, allowEarly: false }
function learned(exampleIndex = 1) {
  const state = emptyContextState()
  state.level = { value: 25, assessedWordIds: [original.wordId] }
  state.profiles[profileKey(original)] = { ...reviewProfile(undefined, original, original.examples[exampleIndex], true, false, addDays(day, -3)),
    levelDay: addDays(day, -3) }
  return state
}

describe('independent meanings of 彼女', () => {
  it('projects reviewed source membership to one meaning, hint and sentence without changing historical content', async () => {
    const before = JSON.stringify(original)
    expect(senseSeparations).toEqual(sourceSeparations.separations)
    expect(separated.map(sense => sense.meaning)).toEqual(['그녀', '여자친구'])
    expect(contextSenses.filter(sense => sense.wordId === original.wordId)).toEqual(expect.arrayContaining(separated.map(sense =>
      expect.objectContaining({ id: sense.id, meaning: sense.meaning, examples: sense.examples.map(({ id, version, difficulty, status }) => ({ id, version, difficulty, status })) }))))
    expect(contextSenses.some(sense => sense.id === original.id)).toBe(false)
    for (const sense of separated) {
      const full = await loadContextSense(sense.id)
      expect(full.meaning).toBe(sense.meaning)
      expect(full.hint).toBe(sense.hint)
      expect(full.examples).toHaveLength(1)
      expect(full.examples[0].translationTarget).toBe(sense.meaning)
      expect(full.examples[0].beforeFurigana).toBeDefined()
      expect(full.confusions).toEqual([])
      expect(similarHintWords(full, contextWordMap.get(sense.wordId)!, full.examples[0])).toEqual([])
    }
    expect(validateLearnContent(separated, new Set([original.wordId]))).toEqual([])
    expect(JSON.stringify(original)).toBe(before)
  })

  it.each([0, 1])('migrates only the last observed meaning (%i), preserves its due date and never clones the other meaning', index => {
    const state = learned(index), target = separated[index], other = separated[1 - index]
    const migrated = reconcileSeparatedSenses(state, senseSeparations, exampleRetirements)
    expect(Object.keys(migrated.profiles)).toEqual([profileKey(target)])
    expect(migrated.profiles[profileKey(target)]).toEqual({ ...state.profiles[profileKey(original)], senseId: target.id })
    expect(migrated.profiles[profileKey(other)]).toBeUndefined()
    expect(migrated.senseSeparations![profileKey(original)].profile).toBe(state.profiles[profileKey(original)])
    expect(migrated.level).toBe(state.level)
    expect(reviewList(migrated, separated).map(item => item.sense.meaning)).toEqual([target.meaning])
    expect(reconcileSeparatedSenses(migrated, senseSeparations, exampleRetirements)).toBe(migrated)
    expect(parseContextState(serializeContextState(migrated))).toEqual(migrated)
    expect(state.senseSeparations).toBeUndefined()
  })

  it('reviews girlfriend through every due date and same-session retry without ever selecting she', () => {
    let state = reconcileSeparatedSenses(learned(), senseSeparations, exampleRetirements)
    for (let i = 0; i < 5; i++) {
      const due = state.profiles[profileKey(girlfriend)].due
      const started = startContext(state, options, separated, due)
      expect(started.session!.current).toMatchObject({ senseId: girlfriend.id, exampleId: girlfriend.examples[0].id })
      state = answerContext(started, i !== 0, separated, due)
      if (i === 0) {
        expect(state.session!.current.senseId).toBe(girlfriend.id)
        state = answerContext(state, true, separated, due)
      }
      expect(reviewList(state, separated).map(item => item.sense.meaning)).toEqual(['여자친구'])
      expect(state.profiles[profileKey(she)]).toBeUndefined()
      state = parseContextState(serializeContextState(state))
      expect(reconcileSeparatedSenses(state, senseSeparations, exampleRetirements)).toBe(state)
    }
  })

  it('preserves mixed original evidence without transferring shared completion or exposure to the other meaning', () => {
    const state = learned()
    const profile = state.profiles[profileKey(original)]
    profile.mastered = true
    profile.examples[she.examples[0].id] = { seen: 4, failures: 2, hints: 1 }
    const migrated = reconcileSeparatedSenses(state, senseSeparations, exampleRetirements)
    expect(migrated.profiles[profileKey(girlfriend)].mastered).toBeUndefined()
    expect(migrated.profiles[profileKey(girlfriend)].examples).toEqual({ [girlfriend.examples[0].id]: profile.examples[girlfriend.examples[0].id] })
    expect(migrated.profiles[profileKey(she)]).toBeUndefined()
    expect(migrated.senseSeparations![profileKey(original)].profile).toEqual(profile)
  })

  it('moves current, queued, retry and undo cards by their own example, including an undo across meanings', () => {
    const old = learned(0)
    const active = startContext(old, options, [original], day)
    expect(active.session!.current.exampleId).toBe(girlfriend.examples[0].id)
    const answered = answerContext(active, false, [original], day)
    answered.session!.queue = [answered.session!.current]
    answered.session!.retry = [answered.session!.current]
    answered.session!.revealed = true
    answered.session!.hintShown = true
    const migrated = reconcileSeparatedSenses(answered, senseSeparations, exampleRetirements)
    for (const card of [migrated.session!.current, ...migrated.session!.cards, ...migrated.session!.queue, ...migrated.session!.retry])
      expect(card.senseId).toBe(girlfriend.id)
    expect(migrated.session).toMatchObject({ revealed: false, hintShown: false, hintUsed: false })
    expect(migrated.history[0].profileChanges![profileKey(she)]).toMatchObject({ senseId: she.id })
    const undone = undoContext(parseContextState(serializeContextState(migrated)))
    expect(Object.keys(undone.profiles)).toEqual([profileKey(she)])
    expect(undone.session!.current.senseId).toBe(girlfriend.id)
    const again = answerContext(undone, true, separated, day)
    expect(again.profiles[profileKey(she)]).toEqual(undone.profiles[profileKey(she)])
    expect(again.profiles[profileKey(girlfriend)].examples).toEqual({ [girlfriend.examples[0].id]: { seen: 1, failures: 0, hints: 0 } })
  })

  it('recognizes a historically retired pronoun example without interpreting it as girlfriend', () => {
    const state = learned(0), profile = state.profiles[profileKey(original)]
    const retired = exampleRetirements.find(item => item.senseId === original.id)!
    profile.lastExampleId = retired.exampleId
    profile.examples = { [retired.exampleId]: { seen: 1, failures: 0, hints: 0 } }
    const migrated = reconcileSeparatedSenses(state, senseSeparations, exampleRetirements)
    expect(Object.keys(migrated.profiles)).toEqual([profileKey(she)])
    expect(migrated.profiles[profileKey(girlfriend)]).toBeUndefined()
  })

  it('rejects incomplete, overlapping, stale and conflicting partitions instead of guessing', () => {
    for (const edit of [
      (copy: typeof row) => { copy.usages[1].exampleIds = [she.examples[0].id] },
      (copy: typeof row) => { copy.sourceVersion++ },
      (copy: typeof row) => { copy.usages[0].meaning = '' },
      (copy: typeof row) => { copy.usages[0].hint = '彼女' },
      (copy: typeof row) => { copy.usages[1].id = copy.usages[0].id },
    ]) {
      const copy = structuredClone(row)
      edit(copy)
      expect(() => separateContextSenses([original], [copy])).toThrow('용법 분리')
    }
    const unknown = learned()
    unknown.profiles[profileKey(original)].lastExampleId = 'unknown'
    expect(() => reconcileSeparatedSenses(unknown, senseSeparations, exampleRetirements)).toThrow('용법 분리')
    const migrated = reconcileSeparatedSenses(learned(), senseSeparations, exampleRetirements)
    const changed = structuredClone(row)
    changed.usages[0].meaning = '다른 뜻'
    expect(() => reconcileSeparatedSenses(migrated, [changed])).toThrow('용법 분리')
    const damaged = structuredClone(migrated)
    damaged.senseSeparations![profileKey(original)].profile!.senseId = 'wrong'
    expect(() => parseContextState(serializeContextState(damaged))).toThrow('용법 분리')
  })

  it('commits migration and undo atomically, preserves the old DB after failure and clears the archive on reset', async () => {
    localStorage.clear()
    const db = new ContextDatabase(new IDBFactory())
    try {
      const before = answerContext(startContext(learned(0), options, [original], day), false, [original], day)
      await db.write(null, before)
      const repo = new ContextRepository(db, localStorage)
      const store = createAsyncContextStore(separated, () => repo, () => day, [], exampleRetirements.filter(item => item.senseId === original.id), senseSeparations)
      const save = vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'))
      await store.getState().hydrate()
      expect(store.getState().ready).toBe(false)
      expect((await db.read())!.data).toEqual(before)
      await store.getState().hydrate()
      expect(store.getState().ready).toBe(true)
      expect(store.getState().data.session!.current.senseId).toBe(girlfriend.id)
      const revision = store.getState().data.revision
      await store.getState().hydrate()
      expect(store.getState().data.revision).toBe(revision)
      expect(await store.getState().undo()).toBe(true)
      expect(Object.keys(store.getState().data.profiles)).toEqual([profileKey(she)])
      expect((await db.read())!.data).toEqual(store.getState().data)
      expect(await store.getState().resetLearning()).toBe(true)
      expect(store.getState().data.senseSeparations).toBeUndefined()
      expect(store.getState().data.profiles).toEqual({})
      save.mockRestore()
    } finally { await db.close(); localStorage.clear() }
  })
})
