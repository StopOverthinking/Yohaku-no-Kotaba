import { hashContent, validateExampleRevision } from './jlpt-pilot.mjs'

/** Prepare full before/after content for review; this never grants approval. */
export function prepareLegacyExampleRevision(id, items, words, senses, baselineIds) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) || !Array.isArray(items) || !items.length)
    throw new Error('Revision ID and nonempty proposal items are required')
  const wordMap = new Map(words.map(word => [word.id, word]))
  const senseMap = new Map(senses.map(sense => [sense.id, sense]))
  const originals = new Set(baselineIds), changed = new Set(), entries = new Map()
  for (const item of items) {
    const word = wordMap.get(item.wordId), before = senseMap.get(item.senseId)
    const old = before?.examples.find(example => example.id === item.oldExample?.id)
    if (!word || !originals.has(word.id) || before?.wordId !== word.id || !old ||
        hashContent(old) !== hashContent(item.oldExample) || changed.has(old.id))
      throw new Error(`${item.wordId}: original example changed, missing, or repeated`)
    changed.add(old.id)
    if (!entries.has(before.id)) entries.set(before.id, {
      word, before, after: structuredClone(before), beforeHash: hashContent({ word, sense: before }),
    })
    const entry = entries.get(before.id)
    entry.after.examples[before.examples.findIndex(example => example.id === old.id)] = item.proposedExample
  }
  for (const entry of entries.values()) {
    validateExampleRevision(entry.word, entry.before, entry.word, entry.after, entry.beforeHash)
    if (entry.after.examples.some(example => example.status !== 'reviewed'))
      throw new Error('Proposed publication must have reviewed status after independent approval')
    entry.afterHash = hashContent({ word: entry.word, sense: entry.after })
  }
  return { schemaVersion: 1, id, scope: 'legacy-example-revision', entries: [...entries.values()] }
}

/** Fail closed for stale approvals, metadata changes, and dependent publication receipts. */
export function applyLegacyExampleRevision(draft, review, words, senses, baselineIds, protectedIds = []) {
  if (draft?.schemaVersion !== 1 || draft.scope !== 'legacy-example-revision' ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(draft.id) || !Array.isArray(draft.entries) || !draft.entries.length)
    throw new Error('Invalid legacy revision draft')
  if (review?.scope !== 'legacy-example-revision' || review.outcome !== 'accepted' ||
      review.model !== 'gpt-6-astra' || review.reasoningEffort !== 'high' ||
      !Number.isFinite(Date.parse(review.reviewedAt)) || !Array.isArray(review.notes) || !review.notes.length ||
      review.draftHash !== hashContent(draft))
    throw new Error('Current independent legacy example revision approval required')
  const originals = new Set(baselineIds), protectedWords = new Set(protectedIds)
  const wordMap = new Map(words.map(word => [word.id, word])), current = new Map(senses.map(sense => [sense.id, sense]))
  const changes = new Map()
  for (const entry of draft.entries) {
    const word = wordMap.get(entry.word?.id), sense = current.get(entry.before?.id)
    if (!word || !sense || !originals.has(word.id) || protectedWords.has(word.id) ||
        sense.wordId !== word.id || changes.has(sense.id))
      throw new Error('Missing, duplicate, non-legacy, or separately protected revision target')
    validateExampleRevision(entry.word, entry.before, entry.word, entry.after, entry.beforeHash)
    if (entry.afterHash !== hashContent({ word: entry.word, sense: entry.after }) ||
        hashContent(word) !== hashContent(entry.word) ||
        hashContent({ word, sense }) !== entry.beforeHash)
      throw new Error('Current source or approved result changed')
    if (entry.after.examples.some(example => example.status !== 'reviewed'))
      throw new Error('Unreviewed replacement example')
    changes.set(sense.id, entry.after)
  }
  return senses.map(sense => changes.get(sense.id) ?? sense)
}

/** Every authorized journal must lead to the current content, including chained corrections. */
export function validateLegacyRevisionJournals(journals, words, senses, baselineIds) {
  const ids = new Set(), latest = new Map()
  for (const journal of [...journals].sort((a, b) => String(a.review?.reviewedAt).localeCompare(String(b.review?.reviewedAt)))) {
    if (journal.schemaVersion !== 1 || journal.kind !== 'authorized-before-after-content' || ids.has(journal.draft?.id))
      throw new Error('Invalid or duplicate legacy revision journal')
    const { draft, review } = journal
    applyLegacyExampleRevision(draft, review, draft.entries.map(entry => entry.word),
      draft.entries.map(entry => entry.before), baselineIds)
    ids.add(draft.id)
    for (const entry of draft.entries) {
      const previous = latest.get(entry.before.id)
      if (previous && previous.afterHash !== entry.beforeHash) throw new Error('Broken legacy revision history')
      latest.set(entry.before.id, entry)
    }
  }
  const wordMap = new Map(words.map(word => [word.id, word])), senseMap = new Map(senses.map(sense => [sense.id, sense]))
  for (const entry of latest.values()) if (hashContent({ word: wordMap.get(entry.word.id), sense: senseMap.get(entry.after.id) }) !== entry.afterHash)
    throw new Error(`${entry.word.id}: legacy revision not applied or current content changed`)
  return { journals: ids.size, senses: latest.size }
}
