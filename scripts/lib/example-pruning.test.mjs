// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { hashContent } from './jlpt-pilot.mjs'
import { verifyExamplePruning } from './example-pruning.mjs'

const word = { id: 'w', japanese: '学校' }
const example = id => ({ id, version: 1, status: 'reviewed', answer: '学校' })
const before = { id: 's', wordId: 'w', version: 1, meaning: '학교', examples: ['a', 'b', 'c'].map(example) }
function prune(source, keep, id = 'one') {
  const after = { ...source, examples: source.examples.filter(e => keep.includes(e.id)) }
  const entries = [{ senseId: source.id, wordHash: hashContent(word), beforeHash: hashContent(source),
    afterHash: hashContent(after), originalOrder: source.examples.map(e => e.id),
    removed: source.examples.filter(e => !keep.includes(e.id)).map(e => ({ example: e, replacementId: keep[0], reason: '같은 의미' })) }]
  return { after, journal: { schemaVersion: 1, id, scope: 'same-meaning-example-pruning', authorization: 'explicit user request',
    review: { method: 'semantic review', reviewedAt: '2026-10-02T01:00:00Z' }, entriesHash: hashContent(entries), entries } }
}
const check = (after, journals) => verifyExamplePruning([word], [after], journals)
describe('deletion-only example journal', () => {
  it('reconstructs the original reviewed content without putting retired sentences back into live data', () => {
    const { after, journal } = prune(before, ['a'])
    const result = check(after, [journal])
    expect(result.historicalSenses).toEqual([before])
    expect(result.retirements.map(row => [row.exampleId, row.replacementId])).toEqual([['b', 'a'], ['c', 'a']])
    expect(after.examples).toEqual([example('a')])
  })
  it('rejects removed survivors, edited text or meaning, changed words and resurrected examples', () => {
    const { after, journal } = prune(before, ['a'])
    for (const changed of [{ ...after, examples: [] }, { ...after, meaning: '다른 뜻' },
      { ...after, examples: [{ ...example('a'), answer: '別' }] }, before])
      expect(() => check(changed, [journal])).toThrow()
    expect(() => verifyExamplePruning([{ ...word, japanese: '別' }], [after], [journal])).toThrow()
  })
  it('rejects forged survivor content even if its current hash is refreshed', () => {
    const { after, journal } = prune(before, ['a'])
    const changed = { ...after, examples: [{ ...example('a'), answer: '別' }] }
    journal.entries[0].afterHash = hashContent(changed)
    journal.entriesHash = hashContent(journal.entries)
    expect(() => check(changed, [journal])).toThrow('retained content')
  })
  it('rejects reorder, empty survivors and mappings outside the surviving meaning group', () => {
    const reordered = prune(before, ['a', 'c'])
    reordered.after.examples.reverse()
    reordered.journal.entries[0].afterHash = hashContent(reordered.after)
    reordered.journal.entriesHash = hashContent(reordered.journal.entries)
    expect(() => check(reordered.after, [reordered.journal])).toThrow('reorder')
    const empty = prune(before, [])
    expect(() => check(empty.after, [empty.journal])).toThrow()
    const invalid = prune(before, ['a'])
    invalid.journal.entries[0].removed[0].replacementId = 'c'
    invalid.journal.entriesHash = hashContent(invalid.journal.entries)
    expect(() => check(invalid.after, [invalid.journal])).toThrow('replacement')
  })
  it('supports later retirements and resolves older saved cards to the final survivor', () => {
    const first = prune(before, ['a', 'b'])
    const second = prune(first.after, ['b'], 'two')
    const result = check(second.after, [first.journal, second.journal])
    expect(result.historicalSenses).toEqual([before])
    expect(result.retirements.find(row => row.exampleId === 'c')?.replacementId).toBe('b')
  })
  it('fails closed on missing journals and corrupt or duplicate journal records', () => {
    const { after, journal } = prune(before, ['a'])
    expect(() => check(after, [journal, journal])).toThrow()
    expect(() => check(after, [{ ...journal, entriesHash: 'stale' }])).toThrow()
    // Without a journal, historical auditors receive actual data and will detect the changed hash.
    expect(check(after, []).historicalSenses).toEqual([after])
  })
})
