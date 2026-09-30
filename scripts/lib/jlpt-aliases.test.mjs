import { test } from 'vitest'
import assert from 'node:assert/strict'
import { buildReviewedAliases } from './jlpt-aliases.mjs'
import { hashContent } from './jlpt-pilot.mjs'

const words = [{ id: 'a', meaning: 'same' }, { id: 'b', meaning: 'same' }]
const senses = words.map(w => ({ id: `sense-${w.id}`, wordId: w.id, version: 1 }))
const review = {
  representativeWordId: 'b', outcome: 'accepted', scope: 'same-lexeme-and-representative-usage-only',
  profileTransfer: 'equivalent-core-usage', model: 'gpt-6-astra', reasoningEffort: 'high',
  reviewedAt: '2026-09-30T00:00:00Z', notes: ['independent semantic review'],
  members: words.map((word, i) => ({ wordId: word.id, senseId: senses[i].id, version: 1,
    sourceHash: hashContent({ word, senses: [senses[i]] }) })),
}
const build = (reviews = [review], ids = ['b'], source = words) => buildReviewedAliases(reviews, ids, source, senses)
test('activates only explicitly reviewed equivalent usage with unchanged content', () => {
  assert.equal(build()[0].members.length, 2)
  assert.deepEqual(build([], []), [])
  assert.throws(() => build([{ ...review, profileTransfer: 'requires-further-sense-review' }]), /equivalent-usage/)
  assert.throws(() => build([{ ...review, members: undefined }]), /equivalent-usage/)
  assert.throws(() => build([]), /equivalent-usage/)
  assert.throws(() => build([review], ['b'], [{ ...words[0], meaning: 'broader' }, words[1]]), /source changed/)
})
test('rejects duplicate approvals, active IDs and overlapping member groups', () => {
  assert.throws(() => build([review, review]), /equivalent-usage/)
  assert.throws(() => build([review], ['b', 'b']), /equivalent-usage/)
  assert.throws(() => build([review, { ...review, representativeWordId: 'a' }], ['b', 'a']), /overlaps/)
})
