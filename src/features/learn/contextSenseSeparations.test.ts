import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { learnContent } from '@/features/vocab/data/learnContent'
import { senseSeparations } from '@/features/vocab/data/senseSeparations'
import sourceSeparations from '@/features/vocab/editor-data/senseSeparations.json'
import { exampleRetirements } from '@/features/vocab/data/exampleRetirements'
import { contextSenses, contextWordMap, loadContextSense, contextAliasGroups } from './contextContent'
import { createAliasCatalog, migrateContextAliases } from './contextAliases'
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
const separated = separateContextSenses([original], [row])
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

describe('complete representative-example separation', () => {
  it('keeps 穏やか personal manner and calm sea separate in loaded hints, examples and review records', async () => {
    const definition = senseSeparations.find(row => row.sourceSenseId === 'sense-lex-jmdict-1183590-1')!
    const [manner, sea] = await Promise.all(definition.usages.map(usage => loadContextSense(usage.id)))
    expect(manner.meaning).toBe('말투·태도가 온화하다')
    expect(manner.hint).toBe('말투나 태도가 부드럽고 차분한 모습을 떠올려 보세요.')
    expect(manner.examples.map(example => example.translationTarget)).toEqual(['온화한'])
    expect(sea.meaning).toBe('바다·환경이 평온하다')
    expect(sea.hint).toBe('파도나 바람이 거세지 않고 잔잔한 상태를 떠올려 보세요.')
    expect(sea.examples.map(example => example.id)).toEqual(['sense-lex-jmdict-1183590-1-ex-2'])
    const source = learnContent.find(sense => sense.id === definition.sourceSenseId)!
    for (const target of [manner, sea]) {
      const old = emptyContextState()
      old.profiles[profileKey(source)] = { ...reviewProfile(undefined, source, target.examples[0], true, false, day), levelDay: day }
      const migrated = reconcileSeparatedSenses(old, [definition], exampleRetirements)
      expect(reviewList(migrated, [manner, sea]).map(row => row.sense.meaning)).toEqual([target.meaning])
    }
  })

  it.each([false, true])('preserves the reviewed 助ける alias before/after its prior migration (%s)', alreadyMerged => {
    const definition = senseSeparations.find(row => row.sourceSenseId === 'sense-handmade_2-1')!
    const source = learnContent.find(sense => sense.id === definition.sourceSenseId)!
    const peer = learnContent.find(sense => sense.id === 'sense-AbsoluteVerb_461-1')!
    const usages = separateContextSenses([source], [definition])
    const legacy = emptyContextState()
    legacy.profiles[profileKey(source)] = { ...reviewProfile(undefined, source, source.examples[0], true, false, addDays(day, -1)), levelDay: addDays(day, -1) }
    legacy.profiles[profileKey(peer)] = { ...reviewProfile(undefined, peer, peer.examples[0], true, false, day), levelDay: day }
    const group = contextAliasGroups.find(group => group.representativeWordId === source.wordId)!
    const oldCatalog = createAliasCatalog([source, peer], [group])
    const old = alreadyMerged ? migrateContextAliases(legacy, oldCatalog, day) : legacy
    const split = reconcileSeparatedSenses(old, [definition], exampleRetirements)
    const catalog = createAliasCatalog([source, peer, ...usages], [group], [definition])
    const migrated = migrateContextAliases(split, catalog, day)
    expect(migrated.profiles[profileKey(source)]).toBeUndefined()
    expect(migrated.profiles[profileKey(peer)]).toBeUndefined()
    expect(migrated.profiles[profileKey(usages[1])]).toBeDefined()
    expect(!!migrated.profiles[profileKey(usages[0])]).toBe(!alreadyMerged)
    expect(migrated.aliasMigrations![group.id].group).toEqual(group)
    expect(migrated.senseSeparations![profileKey(source)].profile).toEqual(old.profiles[profileKey(source)])
    const restored = parseContextState(serializeContextState(migrated))
    expect(reconcileSeparatedSenses(restored, [definition], exampleRetirements)).toBe(restored)
    expect(migrateContextAliases(restored, catalog, day)).toBe(restored)
    const profile = restored.profiles[profileKey(usages[1])]
    const started = startContext(restored, { ...options, candidateWordIds: [source.wordId] }, [usages[1]], profile.due)
    expect(started.session!.current.senseId).toBe(usages[1].id)
  })

  it('commits the production alias and all new separations together, preserving data on save failure', async () => {
    const db = new ContextDatabase(new IDBFactory())
    const storage = new Map<string, string>()
    const local = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) } }
    try {
      const repo = new ContextRepository(db, local)
      const source = learnContent.find(sense => sense.id === 'sense-handmade_2-1')!
      const old = emptyContextState()
      old.profiles[profileKey(source)] = { ...reviewProfile(undefined, source, source.examples[1], true, false, day), levelDay: day }
      const base = await repo.load(emptyContextState())
      const saved = await repo.save(base, old)
      const failure = vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('disk full'))
      const store = createAsyncContextStore(contextSenses, () => repo, () => day, contextAliasGroups, exampleRetirements, senseSeparations)
      await store.getState().hydrate()
      expect(store.getState().ready).toBe(false)
      expect((await db.read())!.data).toEqual(saved.data)
      failure.mockRestore()
      await store.getState().hydrate()
      expect(store.getState().ready).toBe(true)
      expect(Object.keys(store.getState().data.profiles)).toEqual(['sense-handmade_2-1-usage-2@1'])
      const after = store.getState().data
      expect(parseContextState(serializeContextState(after))).toEqual(after)
      await store.getState().hydrate()
      expect(store.getState().data).toEqual(after)
    } finally { await db.close() }
  })

  it('loads every split usage with only its owned meaning, hint and representative sentence', async () => {
    expect(senseSeparations).toHaveLength(190)
    expect(contextSenses).toHaveLength(5874)
    expect(contextSenses.every(sense => sense.examples.length === 1)).toBe(true)
    for (const definition of senseSeparations) {
      const source = learnContent.find(sense => sense.id === definition.sourceSenseId)!
      const loaded = await Promise.all(definition.usages.map(usage => loadContextSense(usage.id)))
      expect(loaded.flatMap(sense => sense.examples.map(example => example.id))).toEqual(source.examples.map(example => example.id))
      for (let i = 0; i < loaded.length; i++) {
        expect(loaded[i].meaning).toBe(definition.usages[i].meaning)
        expect(loaded[i].hint).toBe(definition.usages[i].hint)
        expect(loaded[i].examples).toHaveLength(1)
        expect(similarHintWords(loaded[i], contextWordMap.get(source.wordId)!, loaded[i].examples[0])).toEqual([])
      }
    }
  }, 10000)

  it('migrates every possible last example without copying schedules and keeps its representative through review and undo', () => {
    for (const definition of senseSeparations) {
      const source = learnContent.find(sense => sense.id === definition.sourceSenseId)!
      const usages = separateContextSenses([source], [definition])
      for (const target of usages) {
        const state = emptyContextState()
        const example = target.examples[0]
        state.profiles[profileKey(source)] = { ...reviewProfile(undefined, source, example, true, false, day), levelDay: day }
        const migrated = reconcileSeparatedSenses(state, senseSeparations, exampleRetirements)
        const profile = migrated.profiles[profileKey(target)]
        expect(Object.keys(migrated.profiles)).toEqual([profileKey(target)])
        expect(profile.due).toBe(state.profiles[profileKey(source)].due)
        expect(migrated.senseSeparations![profileKey(source)].profile).toEqual(state.profiles[profileKey(source)])
        const settings = { ...options, candidateWordIds: [source.wordId] }
        let current = migrated
        for (let i = 0; i < 3; i++) {
          const due = current.profiles[profileKey(target)].due
          const started = startContext(current, settings, usages, due)
          expect(started.session!.current).toMatchObject({ senseId: target.id, exampleId: example.id })
          const answered = answerContext(started, true, usages, due)
          expect(undoContext(answered).profiles).toEqual(started.profiles)
          current = parseContextState(serializeContextState(answered))
          expect(reconcileSeparatedSenses(current, senseSeparations, exampleRetirements)).toBe(current)
          expect(Object.keys(current.profiles)).toEqual([profileKey(target)])
        }
      }
    }
  }, 10000)
})

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
      const store = createAsyncContextStore(separated, () => repo, () => day, [], exampleRetirements.filter(item => item.senseId === original.id), [row])
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
