// @vitest-environment node

import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import { hashContent } from './jlpt-pilot.mjs'
import { readReviewedExampleHistory, verifyReviewedExampleHistory } from './reviewed-example-history.mjs'

const word = { id: 'w', japanese: '正しい', reading: 'ただしい' }
const example = { id: 'e', version: 1, before: '', answer: '正しくない', after: '。', reading: 'ただしくない',
  translation: '옳지 않다.', translationTarget: '옳지 않다', status: 'reviewed', difficulty: 18 }
const before = { id: 's', wordId: 'w', version: 1, meaning: '옳다', examples: [example] }
const after = { ...before, examples: [{ ...example, version: 2, answer: '正しい', reading: 'ただしい',
  translation: '옳다.', translationTarget: '옳다' }] }
function correction(old = before, next = after, id = 'one') {
  const entries = [{ wordId: word.id, wordHash: hashContent(word), before: old, after: next,
    beforeHash: hashContent(old), afterHash: hashContent(next), reason: '목표 뜻의 긍정 용례' }]
  return { schemaVersion: 1, id, scope: 'user-authorized-example-polarity-correction', authorization: '사용자 정정 요청',
    review: { outcome: 'accepted', reviewedBy: 'editorial review', independent: false,
      reviewedAt: '2026-10-05T01:00:00Z', notes: ['목표 의미 유지'] }, entries, entriesHash: hashContent(entries) }
}
const check = (current, corrections, pruning = []) => verifyReviewedExampleHistory([word], [current], { corrections, pruning })

describe('user-authorized corrections after reviewed example pruning', () => {
  it('validates corrected text, restores only audit input, and does not mutate live data', () => {
    const snapshot = structuredClone(after)
    const result = check(after, [correction()])
    expect(result.historicalSenses).toEqual([before])
    expect(result.corrections.correctedExamples).toBe(1)
    expect(after).toEqual(snapshot)
  })
  it('rejects stale, missing, unapplied and duplicate correction evidence', () => {
    const journal = correction()
    expect(() => check(before, [journal])).toThrow('not applied')
    expect(() => check(after, [journal, journal])).toThrow()
    expect(() => check(after, [{ ...journal, entriesHash: 'stale' }])).toThrow()
    expect(check(after, []).historicalSenses).toEqual([after])
    expect(() => verifyReviewedExampleHistory([{ ...word, reading: 'べつ' }], [after],
      { corrections: [journal], pruning: [] })).toThrow()
  })
  it('rejects meaning, ID, order, difficulty, status and skipped-version changes even with refreshed hashes', () => {
    for (const changed of [
      { ...after, meaning: '다른 의미' }, { ...after, version: 2 },
      { ...after, examples: [] },
      ...[{ id: 'other' }, { version: 3 }, { difficulty: 30 }, { status: 'draft' },
        { translationTarget: '없는 문구' }].map(fields => ({ ...after, examples: [{ ...after.examples[0], ...fields }] })),
    ]) expect(() => check(changed, [correction(before, changed)])).toThrow()
  })
  it('does not label this editing review as independent approval', () => {
    const journal = correction()
    journal.review.independent = true
    expect(() => check(after, [journal])).toThrow()
  })
  it('supports chained example corrections and detects a broken chain', () => {
    const later = { ...after, examples: [{ ...after.examples[0], version: 3, before: 'これは' }] }
    expect(check(later, [correction(), correction(after, later, 'two')]).historicalSenses).toEqual([before])
    expect(() => check(later, [correction(), correction(before, later, 'two')])).toThrow()
  })
  it('preserves deletion evidence and resolves retired cards to the corrected survivor version', () => {
    const removed = { ...example, id: 'retired' }
    const original = { ...before, examples: [example, removed] }
    const entries = [{ senseId: 's', wordHash: hashContent(word), beforeHash: hashContent(original),
      afterHash: hashContent(before), originalOrder: ['e', 'retired'],
      removed: [{ example: removed, replacementId: 'e', reason: '같은 의미' }] }]
    const pruning = { schemaVersion: 1, id: 'prune', scope: 'same-meaning-example-pruning', authorization: '사용자 요청',
      review: { method: 'semantic review', reviewedAt: '2026-10-02T01:00:00Z' }, entries, entriesHash: hashContent(entries) }
    const result = check(after, [correction()], [pruning])
    expect(result.historicalSenses).toEqual([original])
    expect(result.beforeCorrections).toEqual([before])
    expect(result.retirements[0]).toMatchObject({ exampleId: 'retired', replacementId: 'e', replacementVersion: 2 })
    expect(after.examples).toHaveLength(1)
  })
  it('validates the 60 polarity and 235 kanji-clue corrections while retaining all historical receipts', async () => {
    const read = async file => JSON.parse(await fs.readFile(file, 'utf8'))
    const [words, senses, history] = await Promise.all([
      read('src/features/vocab/editor-data/vocabularyWords.json'),
      read('src/features/vocab/editor-data/learnContent.json'), readReviewedExampleHistory(process.cwd()),
    ])
    const result = verifyReviewedExampleHistory(words, senses, history)
    expect(result.corrections.correctedExamples).toBe(295)
    const kanji = history.corrections.find(journal => journal.scope === 'user-authorized-example-kanji-leakage-correction')
    expect(kanji.entries).toHaveLength(234)
    expect(kanji.entries.reduce((sum, entry) => sum + entry.after.examples.filter((example, i) =>
      hashContent(example) !== hashContent(entry.before.examples[i])).length, 0)).toBe(235)
    expect(senses.reduce((count, sense) => count + sense.examples.length, 0)).toBe(5874)
    const correct = senses.find(sense => sense.wordId === 'lex-jmdict-1376600').examples.find(e => e.id.endsWith('ex-3'))
    expect(correct).toMatchObject({ answer: '正しい', reading: 'ただしい', version: 2, translationTarget: '옳다' })
    for (const sense of senses) {
      const old = result.beforeCorrections.find(row => row.id === sense.id)
      expect({ ...sense, examples: [] }).toEqual({ ...old, examples: [] })
      expect(sense.examples.map(e => e.id)).toEqual(old.examples.map(e => e.id))
    }
    const intrinsic = senses.find(sense => sense.wordId === 'lex-jmdict-1348910').examples[0]
    expect(intrinsic).toMatchObject({ answer: '少ない', version: 1 })
  })

  it('requires the kanji-clue scope to remove a real clue without changing the answer or reading', () => {
    const old = { ...after, examples: [{ ...after.examples[0], before: '正解を選んだので、' }] }
    const next = { ...old, examples: [{ ...old.examples[0], before: '答えを選んだので、', version: 3 }] }
    const journal = { ...correction(old, next), scope: 'user-authorized-example-kanji-leakage-correction' }
    expect(check(next, [journal]).historicalSenses).toEqual([old])
    for (const fields of [{ before: '正解だったので、' }, { answer: '適切' }, { reading: 'べつ' }]) {
      const changed = { ...next, examples: [{ ...next.examples[0], ...fields }] }
      const invalid = { ...correction(old, changed), scope: journal.scope }
      expect(() => check(changed, [invalid])).toThrow('Kanji leakage correction')
    }
    const noClue = { ...old, examples: [{ ...old.examples[0], before: '答えを選んだので、' }] }
    const needless = { ...next, examples: [{ ...next.examples[0], before: '選んだ答えは、' }] }
    expect(() => check(needless, [{ ...correction(noClue, needless), scope: journal.scope }])).toThrow('Kanji leakage correction')
  })
})
