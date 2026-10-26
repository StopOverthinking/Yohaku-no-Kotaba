// @vitest-environment node
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { hintSourceHash } from './hint-confusion-scan.mjs'
import { buildSemanticHintConfusions, assertSemanticHintSynchronization, dictionaryEntryHash } from './hint-semantic-review.mjs'
import { hintComparisonIssue } from './hint-comparison-policy.mjs'

const fixture = () => {
  const words = [
    { id: 'friend', japanese: '友達', reading: 'ともだち', meaning: '친구', type: 'noun' },
    { id: 'sell', japanese: '売る', reading: 'うる', meaning: '팔다', type: 'verb' },
  ]
  const senses = words.map((word) => ({ id: word.id + '-sense', wordId: word.id, version: 1, meaning: word.meaning,
    confusions: [{ japanese: word.id === 'friend' ? '知り合い' : '買う' }], examples: [{ answer: word.japanese, reading: word.reading }] }))
  const candidates = [{ id: 'jmdict-1', japanese: '友人', spellings: ['友人'], readings: ['ゆうじん'], senses: [{ glosses: ['friend'] }] }]
  const review = { schemaVersion: 1, policy: 'current-korean-sense', sourceHash: hintSourceHash(words, senses),
    reviewer: { model: 'gpt-6-astra', reasoningEffort: 'high' }, scope: { words: 2, senses: 2 }, entries: senses.map((sense, index) => ({
      senseId: sense.id, senseVersion: sense.version, wordId: sense.wordId, japanese: words[index].japanese, meaning: sense.meaning,
      reviewStatus: 'reviewed', selected: index ? [] : [{ japanese: '友人', reading: 'ゆうじん', meaning: '친구', difference: '격식 있는 표현',
        evidence: { type: 'dictionary', entryId: 'jmdict-1', source: 'JMdict', entryHash: dictionaryEntryHash(candidates[0]), sourceGlosses: ['friend'] } }],
      decision: index ? 'omit' : 'replace', reason: index ? '현재 뜻이 같은 비교어 없음' : '친구 의미 비교',
      rejected: [{ japanese: index ? '買う' : '知り合い', reason: index ? '반의어' : '지인은 친구와 다름' }],
    })) }
  return { words, senses, candidates, review }
}
const build = ({ review, words, senses, candidates }) => buildSemanticHintConfusions(review, words, senses, candidates)

test('explicit current-sense review permits dictionary-only friends and omits unapproved historical contrasts', () => {
  const input = fixture(), before = JSON.stringify(input)
  const result = build(input)
  assert.deepEqual(result.supplements, { 'friend-sense': { senseVersion: 1, words: ['友人'] }, 'sell-sense': { senseVersion: 1, words: [] } })
  assert.equal(result.coverage.length, input.senses.length)
  assert.equal(result.provenance['friend-sense'][0].evidence.entryId, 'jmdict-1')
  assert.equal(JSON.stringify(input), before)
  assert.throws(() => assertSemanticHintSynchronization({ ...result.supplements,
    'sell-sense': { senseVersion: 1, words: ['買う'] } }, result.supplements), /not synchronized/)
})

test('missing, stale, duplicate and incomplete per-sense decisions block generation', () => {
  for (const corrupt of [
    (r) => { r.sourceHash = 'stale' }, (r) => { r.scope.senses = 1 },
    (r) => { r.entries.pop() }, (r) => { r.entries.push(r.entries[0]) },
    (r) => { r.entries[0].senseVersion++ }, (r) => { r.entries[0].meaning = '지인' },
    (r) => { r.entries[0].reviewStatus = 'draft' }, (r) => { r.entries[0].reason = '' },
    (r) => { r.entries[0].decision = 'omit' }, (r) => { r.entries[0].senseId = 'missing' },
    (r) => { r.entries[0].wordId = 'sell' }, (r) => { r.entries[0].japanese = '友人' },
    (r) => { r.entries[0].selected.push(r.entries[0].selected[0]) },
    (r) => { r.entries[0].selected.push({}, {}) },
    (r) => { r.entries[0].rejected.push({ japanese: '友人', reason: '선정과 중복' }) },
  ]) { const input = fixture(); corrupt(input.review); assert.throws(() => build(input)) }
})

test('evidence must resolve to the exact comparison and cannot silently accept an English-only candidate', () => {
  for (const corrupt of [
    (s) => { s.evidence.entryId = 'missing' }, (s) => { s.reading = 'ちじん' },
    (s) => { s.japanese = '知人' }, (s) => { s.difference = '' }, (s) => { s.meaning = '' },
    (s) => { s.evidence.source = '' }, (s) => { s.evidence = undefined },
    (s) => { s.evidence.entryHash = 'stale' }, (s) => { s.evidence.sourceGlosses = [] },
    (s) => { s.evidence.sourceGlosses = ['acquaintance'] },
    (s) => { s.japanese = '友人（ともだち）' },
    (s) => { s.evidence = { type: 'corpus', senseIds: ['missing'] } },
    (s) => { s.evidence = { type: 'corpus', senseIds: [] } },
    (s) => { s.evidence = { type: 'corpus', senseIds: ['sell-sense'] } },
  ]) { const input = fixture(); corrupt(input.review.entries[0].selected[0]); assert.throws(() => build(input)) }
})

