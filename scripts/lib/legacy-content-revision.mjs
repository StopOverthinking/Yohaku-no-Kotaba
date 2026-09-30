import { hashContent } from './jlpt-pilot.mjs'

const same = (a, b) => hashContent(a) === hashContent(b)
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))
const reviewed = sense => sense.review?.word && sense.review?.contrast && sense.review?.diversity &&
  sense.examples?.length && sense.examples.every(example => example.status === 'reviewed')

function validateEntry(entry) {
  const { before, after, wordId } = entry
  if (!before?.word || !after?.word || before.word.id !== wordId || after.word.id !== wordId ||
      entry.sourceHash !== hashContent(before) || entry.afterHash !== hashContent(after) || same(before, after))
    throw new Error('Invalid revision content or hashes')
  // Identity, spelling, part of speech and ordering cannot silently change.
  if (!same(omit(before.word, ['meaning', 'verbInfo']), omit(after.word, ['meaning', 'verbInfo'])) ||
      !after.word.meaning?.trim() || (after.word.verbInfo && !/^[123](자|타|자타)$/.test(after.word.verbInfo)))
    throw new Error('Unsupported word metadata change')
  if (!Array.isArray(before.senses) || !before.senses.length || !Array.isArray(after.senses) ||
      after.senses.length < before.senses.length) throw new Error('Existing senses must be preserved')
  const senseIds = new Set(), exampleIds = new Set()
  after.senses.forEach((sense, index) => {
    if (sense.wordId !== wordId || senseIds.has(sense.id) || !reviewed(sense)) throw new Error('Invalid or unreviewed sense')
    senseIds.add(sense.id)
    for (const example of sense.examples) {
      if (exampleIds.has(example.id)) throw new Error('Duplicate example ID')
      exampleIds.add(example.id)
    }
    const old = before.senses[index]
    if (!old) {
      if (sense.version !== 1 || sense.examples.some(example => example.version !== 1)) throw new Error('New senses start at version one')
      return
    }
    // Same core usage is an explicit editorial judgment in the final approval.
    // Existing profile identity/version and examples remain reusable.
    if (!same(omit(old, ['meaning', 'hint', 'confusions', 'review', 'examples']),
      omit(sense, ['meaning', 'hint', 'confusions', 'review', 'examples'])))
      throw new Error('Existing sense identity/version/order cannot change')
    if (old.examples.length !== sense.examples.length) throw new Error('Existing example membership cannot change')
    old.examples.forEach((example, i) => {
      const next = sense.examples[i]
      if (example.id !== next.id) throw new Error('Existing example ID/order cannot change')
      if (same(example, next)) return
      if (next.version !== example.version + 1 || same(omit(example, ['version']), omit(next, ['version'])))
        throw new Error('Corrected example needs content change and exactly one version increase')
    })
  })
}

export function prepareLegacyContentRevision(id, proposals, words, senses, baselineIds, protectedIds = []) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) || !Array.isArray(proposals)) throw new Error('Invalid revision proposals')
  const original = new Set(baselineIds), protectedWords = new Set(protectedIds), seen = new Set()
  const entries = []
  for (const proposal of proposals) {
    if (same(proposal.before, proposal.after)) continue
    const { wordId, before, after, sourceHash, reason } = proposal
    if (!original.has(wordId) || protectedWords.has(wordId) || seen.has(wordId)) throw new Error('Non-legacy, protected or duplicated target')
    seen.add(wordId)
    if (!same(before, { word: words.find(word => word.id === wordId), senses: senses.filter(sense => sense.wordId === wordId) }))
      throw new Error(`${wordId}: original changed`)
    const entry = { wordId, before, after, sourceHash, afterHash: hashContent(after), reason }
    validateEntry(entry)
    entries.push(entry)
  }
  if (!entries.length) throw new Error('No reviewed changes')
  return { schemaVersion: 1, id, scope: 'legacy-content-revision', entries }
}

