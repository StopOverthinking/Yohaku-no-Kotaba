import { describe, expect, it } from 'vitest'
import { learnContent } from '@/features/vocab/data/learnContent'
import { hintConfusions } from '@/features/vocab/data/hintConfusions'
import sourceHintConfusions from '@/features/vocab/editor-data/hintConfusions.json'
import { contextContentIssues, contextContentReady, contextWords } from './contextContent'
import { isReviewedSense, validateLearnContent, validateHintConfusions } from './contentValidation'
import { similarHintWords } from './contextPresentation'

describe('published contextual corpus', () => {
  it('provides a nonempty comparison on every authored card without repeating its answer or reading', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    for (const sense of learnContent) {
      const word = words.get(sense.wordId)!
      for (const example of sense.examples) {
        const comparisons = similarHintWords(sense, word, example)
        expect(comparisons.length, example.id).toBeGreaterThan(0)
        expect(comparisons.length, example.id).toBeLessThanOrEqual(2)
        expect(new Set(comparisons).size, example.id).toBe(comparisons.length)
        for (const label of comparisons) {
          expect(label.trim(), example.id).not.toBe('')
          expect([word.japanese, word.reading, example.answer, example.reading], example.id).not.toContain(label)
        }
      }
    }
  })

  it('shows the requested overlapping expressions without changing authored senses', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    expect(hintConfusions).toEqual(sourceHintConfusions)
    expect(validateHintConfusions(hintConfusions, learnContent, words)).toEqual([])
    for (const [id, expected] of [
      ['sense-handmade_87-1', '大事'],
      ['sense-lex-jmdict-1414340-1', '大事'],
      ['sense-lex-jmdict-1413940-1', '大切'],
      ['sense-lex-jmdict-1008450-1', 'それでは'],
    ]) {
      const sense = learnContent.find((sense) => sense.id === id)!
      const word = words.get(sense.wordId)!
      for (const example of sense.examples) {
        const comparisons = similarHintWords(sense, word, example)
        expect(comparisons).toContain(expected)
      }
      // A later sense revision cannot accidentally inherit old display overrides.
      if (hintConfusions[id]) expect(similarHintWords({ ...sense, version: sense.version + 1 }, word, sense.examples[0]))
        .toEqual(sense.confusions.map((confusion) => confusion.japanese))
    }
  })

  it('separates asking from hearing and labels the other reading of a kanji homograph', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    const asking = learnContent.find((sense) => sense.id === 'sense-AbsoluteVerb_31-2')!
    const hearing = learnContent.find((sense) => sense.id === 'sense-AbsoluteVerb_31-1')!
    expect(similarHintWords(asking, words.get(asking.wordId)!, asking.examples[0])).toEqual(['尋ねる', '問う'])
    expect(similarHintWords(hearing, words.get(hearing.wordId)!, hearing.examples[0])).not.toContain('尋ねる')
    for (const [id, label] of [
      ['sense-AbsoluteVerb_397-1', '止める（とめる）'],
      ['sense-AbsoluteVerb_575-1', '開ける（あける）'],
      ['sense-lex-jmdict-1198900-1', '解く（とく）'],
    ]) {
      const sense = learnContent.find((sense) => sense.id === id)!
      expect(similarHintWords(sense, words.get(sense.wordId)!, sense.examples[0])).toContain(label)
    }
  })

  it('selects close everyday comparisons for formerly long lists', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    for (const [id, expected] of [
      ['sense-lex-jmdict-1281000-1', ['意見', '思考']],
      ['sense-lex-jmdict-1437450-1', ['適切', 'いい加減']],
      ['sense-lex-jmdict-1343100-1', ['場所', '箇所']],
    ] as const) {
      const sense = learnContent.find((sense) => sense.id === id)!
      expect(similarHintWords(sense, words.get(sense.wordId)!, sense.examples[0])).toEqual(expected)
    }
  })

  it('rejects stale comparisons, missing senses, duplicate words and answer headwords', () => {
    const sense = learnContent[0]
    const words = new Map(contextWords.map((word) => [word.id, word]))
    expect(validateHintConfusions({ missing: { senseVersion: 1, words: ['別'] } }, learnContent, words)).not.toEqual([])
    for (const entry of [
      { senseVersion: sense.version + 1, words: ['別'] },
      { senseVersion: sense.version, words: ['別', '別'] },
      { senseVersion: sense.version, words: ['別', '類似', '比較'] },
      { senseVersion: sense.version, words: [words.get(sense.wordId)!.japanese] },
      { senseVersion: sense.version, words: [] },
    ]) expect(validateHintConfusions({ [sense.id]: entry }, learnContent, words)).not.toEqual([])
  })

  it('requires an actual reviewed example even when editorial flags are complete', () => {
    const sense = learnContent[0]
    expect(isReviewedSense({ ...sense, examples: [] })).toBe(false)
    expect(isReviewedSense({ ...sense, examples: [{ ...sense.examples[0], status: 'draft' }] })).toBe(false)
    expect(isReviewedSense({ ...sense, examples: [sense.examples[0]] })).toBe(true)
  })
  it('covers every basic and theme word with a reviewed sense and at least one reviewed example', () => {
    expect(contextContentIssues).toEqual([])
    expect(contextContentIssues).toEqual(validateLearnContent(learnContent, new Set(contextWords.map((word) => word.id))))
    expect(contextContentReady).toBe(true)
    for (const word of contextWords) {
      const senses = learnContent.filter((sense) => sense.wordId === word.id && isReviewedSense(sense))
      expect(senses.length, word.id).toBeGreaterThanOrEqual(1)
      expect(
        senses.some((sense) => sense.examples.some((e) => e.status === 'reviewed')),
        word.id,
      ).toBe(true)
    }
  })

  it('keeps authored answers out of the surrounding question and hints', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    for (const sense of learnContent.filter(isReviewedSense)) {
      expect(sense.hint, sense.id).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u)
      for (const example of sense.examples.filter((e) => e.status === 'reviewed')) {
        const surrounding = example.before + example.after
        for (const target of [example.answer, words.get(sense.wordId)!.japanese].filter(
          (text) => text.length > 0,
        )) {
          expect(surrounding, example.id).not.toContain(target)
        }
        for (const reading of [example.reading, words.get(sense.wordId)!.reading].filter((text) => text.length >= 3)) {
          expect(surrounding, example.id).not.toContain(reading)
        }
      }
    }
  })
})
