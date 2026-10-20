// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hashContent } from './jlpt-pilot.mjs'
import { restoreEditorialCorrections } from './editorial-corrections.mjs'

const word = { id: 'w', japanese: 'おいしい', reading: 'おいしい', meaning: '맛있다', sourceOrder: 1 }
const sense = { id: 's', wordId: 'w', version: 1, meaning: '맛있다', hint: '맛이 좋다',
  examples: [{ id: 'e', version: 1, answer: 'おいしくて', reading: 'おいしくて', before: '', after: '。' }] }
const nextWord = { ...word, japanese: '美味しい' }
const nextSense = { ...sense, examples: [{ ...sense.examples[0], version: 2, answer: '美味しくて' }] }
function journal(w = nextWord, s = nextSense) {
  const entries = [['word', word, w], ['sense', sense, s]].map(([kind, before, after]) =>
    ({ kind, before, after, beforeHash: hashContent(before), afterHash: hashContent(after), reason: '사용자 정정' }))
  return { schemaVersion: 1, scope: 'user-authorized-notation-reading-hint-correction', id: 'edit', authorization: '사용자 요청',
    review: { independent: false, outcome: 'accepted', reviewedBy: 'editorial review', reviewedAt: '2026-10-20T01:00:00Z' },
    entries, entriesHash: hashContent(entries) }
}
describe('editorial amendments preserve historical approvals', () => {
  it('restores historical snapshots only and keeps the live input unchanged', () => {
    const snapshot = structuredClone([nextWord, nextSense])
    const restored = restoreEditorialCorrections([nextWord], [nextSense], [journal()])
    expect(restored.words).toEqual([word]); expect(restored.senses).toEqual([sense])
    expect([nextWord, nextSense]).toEqual(snapshot)
  })
  it('rejects missing application, stale hashes, duplicate history and false independent approval', () => {
    expect(() => restoreEditorialCorrections([word], [sense], [journal()])).toThrow('not applied')
    for (const history of [[journal(), journal()], [{ ...journal(), entriesHash: 'old' }],
      [{ ...journal(), review: { ...journal().review, independent: true } }]])
      expect(() => restoreEditorialCorrections([nextWord], [nextSense], history)).toThrow()
  })
  it('rejects identity, meaning, membership, reading, order and skipped-version changes even with refreshed hashes', () => {
    for (const invalidWord of [{ ...nextWord, meaning: '유리하다' }, { ...nextWord, reading: 'うまい' }, { ...nextWord, sourceOrder: 2 }])
      expect(() => restoreEditorialCorrections([invalidWord], [nextSense], [journal(invalidWord)])).toThrow()
    for (const invalidSense of [{ ...nextSense, meaning: '유리하다' }, { ...nextSense, version: 2 },
      { ...nextSense, examples: [] }, { ...nextSense, examples: [{ ...nextSense.examples[0], version: 3 }] },
      { ...nextSense, examples: [{ ...nextSense.examples[0], id: 'other' }] }])
      expect(() => restoreEditorialCorrections([nextWord], [invalidSense], [journal(nextWord, invalidSense)])).toThrow()
  })
})
