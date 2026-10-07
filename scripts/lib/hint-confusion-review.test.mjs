// @vitest-environment node

import { test } from 'vitest'
import assert from 'node:assert/strict'
import { scanHintConfusions, meaningFragments } from './hint-confusion-scan.mjs'
import { buildHintConfusions } from './hint-confusion-review.mjs'

const fixture = () => {
  const words = [
    { id: 'a', japanese: '聞く', reading: 'きく', meaning: '듣다, 묻다', type: 'verb' },
    { id: 'b', japanese: '尋ねる', reading: 'たずねる', meaning: '묻다', type: 'verb' },
  ]
  const senses = [
    { id: 'hear', wordId: 'a', version: 1, meaning: '듣다', hint: '귀로 소리를 받아요', confusions: [], examples: [{ answer: '聞く', reading: 'きく' }] },
    { id: 'ask', wordId: 'a', version: 1, meaning: '묻다', hint: '질문해요', confusions: [], examples: [{ answer: '聞く', reading: 'きく' }] },
    { id: 'inquire', wordId: 'b', version: 1, meaning: '묻다', hint: '질문해요', confusions: [], examples: [{ answer: '尋ねる', reading: 'たずねる' }] },
  ]
  const scan = scanHintConfusions(words, senses, [])
  const review = { schemaVersion: 1, sourceHash: scan.sourceHash, scope: { words: 2, senses: 3 }, baseline: {},
    decisions: { 'ko:묻다': { status: 'accept', excludeIds: ['hear'], reason: '현재 묻는 용법만 연결' } },
    previousGroups: Object.fromEntries(scan.groups.map((group) => [group.id, [...group.members]])) }
  return { words, senses, scan, review }
}

test('parenthetical objects are not split into independent definitions', () => {
  assert.deepEqual(meaningFragments('쓰다 (안경, 모자), 적다'), ['쓰다', '적다'])
})

test('accepted comparisons are bidirectional and scoped to the selected sense', () => {
  const { words, senses, scan, review } = fixture()
  const before = JSON.stringify({ words, senses })
  const result = buildHintConfusions(scan, review, words, senses)
  assert.deepEqual(result.supplements, {
    ask: { senseVersion: 1, words: ['尋ねる'] }, hear: { senseVersion: 1, words: [] }, inquire: { senseVersion: 1, words: ['聞く'] },
  })
  assert.equal(result.coverage.length, 3)
  assert.deepEqual(result.pending, [])
  assert.equal(JSON.stringify({ words, senses }), before)
})

test('pending decisions remain visible instead of being treated as rejected', () => {
  const { words, senses, scan, review } = fixture()
  delete review.decisions['ko:묻다']
  const result = buildHintConfusions(scan, review, words, senses)
  assert.deepEqual(result.pending, ['ko:묻다'])
  assert.ok(Object.values(result.supplements).every((entry) => entry.words.length === 0))
  assert.deepEqual(result.coverage[0].pendingGroups, ['ko:묻다'])
})

test('sense partitions distinguish different meanings of the same Japanese headword', () => {
  const { words, senses, scan, review } = fixture()
  review.decisions['ko:묻다'] = { status: 'accept', sensePartitions: [['ask', 'inquire']], reason: '질문 용법만 연결' }
  const result = buildHintConfusions(scan, review, words, senses)
  assert.deepEqual(result.supplements.hear.words, [])
  assert.deepEqual(result.supplements.ask.words, ['尋ねる'])
  review.decisions['ko:묻다'].sensePartitions.push(['missing'])
  assert.throws(() => buildHintConfusions(scan, review, words, senses))
})

test('changed source, changed group membership and invalid sense exclusions stop generation', () => {
  for (const corrupt of [
    (review) => { review.sourceHash = 'outdated' },
    (review) => { review.previousGroups['ko:묻다'].pop() },
    (review) => { review.decisions['ko:묻다'].excludeIds = ['missing'] },
  ]) {
    const { words, senses, scan, review } = fixture()
    corrupt(review)
    assert.throws(() => buildHintConfusions(scan, review, words, senses))
  }
})

