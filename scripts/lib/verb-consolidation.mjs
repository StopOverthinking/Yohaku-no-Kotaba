import { hashContent, lexicalKey } from './jlpt-pilot.mjs'

export const consolidationLevels = ['N5', 'N4', 'N3', 'N2', 'N1']
export const sourceContent = (word, senses) => ({ word, senses: senses.filter(sense => sense.wordId === word.id) })

// An explicit, user-requested membership migration. This neither creates a
// content approval nor impersonates the prior independent Astra reviewers.
export function validateVerbConsolidation(manifest, sets, words, senses, receipt, { before = false } = {}) {
  if (!manifest) {
    if (Object.values(receipt.byLevel).some(level => level.consolidationIds?.length)) throw new Error('Missing verb consolidation review')
    return null
  }
  if (manifest.schemaVersion !== 1 || manifest.scope !== 'user-authorized-verb-membership-consolidation' ||
      manifest.outcome !== 'accepted' || !manifest.authorization?.trim() || !manifest.reviewedBy?.trim() ||
      !Number.isFinite(Date.parse(manifest.reviewedAt)) || manifest.sourceBook.id !== 'AbsoluteVerb' ||
      !manifest.reviewNotes?.length) throw new Error('Invalid verb consolidation review')
  if (hashContent(words) !== manifest.originalWordsHash || hashContent(senses) !== manifest.originalSensesHash)
    throw new Error('Vocabulary or example content changed since membership-only review')
  const source = sets.find(set => set.id === manifest.sourceBook.id)
  if (!source || (!before && source.archived !== true)) throw new Error('Original verb book must be archived')
  const { archived, ...original } = source
  if (hashContent(original) !== hashContent(manifest.sourceBook)) throw new Error('Original verb membership changed')
  const wordMap = new Map(words.map(word => [word.id, word]))
  const entries = new Map(manifest.entries.map(entry => [entry.wordId, entry]))
  if (entries.size !== manifest.entries.length || entries.size !== source.wordIds.length || source.wordIds.some(id => !entries.has(id)))
    throw new Error('Verb consolidation must account for every original word')
  const additions = Object.fromEntries(consolidationLevels.map(level => [level, []]))
  const accountedIds = new Set()
  const keys = new Set()
  const beforeIds = new Set()
  for (const level of consolidationLevels) {
    const base = manifest.baseMembership.byLevel[level]
    if (!base || base.consolidationIds?.length) throw new Error('Invalid base consolidation membership')
    for (const id of base.wordIds) {
      const word = wordMap.get(id)
      if (!word || beforeIds.has(id) || keys.has(lexicalKey(word))) throw new Error('Invalid original level selection')
      beforeIds.add(id); keys.add(lexicalKey(word))
    }
  }
  for (const entry of manifest.entries) {
    const word = wordMap.get(entry.wordId)
    if (!word || word.setId !== source.id || hashContent(sourceContent(word, senses)) !== entry.sourceHash || !entry.reason?.trim())
      throw new Error(`${entry.wordId}: changed or unreviewed consolidation source`)
    if (entry.action === 'add') {
      if (!consolidationLevels.includes(entry.level) || !entry.levelRationale?.trim() ||
          beforeIds.has(word.id) || accountedIds.has(word.id) || keys.has(lexicalKey(word)))
        throw new Error(`${word.id}: duplicate or unclassified consolidation addition`)
      const content = sourceContent(word, senses).senses
      if (!content.length || content.some(sense => !sense.review.word || !sense.review.contrast || !sense.review.diversity ||
          !sense.examples.length || sense.examples.some(example => example.status !== 'reviewed')))
        throw new Error(`${word.id}: existing reviewed content required`)
      additions[entry.level].push(word.id); accountedIds.add(word.id); keys.add(lexicalKey(word))
    } else if (entry.action !== 'already-covered') throw new Error(`${word.id}: invalid consolidation decision`)
  }
  for (const entry of manifest.entries.filter(entry => entry.action === 'already-covered')) {
    const target = wordMap.get(entry.targetWordId)
    if (!target || (!beforeIds.has(target.id) && !accountedIds.has(target.id)) ||
        hashContent(sourceContent(target, senses)) !== entry.targetHash || !entry.matchType?.trim())
      throw new Error(`${entry.wordId}: duplicate target missing or changed`)
    if (entry.matchType === 'exact-lexical-key' && lexicalKey(wordMap.get(entry.wordId)) !== lexicalKey(target))
      throw new Error(`${entry.wordId}: false exact duplicate`)
  }
  for (const level of consolidationLevels) {
    // The migration's suffix is independent of the book's original arrangement.
    additions[level].sort((a, b) => wordMap.get(a).reading.localeCompare(wordMap.get(b).reading, 'ja') || a.localeCompare(b))
    const base = manifest.baseMembership.byLevel[level]
    const expected = [...base.wordIds, ...additions[level]]
    const book = sets.find(set => set.id === `jlpt-level-${level.toLowerCase()}`)
    const current = receipt.byLevel[level]
    if (!book || !current || hashContent(book.wordIds) !== hashContent(before ? base.wordIds : expected) ||
        hashContent(current.wordIds) !== hashContent(book.wordIds) || hashContent(current.referenceIds) !== hashContent(base.referenceIds) ||
        (!before && hashContent(current.consolidationIds) !== hashContent(additions[level])))
      throw new Error(`${level}: consolidation membership changed, reordered or incomplete`)
  }
  const baseByLevel = Object.fromEntries(consolidationLevels.map(level => [level, manifest.baseMembership.byLevel[level].wordIds.length]))
  const addedByLevel = Object.fromEntries(consolidationLevels.map(level => [level, additions[level].length]))
  if (hashContent(addedByLevel) !== hashContent(manifest.addedByLevel)) throw new Error('Consolidation level counts changed')
  return { additions, baseByLevel, addedByLevel, addedWords: accountedIds.size, coveredWords: manifest.entries.length - accountedIds.size,
    manifestHash: hashContent(manifest), baseMembership: manifest.baseMembership }
}
