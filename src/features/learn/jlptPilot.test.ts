import { setImmediate } from 'node:timers/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { allWords, getWordsForSet } from '@/features/vocab/model/selectors'
import { contextSenses, contextSenseMap } from './contextContent'
import { startContext, answerContext, emptyContextState, undoContext } from './contextEngine'
import { vocabularySets } from '@/features/vocab/data/vocabularySets'
import { learnContent } from '@/features/vocab/data/learnContent'
import sourceSets from '@/features/vocab/editor-data/vocabularySets.json'
import sourceWords from '@/features/vocab/editor-data/vocabularyWords.json'
import sourceLearnContent from '@/features/vocab/editor-data/learnContent.json'
import sourceThemeWordbooks from '@/features/vocab/editor-data/themeWordbooks.json'
import sourceThemeWords from '@/features/vocab/editor-data/themeWords.json'
import sourceComparisonWordbooks from '@/features/vocab/editor-data/comparisonWordbooks.json'
import sourceComparisonWords from '@/features/vocab/editor-data/comparisonWords.json'
import sourceComparisonPairs from '@/features/vocab/editor-data/comparisonPairs.json'
import { validateVocabSource, type VocabSource } from '@/features/vocab/model/sourceValidation'

describe('reviewed JLPT pilot', () => {
  // Synchronous corpus batches otherwise starve the worker's RPC responses
  // across the entire suite, even though each test meets its own timeout.
  afterEach(async () => { await setImmediate() })

  it('recommends a beginner example first even with the complete N5–N1 corpus', () => {
    const settings = { setId: 'all', setName: 'all', candidateWordIds: allWords.map((word) => word.id),
      requiredWordIds: [], wordCount: 10, allowEarly: false }
    const state = startContext(emptyContextState(), settings, contextSenses, '2026-10-02')
    expect(state.level).toEqual({ value: 16, assessedWordIds: [] })
    const current = state.session!.current
    const sense = contextSenseMap.get(current.senseId)!
    const example = sense.examples.find((item) => item.id === current.exampleId)!
    expect(example.difficulty).toBeGreaterThanOrEqual(14)
    expect(example.difficulty).toBeLessThanOrEqual(18)
  })
  it('continues an existing profile through a published level reference without copying or losing its schedule', () => {
    const book = vocabularySets.find((set) => set.membershipMode === 'explicit' &&
      set.wordIds.some((id) => allWords.find((word) => word.id === id)?.setId !== set.id))!
    expect(book).toBeDefined()
    const word = allWords.find((item) => book.wordIds.includes(item.id) && item.setId !== book.id)!
    const settings = { setId: word.setId, setName: 'original', candidateWordIds: [word.id], requiredWordIds: [], wordCount: 1, allowEarly: true }
    let state = startContext(emptyContextState(), settings, contextSenses, '2026-09-29')
    const senseId = state.session!.current.senseId
    state = answerContext(state, true, contextSenses, '2026-09-29')
    const profiles = state.profiles
    expect(() => startContext(state, { ...settings, setId: book.id, setName: book.name }, contextSenses, '2026-09-30')).toThrow('지금 복습')
    state = startContext(state, { ...settings, setId: book.id, setName: book.name }, contextSenses, '2026-10-02')
    expect(state.session!.current.senseId).toBe(senseId)
    expect(state.profiles).toEqual(profiles)
    state = answerContext(state, false, contextSenses, '2026-10-02')
    expect(Object.keys(state.profiles)).toEqual(Object.keys(profiles))
    expect(state.level.assessedWordIds).toEqual([word.id])
    state = undoContext(state)
    expect(state.profiles).toEqual(profiles)
    expect(state.session?.setId).toBe(book.id)
  })
  const corpusBatches = ['n5', 'n4', 'n3', 'n2', 'n1'].flatMap(level => {
    const words = getWordsForSet(`jlpt-level-${level}`)
    return Array.from({ length: Math.ceil(words.length / 200) }, (_, batch) => {
      const start = batch * 200
      return [level, start + 1, Math.min(start + 200, words.length), words.slice(start, start + 200)] as const
    })
  })
  it.each(corpusBatches)('can study %s words %i–%i and rotate every available example', (level, _from, _to, words) => {
    const setId = `jlpt-level-${level}`
    expect(getWordsForSet(setId).length).toBeGreaterThanOrEqual(20)
    for (const word of words) {
      const wordSenses = contextSenses.filter((sense) => sense.wordId === word.id)
      expect(wordSenses.length).toBeGreaterThanOrEqual(1)
      const seen = new Map(wordSenses.map(sense => [sense.id, new Set<string>()]))
      for (const target of wordSenses) {
        let state = emptyContextState()
        // Verify each usage against the corpus independently. Another usage of
        // this same word cannot be studied during its current cooldown.
        const pool = contextSenses.filter(sense => sense.wordId !== word.id || sense.id === target.id)
        const rounds = Math.max(3, target.examples.length)
        for (let i = 0; i < rounds; i++) {
          const day = i === 0 ? '2026-09-29' : state.profiles[`${target.id}@${target.version}`].due
          state = startContext(state, { setId, setName: level, candidateWordIds: [word.id], requiredWordIds: [], wordCount: 1, allowEarly: false }, pool, day)
          const current = state.session!.current
          const sense = contextSenseMap.get(current.senseId)!
          expect(sense.wordId).toBe(word.id)
          expect(sense.id).toBe(target.id)
          expect(sense.examples.length).toBeGreaterThanOrEqual(1)
          if (i < sense.examples.length) expect(seen.get(sense.id)!.has(current.exampleId)).toBe(false)
          seen.get(sense.id)!.add(current.exampleId)
          state = answerContext(state, true, pool, day)
          expect(state.session).toBeNull()
        }
      }
      for (const sense of wordSenses) expect(seen.get(sense.id)!.size).toBe(sense.examples.length)
    }
  // Preserve exhaustive coverage and the timeout while bounding each CI task.
  // Each usage still schedules against the complete corpus.
  }, 30_000)

  it('validates source data and preserves generated IDs, content and membership order', () => {
    const data = { sets: sourceSets, words: sourceWords, learnContent: sourceLearnContent,
      themeWordbooks: sourceThemeWordbooks, themeWords: sourceThemeWords,
      comparisonWordbooks: sourceComparisonWordbooks, comparisonWords: sourceComparisonWords,
      comparisonPairs: sourceComparisonPairs } as VocabSource
    const original = JSON.stringify(data)
    expect(validateVocabSource(data)).toEqual([])
    expect(JSON.stringify(data)).toBe(original)
    expect(data.words).toEqual(allWords)
    expect(data.sets).toEqual(vocabularySets)
    expect(data.learnContent).toEqual(learnContent)
    const keys = allWords.filter((w) => w.setId.startsWith('jlpt-level-')).map((w) => `${w.japanese}|${w.reading}`)
    expect(keys.length).toBeGreaterThanOrEqual(100)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
