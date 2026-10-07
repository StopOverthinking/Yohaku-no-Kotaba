import { describe, expect, it } from 'vitest'
import { learnContent } from '@/features/vocab/data/learnContent'
import { hintConfusions } from '@/features/vocab/data/hintConfusions'
import sourceHintConfusions from '@/features/vocab/editor-data/hintConfusions.json'
import { contextContentIssues, contextContentReady, contextWords } from './contextContent'
import { hintComparisonIssue, questionKanjiLeaks, isReviewedSense, validateLearnContent, validateHintConfusions } from './contentValidation'
import { similarHintWords } from './contextPresentation'

describe('published contextual corpus', () => {
  it('audits every card and never reveals answer kanji in comparisons, including legacy fallback', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    for (const sense of learnContent) {
      const word = words.get(sense.wordId)!
      for (const example of sense.examples) {
        const comparisons = similarHintWords(sense, word, example)
        expect(comparisons.length, example.id).toBeLessThanOrEqual(2)
        expect(new Set(comparisons).size, example.id).toBe(comparisons.length)
        for (const label of comparisons) {
          expect(label.trim(), example.id).not.toBe('')
          expect([word.japanese, word.reading, example.answer, example.reading], example.id).not.toContain(label)
          const answerKanji = new Set((word.japanese + example.answer).normalize('NFKC').match(/\p{Script=Han}/gu) ?? [])
          expect([...label.normalize('NFKC')].some((char) => answerKanji.has(char)), example.id).toBe(false)
        }
        expect(hintConfusions[sense.id]?.senseVersion, sense.id).toBe(sense.version)
        const fallback = similarHintWords({ ...sense, version: sense.version + 1 }, word, example)
        for (const label of fallback) expect(hintComparisonIssue(label, [word.japanese, example.answer]), example.id).toBeUndefined()
      }
    }
  })

  it('shows the requested overlapping expressions without changing authored senses', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    expect(hintConfusions).toEqual(sourceHintConfusions)
    expect(validateHintConfusions(hintConfusions, learnContent, words)).toEqual([])
    for (const [id, expected] of [
      ['sense-handmade_87-1', '重要だ'],
      ['sense-lex-jmdict-1414340-1', '重要'],
      ['sense-lex-jmdict-1413940-1', '貴重'],
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
        .toEqual(sense.confusions.map((confusion) => confusion.japanese).filter((label) =>
          !hintComparisonIssue(label, [word.japanese, word.reading, ...sense.examples.flatMap((e) => [e.answer, e.reading])])).slice(0, 2))
    }
  })

  it('separates asking from hearing and removes homographs and transitive/intransitive answer clues', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    const asking = learnContent.find((sense) => sense.id === 'sense-AbsoluteVerb_31-2')!
    const hearing = learnContent.find((sense) => sense.id === 'sense-AbsoluteVerb_31-1')!
    expect(similarHintWords(asking, words.get(asking.wordId)!, asking.examples[0])).toEqual(['尋ねる', '問う'])
    expect(similarHintWords(hearing, words.get(hearing.wordId)!, hearing.examples[0])).not.toContain('尋ねる')
    for (const [id, label] of [
      ['sense-AbsoluteVerb_397-1', '止める（とめる）'],
      ['sense-AbsoluteVerb_575-1', '開ける（あける）'],
      ['sense-lex-jmdict-1198900-1', '解く（とく）'],
      ['sense-JLPTN3_3-1', '当てる'],
      ['sense-AbsoluteVerb_578-1', '当てる'],
      ['sense-AbsoluteVerb_579-1', '当たる'],
    ]) {
      const sense = learnContent.find((sense) => sense.id === id)!
      expect(similarHintWords(sense, words.get(sense.wordId)!, sense.examples[0])).not.toContain(label)
    }
  })

  it('selects close everyday comparisons for formerly long lists', () => {
    const words = new Map(contextWords.map((word) => [word.id, word]))
    for (const [id, expected] of [
      ['sense-lex-jmdict-1281000-1', ['意見', '構想']],
      ['sense-lex-jmdict-1437450-1', ['いい加減', '丁寧']],
      ['sense-lex-jmdict-1343100-1', ['会場', '現地']],
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
    ]) expect(validateHintConfusions({ [sense.id]: entry }, learnContent, words)).not.toEqual([])
    expect(validateHintConfusions({ [sense.id]: { senseVersion: sense.version, words: [] } }, learnContent, words)).toEqual([])
    const target = { ...sense, wordId: 'target', examples: [{ ...sense.examples[0], answer: '当たった', reading: 'あたった' }] }
    const targetWords = new Map([['target', { japanese: '当たる', reading: 'あたる' }]])
    expect(validateHintConfusions({ [sense.id]: { senseVersion: sense.version, words: ['当てる'] } }, [target], targetWords)).not.toEqual([])
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
