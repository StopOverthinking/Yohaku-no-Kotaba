import { describe, expect, it } from 'vitest'
import { parseManuscript, applyReview, appendReviewedMembership, appendReviewedSources, validateLegacyMembership, hashContent, lexicalKey, validateExampleRevision, expandBatchReview, aliasCandidateMembers } from './jlpt-pilot.mjs'
import { buildReviewedAliases } from './jlpt-aliases.mjs'

const dictionary = [{ id: 'jmdict-1', spellings: ['学校'], readings: ['がっこう'], senses: [{ pos: ['noun'] }], proposedLevel: 'N5' }]
const draft = '@学校|がっこう|noun|학교|수업받는 곳이에요.|教室|교실은 학교 안의 방이다.\n家から《学校》まで十分です。|がっこう|집에서 《학교》까지 십 분이에요.|10\n日曜日は《学校》に行きません。|がっこう|일요일에는 《학교》에 가지 않아요.|12\nあの建物が《学校》です。|がっこう|저 건물이 《학교》예요.|11'
describe('editorial publication boundary', () => {
  it('publishes only the separately approved representative of a fully reviewed active duplicate group', () => {
    const entry = parseManuscript(draft, 'N5', dictionary)[0]
    const word = entry.word, alias = { ...word, id: 'old-alias' }
    const sense = { ...entry.sense, review: { word: true, contrast: true, diversity: true },
      examples: entry.sense.examples.map(e => ({ ...e, status: 'reviewed' })) }
    const aliasSense = { ...sense, id: 'alias-sense', wordId: alias.id,
      examples: sense.examples.map(e => ({ ...e, id: `alias-${e.id}` })) }
    const words = [word, alias], senses = [sense, aliasSense]
    const aliasReview = { representativeWordId: word.id, scope: 'same-lexeme-and-representative-usage-only',
      profileTransfer: 'equivalent-core-usage', outcome: 'accepted', model: 'gpt-6-astra', reasoningEffort: 'high',
      reviewedAt: '2026-09-30T06:00:00Z', notes: ['Same core usage'],
      members: words.map((w, i) => ({ wordId: w.id, senseId: senses[i].id, version: senses[i].version,
        sourceHash: hashContent({ word: w, senses: [senses[i]] }) })) }
    const groups = buildReviewedAliases([aliasReview], [word.id], words, senses)
    const reference = { wordId: word.id, level: 'N5', sourceHash: aliasReview.members[0].sourceHash,
      aliasGroupId: groups[0].id, scope: 'legacy-reference-publication', outcome: 'accepted',
      model: 'gpt-6-astra', reasoningEffort: 'high', reviewedAt: aliasReview.reviewedAt, notes: ['Level representative independently approved'] }
    expect(validateLegacyMembership([reference], words, senses, words, groups)).toHaveLength(1)
    expect(() => validateLegacyMembership([reference], words, senses, words)).toThrow('alias group')
    expect(() => validateLegacyMembership([{ ...reference, aliasGroupId: undefined }], words, senses, words, groups)).toThrow('alias group')
    expect(() => validateLegacyMembership([{ ...reference, wordId: alias.id, sourceHash: aliasReview.members[1].sourceHash }], words, senses, words, groups)).toThrow('alias group')
    expect(() => validateLegacyMembership([reference], [...words, { ...word, id: 'unreviewed-third' }], senses, words, groups)).toThrow('alias group')
    expect(() => buildReviewedAliases([aliasReview], [word.id], [word, { ...alias, meaning: 'changed' }], senses)).toThrow('source changed')
  })
  it('holds both endpoints of aliases declared in another classification batch', () => {
    expect([...aliasCandidateMembers([
      { wordId: 'earlier', aliasCandidateIds: [] },
      { wordId: 'later', aliasCandidateIds: ['earlier'] },
      { wordId: 'unique', aliasCandidateIds: [] },
    ])].sort()).toEqual(['earlier', 'later'])
  })
  it('requires a current explicit review to reference unique legacy content and holds aliases', () => {
    const entry = parseManuscript(draft, 'N5', dictionary)[0]
    const word = entry.word
    const sense = { ...entry.sense, review: { word: true, contrast: true, diversity: true },
      examples: entry.sense.examples.map((example) => ({ ...example, status: 'reviewed' })) }
    const review = { wordId: word.id, level: 'N5', sourceHash: hashContent({ word, senses: [sense] }),
      scope: 'legacy-reference-publication', outcome: 'accepted', model: 'gpt-6-astra', reasoningEffort: 'high',
      reviewedAt: '2026-09-30T00:00:00.000Z', notes: ['All current content and recommended level reviewed for ID-preserving reference.'] }
    expect(validateLegacyMembership([review], [word], [sense], [word])).toEqual([{ id: word.id, level: 'N5', sourceHash: review.sourceHash }])
    expect(() => validateLegacyMembership([{ ...review, scope: 'legacy-classification-proposal-only' }], [word], [sense], [word])).toThrow('explicit reference approval')
    expect(() => validateLegacyMembership([review], [word], [{ ...sense, meaning: 'changed' }], [word])).toThrow('source changed')
    expect(() => validateLegacyMembership([review], [word, { ...word, id: 'alias' }], [sense], [word])).toThrow('alias group')
    expect(() => validateLegacyMembership([review, review], [word], [sense], [word])).toThrow('invalid legacy')
    expect(() => validateLegacyMembership([review], [word], [sense], [])).toThrow('invalid legacy')
  })
  it('preserves interleaved legacy references when the next authored batch arrives', () => {
    const prior = ['a', 'b', 'c'], refs = ['legacy-1', 'legacy-2']
    const order = ['a', 'b', 'legacy-1', 'c', 'legacy-2']
    expect(appendReviewedSources(order, prior, [...prior, 'd'], refs, order)).toEqual([...order, 'd'])
    expect(appendReviewedSources(['a'], ['a'], ['a', 'b'])).toEqual(['a', 'b'])
    expect(() => appendReviewedSources([...order].reverse(), prior, [...prior, 'd'], refs, order)).toThrow('changed membership')
    expect(() => appendReviewedSources(order, prior, [...prior, 'd'], refs, [...order, 'unapproved'])).toThrow('approved sources')
    expect(() => appendReviewedSources(order, prior, [...prior, 'legacy-1'], refs, order)).toThrow('duplicate')
    expect(() => appendReviewedSources(order, prior, [...prior, 'd'], ['legacy-2', 'legacy-1'], order)).toThrow('approved sources')
  })
  it('binds compact reviews to exact source while retaining the legacy format', () => {
    const vocabulary = [{ dictionaryId: 'jmdict-1' }]
    const record = { schemaVersion: 2, sourceHash: hashContent({ vocabulary, manuscript: draft }), review: { outcome: 'accepted' }, entries: [['lex-jmdict-1', 'hash']] }
    const rows = expandBatchReview(record, vocabulary, draft)
    expect(rows).toEqual([{ wordId: 'lex-jmdict-1', contentHash: 'hash', outcome: 'accepted' }])
    expect(expandBatchReview(rows, vocabulary, draft)).toBe(rows)
    expect(() => expandBatchReview(record, vocabulary, draft + '\n')).toThrow('changed')
    expect(() => expandBatchReview(record, [], draft)).toThrow('changed')
  })
  it('accepts one representative example, calculates its difficulty, and rejects an empty sense', () => {
    const one = draft.split('\n').slice(0, 2).join('\n')
    const entry = parseManuscript(one, 'N5', dictionary)[0]
    expect(entry.sense.examples).toHaveLength(1)
    expect(entry.word.difficulty).toBe(10)
    expect(() => parseManuscript(draft.split('\n')[0], 'N5', dictionary)).toThrow('at least one')
    expect(parseManuscript(draft, 'N5', dictionary)[0].word.difficulty).toBe(11)
  })
  it('does not count a na-adjective copula variant as a new lexical item', () => {
    const stem = { japanese: '大切', reading: 'たいせつ', type: 'na_adj' }
    expect(lexicalKey({ ...stem, japanese: '大切だ', reading: 'たいせつだ' })).toBe(lexicalKey(stem))
    expect(lexicalKey({ japanese: '枝', reading: 'えだ', type: 'noun' })).toBe('枝|えだ')
    expect(lexicalKey({ japanese: 'だ', reading: 'だ', type: 'expression' })).toBe('だ|だ')
  })
  it('accepts dictionary-backed irregular verbs but does not relabel suru nouns as verbs', () => {
    const manuscript = '@する|する|verb|하다|행동을 실행해요.|やる|행동 표현의 차이|jmdict-2\n家で宿題を《します》。|します|집에서 숙제를 《해요》.|10\n昨日は掃除を《しました》。|しました|어제는 청소를 《했어요》.|12\nここで何を《します》か。|します|여기서 무엇을 《해요》?|11'
    const candidate = { ...dictionary[0], id: 'jmdict-2', spellings: ['為る'], readings: ['する'], senses: [{ pos: ['suru verb - included'] }] }
    expect(parseManuscript(manuscript, 'N5', [candidate])[0].word.verbInfo).toBe('3')
    expect(() => parseManuscript(manuscript, 'N5', [{ ...candidate, senses: [{ pos: ['noun (common) (futsuumeishi)', 'noun or participle which takes the aux. verb suru'] }] }])).toThrow('group')
  })
  it('accepts reviewed example-only corrections while preserving sense identity and rejecting silent edits', () => {
    const entry = parseManuscript(draft, 'N5', dictionary)[0]
    const old = entry.sense
    const next = structuredClone(old)
    next.examples[0].before = '歩くと家から'
    next.examples[0].version++
    const published = hashContent({ word: entry.word, sense: old })
    expect(() => validateExampleRevision(entry.word, old, entry.word, next, published)).not.toThrow()
    expect(() => validateExampleRevision(entry.word, old, entry.word, next, 'stale')).toThrow('diverged')
    expect(() => validateExampleRevision(entry.word, old, entry.word, { ...next, meaning: '다른 의미' }, published)).toThrow('metadata')
    const noBump = structuredClone(next); noBump.examples[0].version--
    expect(() => validateExampleRevision(entry.word, old, entry.word, noBump, published)).toThrow('advance')
    const onlyBump = structuredClone(old); onlyBump.examples[0].version++
    expect(() => validateExampleRevision(entry.word, old, entry.word, onlyBump, published)).toThrow('correction')
    const reordered = structuredClone(next); reordered.examples.reverse()
    expect(() => validateExampleRevision(entry.word, old, entry.word, reordered, published)).toThrow('order')
  })
  it('binds new review hashes to explicit example revisions', () => {
    const original = parseManuscript(draft, 'N5', dictionary)[0]
    const id = original.sense.examples[0].id
    const revised = parseManuscript(draft, 'N5', dictionary, { [id]: 2 })[0]
    expect(revised.contentHash).not.toBe(original.contentHash)
    expect(revised.sense.version).toBe(original.sense.version)
    expect(revised.sense.examples.map((e) => e.version)).toEqual([2, 1, 1])
    expect(() => parseManuscript(draft, 'N5', dictionary, { [id]: 1.5 })).toThrow('revision')
  })
  it('appends a reviewed batch without overwriting editor membership or changing old order', () => {
    expect(appendReviewedMembership(['a'], ['a'], ['a', 'b'])).toEqual(['a', 'b'])
    expect(appendReviewedMembership(['a', 'b'], ['a', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
    expect(() => appendReviewedMembership(['a', 'custom'], ['a'], ['a', 'b'])).toThrow('changed membership')
    expect(() => appendReviewedMembership(['a', 'b'], ['a', 'b'], ['b', 'a', 'c'])).toThrow('append-only')
    expect(() => appendReviewedMembership(['a', 'b'], ['a', 'b'], ['a'])).toThrow('append-only')
    expect(() => appendReviewedMembership(['a'], ['a'], ['a', 'a'])).toThrow('duplicate')
  })
  it('keeps parsed content draft and rejects missing or stale review', () => {
    const entry = parseManuscript(draft, 'N5', dictionary)[0]
    expect(entry.sense.examples.every((e) => e.status === 'draft')).toBe(true)
    expect(() => applyReview(entry)).toThrow('review')
    expect(() => applyReview(entry, { contentHash: 'stale', outcome: 'accepted' })).toThrow('review')
    const review = { contentHash: entry.contentHash, outcome: 'accepted', method: 'editorial', reviewer: 'reviewer', reviewedAt: '2026-09-29', notes: ['checked'] }
    expect(applyReview(entry, review).examples.every((e) => e.status === 'reviewed')).toBe(true)
    const changed = parseManuscript(draft.replace('십 분', '열 분'), 'N5', dictionary)[0]
    expect(() => applyReview(changed, review)).toThrow('review')
  })
  it('rejects ambiguous dictionary senses and answer leakage', () => {
    expect(() => parseManuscript(draft, 'N5', [...dictionary, { ...dictionary[0], id: 'jmdict-2' }])).toThrow('disambiguation')
    expect(() => parseManuscript(draft.replace('家から', '学校から'), 'N5', dictionary)).toThrow('exposed')
    expect(() => parseManuscript(draft.replace('《学校》まで', '学校まで'), 'N5', dictionary)).toThrow('marked answer')
  })
  it('indexes kana forms and explicit homographs without duplicating one dictionary entry', () => {
    const entries = [{ ...dictionary[0], spellings: ['学校', '学校'], readings: ['がっこう', 'がっこう'] },
      { ...dictionary[0], id: 'jmdict-2' }]
    const explicit = draft.replace('|교실은 학교 안의 방이다.', '|교실은 학교 안의 방이다.|jmdict-1')
    expect(parseManuscript(explicit, 'N5', entries)[0].word.id).toBe('lex-jmdict-1')
    const kana = explicit.replace('@学校|', '@がっこう|')
    expect(parseManuscript(kana, 'N5', entries)[0].word.japanese).toBe('がっこう')
    expect(() => parseManuscript(explicit.replace('|jmdict-1', '|missing'), 'N5', entries)).toThrow('disambiguation')
  })
})
