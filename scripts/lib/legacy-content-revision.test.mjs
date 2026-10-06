// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { hashContent } from './jlpt-pilot.mjs'
import { prepareLegacyContentRevision, applyLegacyContentRevision, validateLegacyContentJournals } from './legacy-content-revision.mjs'

const word = { id: 'old', japanese: '甘い', meaning: '달다' }
const example = { id: 'e1', version: 1, before: 'このケーキは', answer: '甘い', after: '。', status: 'reviewed' }
const sense = { id: 's1', wordId: 'old', version: 1, meaning: '단맛이 나다', hint: '설탕 같은 맛이에요.',
  review: { word: true, contrast: true, diversity: true }, examples: [example] }
const additional = { ...sense, id: 's2', meaning: '판단이 안이하다', examples: [{ ...example, id: 'e2', before: '見通しが' }] }
const before = { word, senses: [sense] }
const after = { word: { ...word, meaning: '달다·안이하다' }, senses: [{ ...sense, hint: '단맛을 나타내요.' }, additional] }
const proposal = JSON.parse(JSON.stringify({ wordId: word.id, before, after, sourceHash: hashContent(before), reason: 'Important distinct usage and equivalent hint correction' }))
const prepare = rows => prepareLegacyContentRevision('held-fix', rows ?? [proposal], [word], [sense], ['old'])
const approve = draft => ({ scope: 'legacy-content-revision', outcome: 'accepted', model: 'gpt-6-astra', reasoningEffort: 'high',
  reviewedAt: '2026-09-30T06:00:00Z', draftHash: hashContent(draft), notes: ['Reviewed full content'],
  preservedCoreUsages: draft.entries.map(entry => ({ wordId: entry.wordId, senseIds: entry.before.senses.map(s => s.id),
    decision: 'preserve-existing-core-usage', note: 'Old core taste usage preserved; separate judgment usage appended' })) })

describe('legacy core-preserving content revision', () => {
  it('keeps existing identities, versions, examples and global order while appending a distinct usage', () => {
    const draft = prepare(), untouched = { ...sense, id: 'another', wordId: 'other', examples: [{ ...example, id: 'another-example' }] }
    const next = applyLegacyContentRevision(draft, approve(draft), [word], [sense, untouched], ['old'])
    expect(next.senses.map(s => s.id)).toEqual(['s1', 'another', 's2'])
    expect(next.senses[0].version).toBe(sense.version)
    expect(next.senses[0].examples).toEqual(sense.examples)
    expect(next.senses[1]).toBe(untouched)
    expect(sense.hint).toBe('설탕 같은 맛이에요.')
  })
  it('rejects changed identities/versions and unreviewed additions', () => {
    const changed = structuredClone(proposal); changed.after.senses[0].version++
    expect(() => prepare([changed])).toThrow('identity/version')
    const unreviewed = structuredClone(proposal); unreviewed.after.senses[1].review.word = false
    expect(() => prepare([unreviewed])).toThrow('unreviewed')
    const renamed = structuredClone(proposal); renamed.after.word.japanese = '違う'
    expect(() => prepare([renamed])).toThrow('metadata')
    const removed = structuredClone(proposal); removed.after.senses = []
    expect(() => prepare([removed])).toThrow('preserved')
  })
  it('requires exact independent approval including each preserved core usage', () => {
    const draft = prepare(), review = approve(draft)
    expect(() => applyLegacyContentRevision(draft, { ...review, draftHash: 'stale' }, [word], [sense], ['old'])).toThrow('approval')
    expect(() => applyLegacyContentRevision(draft, { ...review, preservedCoreUsages: [] }, [word], [sense], ['old'])).toThrow('membership')
    const invalid = { ...review, preservedCoreUsages: [{ ...review.preservedCoreUsages[0], decision: 'broader-meaning' }] }
    expect(() => applyLegacyContentRevision(draft, invalid, [word], [sense], ['old'])).toThrow('judgment')
    expect(() => applyLegacyContentRevision(draft, review, [word], [sense], ['old'], ['old'])).toThrow('protected')
  })
  it('recovers only a journaled partial write and rejects unrelated concurrent changes', () => {
    const draft = prepare(), review = approve(draft)
    expect(() => applyLegacyContentRevision(draft, review, [after.word], [sense], ['old'])).toThrow('source changed')
    const next = applyLegacyContentRevision(draft, review, [after.word], [sense], ['old'], [], true)
    expect(next.words).toEqual([after.word]); expect(next.senses).toEqual(after.senses)
    expect(applyLegacyContentRevision(draft, review, next.words, next.senses, ['old'], [], true)).toEqual(next)
    expect(() => applyLegacyContentRevision(draft, review, [word], [{ ...sense, hint: 'unrelated' }], ['old'], [], true)).toThrow('source changed')
  })
  it('rejects global ID collisions and skipped example versions', () => {
    const draft = prepare(), review = approve(draft)
    const collision = { ...sense, id: 's2', wordId: 'other', examples: [] }
    expect(() => applyLegacyContentRevision(draft, review, [word], [sense, collision], ['old'])).toThrow('collision')
    const changed = structuredClone(proposal); changed.after.senses[0].examples[0].before = '違う';
    expect(() => prepare([changed])).toThrow('version increase')
    changed.after.senses[0].examples[0].version = 2
    expect(prepare([changed]).entries).toHaveLength(1)
  })
  it('does not accept incomplete writes as applied content', () => {
    const draft = prepare(), review = approve(draft), journal = { schemaVersion: 1, kind: 'authorized-core-preserving-content', draft, review }
    expect(() => validateLegacyContentJournals([journal], [after.word], [sense], ['old'])).toThrow('not fully applied')
    expect(validateLegacyContentJournals([journal], [after.word], after.senses, ['old'])).toEqual({ journals: 1, words: 1 })
    expect(() => validateLegacyContentJournals([journal, journal], [after.word], after.senses, ['old'])).toThrow('duplicate')
  })
})
