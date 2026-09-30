import { describe, expect, it } from 'vitest'
import { learnContent } from '@/features/vocab/data/learnContent'
import { contextContentIssues, contextContentReady, contextWords } from './contextContent'
import { isReviewedSense, validateLearnContent } from './contentValidation'

describe('published contextual corpus', () => {
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