test('a reviewed corpus comparison sharing kanji is allowed but identical answers and inflections are rejected', () => {
  const input = fixture()
  input.words[1] = { ...input.words[1], japanese: '友人', reading: 'ゆうじん', meaning: '친구', type: 'noun' }
  input.senses[1] = { ...input.senses[1], meaning: '친구', examples: [{ answer: '友人', reading: 'ゆうじん' }] }
  const entry = input.review.entries[1]
  Object.assign(entry, { japanese: '友人', meaning: '친구' })
  input.review.entries[0].selected[0].evidence = { type: 'corpus', senseIds: ['sell-sense'] }
  input.review.sourceHash = hintSourceHash(input.words, input.senses)
  assert.deepEqual(build(input).supplements['friend-sense'].words, ['友人'])
  input.review.entries[0].selected[0].meaning = '지인'
  assert.throws(() => build(input), /meaning does not match/)
  input.review.entries[0].selected[0].meaning = '친구'
  for (const [japanese, reading] of [['友達', 'ともだち'], ['友達（ともだち）', 'ともだち']]) {
    Object.assign(input.review.entries[0].selected[0], { japanese, reading })
    assert.throws(() => build(input), /Unsafe/)
  }
  const verb = fixture()
  Object.assign(verb.review.entries[1], { selected: [{ japanese: '売られる', reading: 'うられる', meaning: '팔리다',
    difference: '수동', evidence: { type: 'dictionary', entryId: 'missing', source: 'JMdict' } }], decision: 'replace' })
  assert.throws(() => build(verb), /simple answer inflection/)
})

test('same readings do not exclude distinct reviewed words with the same Korean sense', () => {
  const input = fixture()
  input.words[0] = { ...input.words[0], japanese: '測る', reading: 'はかる', meaning: '재다', type: 'verb' }
  input.words[1] = { ...input.words[1], japanese: '量る', reading: 'はかる', meaning: '재다', type: 'verb' }
  for (let i = 0; i < 2; i++) {
    input.senses[i].meaning = input.words[i].meaning
    input.senses[i].examples = [{ answer: input.words[i].japanese, reading: input.words[i].reading }]
    Object.assign(input.review.entries[i], { japanese: input.words[i].japanese, meaning: input.words[i].meaning })
  }
  input.review.entries[0].selected = [{ japanese: '量る', reading: 'はかる', meaning: '재다', difference: '무게나 부피를 재다',
    evidence: { type: 'corpus', senseIds: [input.senses[1].id] } }]
  input.review.sourceHash = hintSourceHash(input.words, input.senses)
  assert.deepEqual(build(input).supplements['friend-sense'].words, ['量る'])
})

test('current source changes invalidate review rather than silently inheriting a previous selection', () => {
  for (const change of [
    (input) => { input.senses[0].confusions.push({ japanese: '相手' }) },
    (input) => { input.senses[0].examples[0].answer = '友達だった' },
    (input) => { input.words.reverse() },
  ]) { const input = fixture(); change(input); assert.throws(() => build(input), /current corpus/) }
})

test('dictionary meaning changes invalidate external evidence even when spelling and reading are unchanged', () => {
  const input = fixture()
  input.candidates[0].senses[0].glosses = ['acquaintance']
  assert.throws(() => build(input), /dictionary meaning snapshot/)
})

test('dictionary suru forms require an explicit decision and a matching suru sense snapshot', () => {
  const input = fixture()
  input.candidates[0] = { id: 'jmdict-1', japanese: '購入', spellings: ['購入'], readings: ['こうにゅう'],
    senses: [{ pos: ['noun or participle which takes the aux. verb suru'], glosses: ['buying'] }] }
  const selected = input.review.entries[0].selected[0]
  Object.assign(selected, { japanese: '購入する', reading: 'こうにゅうする', meaning: '구입하다' })
  Object.assign(selected.evidence, { entryHash: dictionaryEntryHash(input.candidates[0]), sourceGlosses: ['buying'], derivation: 'suru-verb' })
  assert.deepEqual(build(input).supplements['friend-sense'].words, ['購入する'])
  delete selected.evidence.derivation
  assert.throws(() => build(input), /Invalid dictionary/)
  selected.evidence.derivation = 'suru-verb'
  input.candidates[0].senses[0].pos = ['noun']
  selected.evidence.entryHash = dictionaryEntryHash(input.candidates[0])
  assert.throws(() => build(input), /dictionary meaning snapshot/)
})

