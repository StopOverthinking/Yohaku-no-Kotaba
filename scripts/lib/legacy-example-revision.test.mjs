// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { hashContent } from './jlpt-pilot.mjs'
import { prepareLegacyExampleRevision, applyLegacyExampleRevision, validateLegacyRevisionJournals } from './legacy-example-revision.mjs'

const word = { id: 'old', japanese: '準備する', meaning: '준비하다' }
const example = { id: 'e1', version: 1, before: '明日の授業を', answer: '準備する', after: '。', status: 'reviewed' }
const sense = { id: 's1', wordId: 'old', version: 2, meaning: '준비하다', examples: [example] }
const another = { ...sense, id: 'untouched', wordId: 'other' }
const proposal = [{ wordId: 'old', senseId: 's1', oldExample: example, proposedExample: { ...example, version: 2, before: '会議の資料を' } }]
const prepare = items => prepareLegacyExampleRevision('scene-fix', items ?? proposal, [word], [sense], ['old'])
const approve = draft => ({ scope: 'legacy-example-revision', outcome: 'accepted', model: 'gpt-6-astra', reasoningEffort: 'high',
  reviewedAt: '2026-09-30T06:00:00Z', draftHash: hashContent(draft), notes: ['Independent full before/after example review'] })
describe('legacy example revision publication boundary', () => {
  it('preserves word/sense identity, other content and original evidence while changing only an approved example', () => {
    const draft = prepare(), before = structuredClone(sense)
    const next = applyLegacyExampleRevision(draft, approve(draft), [word], [sense, another], ['old'])
    expect(sense).toEqual(before)
    expect(next[0]).toMatchObject({ id: 's1', version: 2, examples: [{ id: 'e1', version: 2 }] })
    expect(next[1]).toBe(another)
    expect(draft.entries[0].before).toEqual(before)
  })
  it('refuses unreviewed, stale, edited and separately published targets', () => {
    const draft = prepare(), review = approve(draft)
    expect(() => applyLegacyExampleRevision(draft, null, [word], [sense], ['old'])).toThrow('approval')
    expect(() => applyLegacyExampleRevision(draft, { ...review, draftHash: 'old' }, [word], [sense], ['old'])).toThrow('approval')
    expect(() => applyLegacyExampleRevision(draft, review, [word], [{ ...sense, meaning: 'changed' }], ['old'])).toThrow('source')
    expect(() => applyLegacyExampleRevision(draft, review, [word], [sense], ['old'], ['old'])).toThrow('protected')
    expect(() => applyLegacyExampleRevision(draft, review, [word], [sense], [])).toThrow('non-legacy')
  })
  it('rejects version skips, stale proposals, duplicate edits and approved metadata changes', () => {
    expect(() => prepare([{ ...proposal[0], proposedExample: { ...example, version: 3 } }])).toThrow('exactly one')
    expect(() => prepare([{ ...proposal[0], oldExample: { ...example, after: 'changed' } }])).toThrow('original')
    expect(() => prepare([...proposal, ...proposal])).toThrow('repeated')
    const draft = prepare(); draft.entries[0].after.meaning = 'broader meaning'
    expect(() => applyLegacyExampleRevision(draft, approve(draft), [word], [sense], ['old'])).toThrow('metadata')
  })
  it('does not treat a write-ahead journal as proof that the revision actually reached the corpus', () => {
    const draft = prepare(), review = approve(draft)
    const journal = { schemaVersion: 1, kind: 'authorized-before-after-content', draft, review }
    expect(() => validateLegacyRevisionJournals([journal], [word], [sense], ['old'])).toThrow('not applied')
    expect(validateLegacyRevisionJournals([journal], [word], [draft.entries[0].after], ['old'])).toEqual({ journals: 1, senses: 1 })
    expect(() => validateLegacyRevisionJournals([journal, journal], [word], [draft.entries[0].after], ['old'])).toThrow('duplicate')
    const nextDraft = prepareLegacyExampleRevision('next-fix', [{ ...proposal[0], oldExample: draft.entries[0].after.examples[0],
      proposedExample: { ...example, before: '旅の荷物を', version: 3 } }], [word], [draft.entries[0].after], ['old'])
    const nextJournal = { ...journal, draft: nextDraft, review: { ...approve(nextDraft), reviewedAt: '2026-09-30T07:00:00Z' } }
    expect(validateLegacyRevisionJournals([nextJournal, journal], [word], [nextDraft.entries[0].after], ['old'])).toEqual({ journals: 2, senses: 1 })
  })
})
