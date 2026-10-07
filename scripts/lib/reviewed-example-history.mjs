import fs from 'node:fs/promises'
import path from 'node:path'
import { hashContent, validateExampleRevision } from './jlpt-pilot.mjs'
import { readExamplePruning, verifyExamplePruning } from './example-pruning.mjs'
import { questionKanjiLeaks } from './hint-comparison-policy.mjs'

export async function readReviewedExampleHistory(root) {
  const directory = path.join(root, 'content/learn/example-corrections')
  let names = []
  try { names = await fs.readdir(directory) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const corrections = await Promise.all(names.filter(name => name.endsWith('.json')).sort().map(async name =>
    JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))))
  return { pruning: await readExamplePruning(root), corrections }
}

/** Restore exact historical text only for validating old receipts. Live text
 * remains corrected; the new review is explicitly a user-authorized edit. */
export function verifyReviewedExampleHistory(words, senses, history) {
  const wordMap = new Map(words.map(word => [word.id, word]))
  const current = new Map(senses.map(sense => [sense.id, sense]))
  if (current.size !== senses.length) throw new Error('Duplicate current sense ID')
  const ids = new Set()
  let correctedExamples = 0
  for (const journal of [...history.corrections].reverse()) {
    if (journal.schemaVersion !== 1 || !['user-authorized-example-polarity-correction', 'user-authorized-example-kanji-leakage-correction'].includes(journal.scope) ||
        !journal.id || ids.has(journal.id) || !journal.authorization?.trim() ||
        journal.review?.outcome !== 'accepted' || !journal.review?.reviewedBy?.trim() ||
        journal.review?.independent !== false || !journal.review?.notes?.length ||
        !Number.isFinite(Date.parse(journal.review?.reviewedAt)) ||
        !Array.isArray(journal.entries) || !journal.entries.length ||
        journal.entriesHash !== hashContent(journal.entries)) throw new Error('Invalid example correction journal')
    ids.add(journal.id)
    const seen = new Set()
    for (const entry of journal.entries) {
      const word = wordMap.get(entry.wordId), sense = current.get(entry.after?.id)
      if (!word || !sense || sense.wordId !== entry.wordId || seen.has(sense.id) ||
          !entry.reason?.trim() || hashContent(word) !== entry.wordHash ||
          hashContent(entry.before) !== entry.beforeHash || hashContent(entry.after) !== entry.afterHash ||
          hashContent(sense) !== entry.afterHash) throw new Error('Example correction source changed or not applied')
      seen.add(sense.id)
      validateExampleRevision(word, entry.before, word, entry.after, hashContent({ word, sense: entry.before }))
      for (let i = 0; i < entry.after.examples.length; i++) {
        const before = entry.before.examples[i], after = entry.after.examples[i]
        if (hashContent(before) === hashContent(after)) continue
        if (before.status !== 'reviewed' || after.status !== 'reviewed' ||
            before.difficulty !== after.difficulty ||
            ['before', 'answer', 'after', 'reading', 'translation', 'translationTarget'].some(key => typeof after[key] !== 'string') ||
            !after.translationTarget || !after.translation.includes(after.translationTarget))
          throw new Error('Invalid corrected example fields')
        const allowed = new Set(['version', 'before', 'answer', 'after', 'reading', 'translation', 'translationTarget'])
        const stable = example => Object.fromEntries(Object.entries(example).filter(([key]) => !allowed.has(key)))
        if (hashContent(stable(before)) !== hashContent(stable(after))) throw new Error('Correction changed example metadata')
        if (journal.scope === 'user-authorized-example-kanji-leakage-correction' &&
            (!questionKanjiLeaks(word.japanese, before).length || questionKanjiLeaks(word.japanese, after).length ||
              before.answer !== after.answer || before.reading !== after.reading))
          throw new Error('Kanji leakage correction must remove the clue and preserve the answer')
        correctedExamples++
      }
      current.set(sense.id, entry.before)
    }
  }
  const beforeCorrections = senses.map(sense => current.get(sense.id))
  const pruning = verifyExamplePruning(words, beforeCorrections, history.pruning)
  const live = new Map(senses.map(sense => [sense.id, sense]))
  // A retired card resolves to the current version of its surviving example.
  const retirements = pruning.retirements.map(row => ({ ...row, replacementVersion:
    live.get(row.senseId).examples.find(example => example.id === row.replacementId).version }))
  return { ...pruning, retirements, beforeCorrections,
    corrections: { journals: ids.size, correctedExamples, sourceHash: hashContent(history.corrections),
      reviewScope: 'user-authorized editorial correction; no new independent approval claimed' } }
}