test('unknown word selectors and conflicting partition types stop generation', () => {
  for (const corrupt of [
    (decision) => { decision.partitions = [['尋ねる', 'missing']] },
    (decision) => { decision.partitions = [['聞く', '尋ねる']]; decision.sensePartitions = [['ask', 'inquire']] },
  ]) {
    const { words, senses, scan, review } = fixture()
    corrupt(review.decisions['ko:묻다'])
    assert.throws(() => buildHintConfusions(scan, review, words, senses))
  }
})

test('reviewed same-kanji contrasts suppress every reading while preserving historical provenance', () => {
  const { words, senses, review } = fixture()
  words[0] = { ...words[0], japanese: '解く', reading: 'ほどく', meaning: '풀다' }
  words[1] = { ...words[1], japanese: '解く', reading: 'とく', meaning: '해결하다' }
  senses[0] = { ...senses[0], meaning: '풀다', confusions: [{ japanese: '解く' }], examples: [{ answer: '解く', reading: 'ほどく' }] }
  senses[1] = { ...senses[1], meaning: '풀다', confusions: [] }
  const scan = scanHintConfusions(words, senses, [])
  Object.assign(review, { sourceHash: scan.sourceHash, decisions: {}, baseline: { hear: { senseVersion: 1, words: ['解く（ほどく）'] } } })
  const result = buildHintConfusions(scan, review, words, senses)
  assert.deepEqual(result.supplements.hear.words, [])
  assert.ok(result.displayAudit.find((entry) => entry.senseId === 'hear').excluded.some((entry) => entry.label === '解く（とく）'))
  assert.equal(result.suppressed[0].word, '解く（ほどく）')
})

test('authored-only and reviewed candidates share the safety rule before the two-label cap', () => {
  const { words, senses, review } = fixture()
  words[0] = { ...words[0], japanese: '当たる', reading: 'あたる' }
  for (const sense of senses.filter((entry) => entry.wordId === 'a')) {
    sense.examples = [{ answer: '当たった', reading: 'あたった' }]
    sense.confusions = ['当てる', '当たらせる', '合う', 'ぶつかる'].map((japanese) => ({ japanese }))
  }
  const scan = scanHintConfusions(words, senses, [])
  Object.assign(review, { sourceHash: scan.sourceHash, decisions: {}, baseline: {
    ask: { senseVersion: 1, words: ['当てる'] },
  } })
  const result = buildHintConfusions(scan, review, words, senses)
  assert.deepEqual(result.supplements.hear.words, ['合う', 'ぶつかる'])
  assert.deepEqual(new Set(result.supplements.ask.words), new Set(['合う', 'ぶつかる']))
  assert.equal(result.displayAudit.length, senses.length)
})

test('na-adjective normalization does not strip the reading of 無駄', () => {
  const { words, senses } = fixture()
  words[0] = { ...words[0], japanese: '無駄', reading: 'むだ', type: 'na_adj' }
  const scan = scanHintConfusions(words, senses, [])
  assert.equal(scan.nodes[0].reading, 'むだ')
})

test('semantic exclusions cannot be reintroduced by another accepted meaning group', () => {
  const { words, senses, scan, review } = fixture()
  review.semanticChecks = { sourceHash: scan.sourceHash, allowedSupplementLabels: { hear: [] } }
  assert.doesNotThrow(() => buildHintConfusions(scan, review, words, senses))
  delete review.decisions['ko:묻다'].excludeIds
  assert.throws(() => buildHintConfusions(scan, review, words, senses), /Excluded meaning reintroduced/)
  review.semanticChecks.sourceHash = 'old'
  assert.throws(() => buildHintConfusions(scan, review, words, senses), /Semantic hint review is stale/)
})