export function validateLegacyContentRevision(draft, review, baselineIds, protectedIds = []) {
  if (draft?.schemaVersion !== 1 || draft.scope !== 'legacy-content-revision' ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(draft.id) || !Array.isArray(draft.entries) || !draft.entries.length)
    throw new Error('Invalid content revision draft')
  if (review?.scope !== draft.scope || review.outcome !== 'accepted' || review.model !== 'gpt-6-astra' ||
      review.reasoningEffort !== 'high' || !Number.isFinite(Date.parse(review.reviewedAt)) ||
      !review.notes?.length || review.draftHash !== hashContent(draft) || !Array.isArray(review.preservedCoreUsages))
    throw new Error('Current independent content revision approval required')
  const original = new Set(baselineIds), protectedWords = new Set(protectedIds), seen = new Set()
  const approved = new Map(review.preservedCoreUsages.map(row => [row.wordId, row]))
  if (approved.size !== review.preservedCoreUsages.length || approved.size !== draft.entries.length)
    throw new Error('Core usage approval membership mismatch')
  for (const entry of draft.entries) {
    if (!original.has(entry.wordId) || protectedWords.has(entry.wordId) || seen.has(entry.wordId))
      throw new Error('Non-legacy, protected or duplicated target')
    seen.add(entry.wordId)
    validateEntry(entry)
    const judgment = approved.get(entry.wordId)
    if (judgment?.decision !== 'preserve-existing-core-usage' || !judgment.note?.trim() ||
        !same(judgment.senseIds, entry.before.senses.map(sense => sense.id)))
      throw new Error(`${entry.wordId}: explicit unchanged core usage judgment required`)
  }
}

/** Resume a journaled two-file write without accepting unrelated partial edits. */
export function applyLegacyContentRevision(draft, review, words, senses, baselineIds, protectedIds = [], recovery = false) {
  validateLegacyContentRevision(draft, review, baselineIds, protectedIds)
  const entries = new Map(draft.entries.map(entry => [entry.wordId, entry]))
  const wordMap = new Map(words.map(word => [word.id, word]))
  const allSenseIds = new Map(senses.map(sense => [sense.id, sense.wordId]))
  const allExampleIds = new Map(senses.flatMap(sense => sense.examples.map(example => [example.id, sense.wordId])))
  for (const entry of draft.entries) {
    const word = wordMap.get(entry.wordId), content = senses.filter(sense => sense.wordId === entry.wordId)
    if (!(same(word, entry.before.word) || recovery && same(word, entry.after.word)) ||
        !(same(content, entry.before.senses) || recovery && same(content, entry.after.senses)))
      throw new Error(`${entry.wordId}: current source changed outside approved revision`)
    for (const sense of entry.after.senses) {
      if (allSenseIds.has(sense.id) && allSenseIds.get(sense.id) !== entry.wordId) throw new Error('Sense ID collision')
      for (const example of sense.examples) if (allExampleIds.has(example.id) && allExampleIds.get(example.id) !== entry.wordId)
        throw new Error('Example ID collision')
      allSenseIds.set(sense.id, entry.wordId)
      sense.examples.forEach(example => allExampleIds.set(example.id, entry.wordId))
    }
  }
  // Preserve the complete existing sense order. New senses are appended.
  const afterSenses = new Map(draft.entries.flatMap(entry => entry.after.senses.map(sense => [sense.id, sense])))
  const existingSenseIds = new Set(senses.map(sense => sense.id))
  return {
    words: words.map(word => entries.get(word.id)?.after.word ?? word),
    senses: [...senses.map(sense => afterSenses.get(sense.id) ?? sense),
      ...draft.entries.flatMap(entry => entry.after.senses.filter(sense => !existingSenseIds.has(sense.id)))],
  }
}

export function validateLegacyContentJournals(journals, words, senses, baselineIds) {
  const ids = new Set(), latest = new Map()
  for (const journal of [...journals].sort((a, b) => String(a.review?.reviewedAt).localeCompare(String(b.review?.reviewedAt)))) {
    if (journal.schemaVersion !== 1 || journal.kind !== 'authorized-core-preserving-content' || ids.has(journal.draft?.id))
      throw new Error('Invalid or duplicate content revision journal')
    const { draft, review } = journal
    validateLegacyContentRevision(draft, review, baselineIds)
    ids.add(draft.id)
    for (const entry of draft.entries) {
      const previous = latest.get(entry.wordId)
      if (previous && previous.afterHash !== entry.sourceHash) throw new Error('Broken content revision history')
      latest.set(entry.wordId, entry)
    }
  }
  for (const entry of latest.values()) if (!same(entry.after, {
    word: words.find(word => word.id === entry.wordId), senses: senses.filter(sense => sense.wordId === entry.wordId),
  })) throw new Error(`${entry.wordId}: content revision not fully applied or source changed`)
  return { journals: ids.size, words: latest.size }
}
