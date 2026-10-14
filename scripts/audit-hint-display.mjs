import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { hintComparisonIssue } from './lib/hint-comparison-policy.mjs'
import { buildSemanticHintConfusions, assertSemanticHintSynchronization } from './lib/hint-semantic-review.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (name) => JSON.parse(await fs.readFile(path.join(root, 'src/features/vocab/editor-data', name), 'utf8'))
const [basic, theme, senses, overrides] = await Promise.all([
  read('vocabularyWords.json'), read('themeWords.json'), read('learnContent.json'), read('hintConfusions.json'),
])
const words = [...basic, ...theme], byWord = new Map(words.map((word) => [word.id, word])), bySense = new Map(senses.map((sense) => [sense.id, sense]))
const [semanticReview, ...dictionaryCandidates] = await Promise.all([
  fs.readFile(path.join(root, 'content/learn/hint-semantic-review.json'), 'utf8').then(JSON.parse),
  ...['n5', 'n4', 'n3', 'n2', 'n1', 'unassigned'].map((level) =>
    fs.readFile(path.join(root, `content/jlpt/candidates/${level}.json`), 'utf8').then(JSON.parse)),
])
const reviewed = buildSemanticHintConfusions(semanticReview, words, senses, dictionaryCandidates.flat())
assertSemanticHintSynchronization(overrides, reviewed.supplements)
const rows = senses.map((sense) => {
  const word = byWord.get(sense.wordId), override = overrides[sense.id]
  const labels = override?.senseVersion === sense.version ? override.words : []
  const targets = [word.japanese, word.reading, ...sense.examples.flatMap((example) => [example.answer, example.reading])]
  // Inspect the supplied labels before the runtime safety guard can conceal an
  // unsafe source. Missing/stale selections never revive authored contrasts.
  const supplied = [...new Set(labels.map((label) => label.trim()))]
  const excluded = supplied.map((label) => ({ label, reason: hintComparisonIssue(label, targets) })).filter((entry) => entry.reason)
  return { senseId: sense.id, wordId: word.id, japanese: word.japanese, reading: word.reading, meaning: sense.meaning,
    path: override?.senseVersion === sense.version ? 'semantic-review' : 'missing-or-stale-empty', supplied,
    excluded, safeLabels: supplied.filter((label) => !hintComparisonIssue(label, targets)).slice(0, 2) }
})
const affected = rows.filter((row) => row.excluded.length)
const summary = { words: words.length, senses: senses.length, examples: senses.reduce((sum, sense) => sum + sense.examples.length, 0),
  suppliedLabels: rows.reduce((sum, row) => sum + row.supplied.length, 0),
  unsafeLabels: rows.reduce((sum, row) => sum + row.excluded.length, 0),
  permittedSharedKanjiLabels: rows.reduce((sum, row) => {
    const sense = bySense.get(row.senseId)
    const kanji = new Set((row.japanese + sense.examples.map((example) => example.answer).join('')).normalize('NFKC').match(/\p{Script=Han}/gu) ?? [])
    return sum + row.safeLabels.filter((label) => [...label.normalize('NFKC')].some((char) => kanji.has(char))).length
  }, 0),
  affectedWords: new Set(affected.map((row) => row.wordId)).size, affectedSenses: affected.length,
  withComparisons: rows.filter((row) => row.safeLabels.length).length,
  withoutComparisons: rows.filter((row) => !row.safeLabels.length).length }
const report = { schemaVersion: 2, policy: 'Explicit current-Korean-sense review only; exclude identical displayed answer/headword labels and simple inflections; reviewed homophones and shared kanji permitted',
  reviewHash: reviewed.reviewHash,
  sourceHash: createHash('sha256').update(JSON.stringify({ words, senses, overrides })).digest('hex'), summary, rows }
await fs.mkdir(path.join(root, 'output/hints'), { recursive: true })
await fs.writeFile(path.join(root, 'output/hints/display-audit.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
if (process.argv.includes('--require-safe') && summary.unsafeLabels) throw new Error('Unsafe supplied hint labels remain')