test('answer continuous, negative and causative forms are not separate comparisons', () => {
  for (const label of ['売っている', '売らなかった', '売らせる', '売られる'])
    assert.equal(hintComparisonIssue(label, ['売る', 'うる']), 'simple answer inflection')
  for (const label of ['食べている', '食べられる', '食べなかった'])
    assert.equal(hintComparisonIssue(label, ['食べる', 'たべる']), 'simple answer inflection')
  assert.equal(hintComparisonIssue('友人', ['友達', 'ともだち']), undefined)
  assert.equal(hintComparisonIssue('当てる', ['当たる', 'あたる']), undefined)
  assert.equal(hintComparisonIssue('触れる', ['触る', 'さわる']), undefined)
  assert.equal(hintComparisonIssue('勉強する', ['勉強', 'べんきょう']), 'simple answer inflection')
  assert.equal(hintComparisonIssue('大切だ', ['大切', 'たいせつ']), 'simple answer inflection')
})

test('reviewed na-adverbs require the exact dictionary form, reading and adjectival-noun sense', () => {
  const input = fixture()
  input.candidates[0] = { id: 'jmdict-1', japanese: '熱烈', spellings: ['熱烈'], readings: ['ねつれつ'],
    senses: [{ pos: ['adjectival nouns or quasi-adjectives (keiyodoshi)'], glosses: ['ardent'] }] }
  const selected = input.review.entries[0].selected[0]
  Object.assign(selected, { japanese: '熱烈に', reading: 'ねつれつに', meaning: '열렬히' })
  Object.assign(selected.evidence, { entryHash: dictionaryEntryHash(input.candidates[0]), sourceGlosses: ['ardent'], derivation: 'na-adverb' })
  assert.deepEqual(build(input).supplements['friend-sense'].words, ['熱烈に'])
  const before = structuredClone(input)
  for (const corrupt of [
    i => { delete i.review.entries[0].selected[0].evidence.derivation },
    i => { i.review.entries[0].selected[0].reading = 'ねつれつ' },
    i => { i.review.entries[0].selected[0].japanese = '熱烈な' },
    i => { i.candidates[0].senses[0].pos = ['noun']; i.review.entries[0].selected[0].evidence.entryHash = dictionaryEntryHash(i.candidates[0]) },
    i => { i.candidates[0].senses[0].glosses = ['unrelated'] },
  ]) { const changed = structuredClone(before); corrupt(changed); assert.throws(() => build(changed)) }
})

test('reviewed noun compounds pin components, joined forms and attested source text', () => {
  const input = fixture()
  for (const [index, japanese, reading, meaning] of [[0, '案内', 'あんない', '안내'], [1, '放送', 'ほうそう', '방송']]) {
    Object.assign(input.words[index], { japanese, reading, meaning, type: 'noun' })
    Object.assign(input.senses[index], { meaning, examples: [{ answer: japanese, reading }] })
    Object.assign(input.review.entries[index], { japanese, meaning })
  }
  input.review.sourceHash = hintSourceHash(input.words, input.senses)
  const selected = input.review.entries[0].selected[0], sourceText = '駅案内放送の内容が画面に表示されるサービスです。'
  Object.assign(selected, { japanese: '案内放送', reading: 'あんないほうそう', meaning: '안내 방송',
    evidence: { type: 'corpus-compound', parts: input.senses.map((sense, index) => ({ senseId: sense.id,
      sourceHash: dictionaryEntryHash({ word: input.words[index], sense }) })),
      source: 'JR East announcement', sourceUrl: 'https://www.jreast.co.jp/press/2025/20250715_ho01.pdf',
      sourceText, sourceTextHash: dictionaryEntryHash(sourceText) } })
  assert.deepEqual(build(input).supplements['friend-sense'].words, ['案内放送'])
  for (const corrupt of [
    s => { s.evidence.parts[0].sourceHash = 'stale' }, s => { s.evidence.parts[0].senseId = 'missing' },
    s => { s.evidence.parts.reverse() }, s => { s.evidence.parts.pop() },
    s => { s.japanese = '案内会話' }, s => { s.reading = 'あんない' }, s => { s.meaning = '대화' },
    s => { s.evidence.sourceUrl = '' }, s => { s.evidence.source = '' },
    s => { s.evidence.sourceText += 'changed' },
    s => { s.evidence.sourceText = '別の言葉'; s.evidence.sourceTextHash = dictionaryEntryHash(s.evidence.sourceText) },
  ]) { const changed = structuredClone(input); corrupt(changed.review.entries[0].selected[0]); assert.throws(() => build(changed)) }
  input.words[1].type = 'verb'
  input.review.sourceHash = hintSourceHash(input.words, input.senses)
  selected.evidence.parts[1].sourceHash = dictionaryEntryHash({ word: input.words[1], sense: input.senses[1] })
  assert.throws(() => build(input), /compound component/)
})
