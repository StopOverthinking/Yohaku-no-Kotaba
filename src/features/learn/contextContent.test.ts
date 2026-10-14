import { describe, expect, it } from 'vitest'
import { learnContent } from '@/features/vocab/data/learnContent'
import { hintConfusions } from '@/features/vocab/data/hintConfusions'
import sourceHintConfusions from '@/features/vocab/editor-data/hintConfusions.json'
import semanticReview from '../../../content/learn/hint-semantic-review.json'
import { contextContentIssues, contextContentReady, contextWords } from './contextContent'
import { hintComparisonIssue, questionKanjiLeaks, isReviewedSense, validateLearnContent, validateHintConfusions } from './contentValidation'
import { similarHintWords } from './contextPresentation'

describe('published contextual corpus', () => {
  it('audits every card against the complete current-sense selection and fails closed on stale versions', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    const decisions = new Map(semanticReview.entries.map((entry) => [entry.senseId, entry]))
    expect(semanticReview.scope).toEqual({ words: contextWords.length, senses: learnContent.length })
    expect(decisions.size).toBe(learnContent.length)
    expect(semanticReview.entries.length).toBe(learnContent.length)
    expect(Object.keys(hintConfusions).length).toBe(learnContent.length)
    for (const sense of learnContent) {
      const word = words.get(sense.wordId)!
      const decision = decisions.get(sense.id)!
      expect(decision.senseVersion, sense.id).toBe(sense.version)
      expect(decision.wordId, sense.id).toBe(sense.wordId)
      expect(decision.meaning, sense.id).toBe(sense.meaning)
      expect(decision.reviewStatus, sense.id).toBe('reviewed')
      for (const example of sense.examples) {
        const comparisons = similarHintWords(sense, word, example)
        expect(comparisons, example.id).toEqual(decision.selected.map((entry) => entry.japanese))
        expect(comparisons.length, example.id).toBeLessThanOrEqual(2)
        expect(new Set(comparisons).size, example.id).toBe(comparisons.length)
        for (const label of comparisons) {
          expect(label.trim(), example.id).not.toBe('')
          expect([word.japanese, word.reading, example.answer, example.reading], example.id).not.toContain(label)
          expect(hintComparisonIssue(label, [word.japanese, word.reading, example.answer, example.reading]), example.id).toBeUndefined()
        }
        expect(hintConfusions[sense.id]?.senseVersion, sense.id).toBe(sense.version)
        const fallback = similarHintWords({ ...sense, version: sense.version + 1 }, word, example)
        expect(fallback, example.id).toEqual([])
      }
    }
  })

  it('uses Korean-sense friends and excludes acquaintances, opposites and different dictionary senses', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    expect(hintConfusions).toEqual(sourceHintConfusions)
    expect(validateHintConfusions(hintConfusions, learnContent, words)).toEqual([])
    const friends = learnContent.filter((sense) => words.get(sense.wordId)!.japanese === '友達')
    expect(friends.length).toBeGreaterThan(0)
    for (const sense of friends) {
      const comparisons = similarHintWords(sense, words.get(sense.wordId)!, sense.examples[0])
      expect(comparisons).toContain('友人')
      expect(comparisons).not.toContain('知り合い')
      expect(comparisons).not.toContain('相手')
    }
    for (const [japanese, excluded] of [['売る', '買う'], ['寒い', '冷淡'], ['見る', '会う']]) {
      for (const sense of learnContent.filter((sense) => words.get(sense.wordId)!.japanese === japanese)) {
        expect(similarHintWords(sense, words.get(sense.wordId)!, sense.examples[0])).not.toContain(excluded)
      }
    }
  })

  it('separates asking from hearing and removes exact homographs', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    const asking = learnContent.find((sense) => sense.id === 'sense-AbsoluteVerb_31-2')!
    const hearing = learnContent.find((sense) => sense.id === 'sense-AbsoluteVerb_31-1')!
    expect(similarHintWords(asking, words.get(asking.wordId)!, asking.examples[0])).toContain('尋ねる')
    expect(similarHintWords(hearing, words.get(hearing.wordId)!, hearing.examples[0])).not.toContain('尋ねる')
    for (const [id, label] of [
      ['sense-AbsoluteVerb_397-1', '止める（とめる）'],
      ['sense-AbsoluteVerb_575-1', '開ける（あける）'],
      ['sense-lex-jmdict-1198900-1', '解く（とく）'],
    ]) {
      const sense = learnContent.find((sense) => sense.id === id)!
      expect(similarHintWords(sense, words.get(sense.wordId)!, sense.examples[0])).not.toContain(label)
    }
  })

  it('keeps every selected comparison tied to explicit meaning and evidence', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    for (const decision of semanticReview.entries) {
      expect(decision.reason.trim(), decision.senseId).not.toBe('')
      for (const selected of decision.selected) {
        expect(selected.meaning.trim(), decision.senseId).not.toBe('')
        expect(selected.difference.trim(), decision.senseId).not.toBe('')
        expect(['corpus', 'dictionary'], decision.senseId).toContain(selected.evidence.type)
      }
      const sense = learnContent.find((sense) => sense.id === decision.senseId)!
      expect(similarHintWords(sense, words.get(sense.wordId)!, sense.examples[0])).toEqual(decision.selected.map((entry) => entry.japanese))
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
    ]) expect(validateHintConfusions({ [sense.id]: entry }, learnContent, words)).not.toEqual([])
    expect(validateHintConfusions({ [sense.id]: { senseVersion: sense.version, words: [] } }, learnContent, words)).toEqual([])
    const target = { ...sense, wordId: 'target', examples: [{ ...sense.examples[0], answer: '当たった', reading: 'あたった' }] }
    const targetWords = new Map([['target', { japanese: '当たる', reading: 'あたる' }]])
    expect(validateHintConfusions({ [sense.id]: { senseVersion: sense.version, words: ['当たらせる'] } }, [target], targetWords)).not.toEqual([])
    expect(validateHintConfusions({ [sense.id]: { senseVersion: sense.version, words: ['当てる'] } }, [target], targetWords)).toEqual([])
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
        const targetKanji = new Set((example.answer + words.get(sense.wordId)!.japanese).normalize('NFKC').match(/\p{Script=Han}/gu) ?? [])
        expect([...surrounding.normalize('NFKC')].filter((char) => targetKanji.has(char)), example.id).toEqual([])
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

  it('rejects repeated question kanji, including compounds and a kana answer with a kanji headword', () => {
    const sense = learnContent[0]
    for (const [headword, before, answer] of [
      ['歌う', '古い歌を', '歌っている'],
      ['留学する', '奨学金をもらって', '留学した'],
      ['気障', '悪気はないが、', 'きざ'],
    ]) {
      const example = { ...sense.examples[0], before, answer, after: '。' }
      const target = { ...sense, examples: [example] }
      expect(validateLearnContent([target], new Set([sense.wordId]), new Map([[sense.wordId, headword]])))
        .toContain(`${sense.id}/${example.id}: 주변 문장의 정답 한자 노출 (${questionKanjiLeaks(headword, example).join('、')})`)
    }
    expect(questionKanjiLeaks('歌う', { before: 'メロディーに合わせて', answer: '歌っている', after: '。' })).toEqual([])
  })
})
