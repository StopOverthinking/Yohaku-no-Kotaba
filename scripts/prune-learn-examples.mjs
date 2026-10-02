import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashContent } from './lib/jlpt-pilot.mjs'
import { readExamplePruning, verifyExamplePruning } from './lib/example-pruning.mjs'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))
const source = 'src/features/vocab/editor-data/learnContent.json'
const words = await read('src/features/vocab/editor-data/vocabularyWords.json')
const senses = await read(source)
const review = await read(process.argv.find(arg => arg.startsWith('--review='))?.slice(9) ?? 'content/learn/example-pruning-review.json')
const journals = await readExamplePruning(root)
if (review.schemaVersion !== 1 || !/^[a-z0-9-]+$/.test(review.id) || !review.authorization?.trim() ||
    !review.method?.trim() || !Number.isFinite(Date.parse(review.reviewedAt))) throw new Error('Invalid semantic review')
if (journals.some(journal => journal.id === review.id)) {
  try {
    const checked = verifyExamplePruning(words, senses, journals)
    if (hashContent({ words, senses: checked.historicalSenses }) === review.sourceHash) {
      console.log(JSON.stringify({ action: 'already-applied', ...checked.report })); process.exit(0)
    }
  } catch { /* An interrupted journal-first write may be completed below. */ }
}
if (hashContent({ words, senses }) !== review.sourceHash) throw new Error('Corpus changed since semantic review')
const wordMap = new Map(words.map(word => [word.id, word]))
const judgments = new Map(review.senses.map(row => [row.senseId, row]))
const multiple = senses.filter(sense => sense.examples.length > 1)
if (judgments.size !== review.senses.length || judgments.size !== multiple.length || multiple.some(sense => !judgments.has(sense.id)))
  throw new Error('Every multi-example sense must have exactly one semantic review')
const entries = []
const next = senses.map(sense => {
  const judgment = judgments.get(sense.id)
  if (!judgment) return sense
  if (judgment.beforeHash !== hashContent(sense) || !judgment.groups?.length) throw new Error('Stale or missing sense judgment')
  const exampleMap = new Map(sense.examples.map(example => [example.id, example]))
  const represented = new Set(), keep = new Set(), removed = []
  for (const group of judgment.groups) {
    if (!group.meaning?.trim() || !group.exampleIds?.length || !group.exampleIds.includes(group.representativeId))
      throw new Error('Every meaning group needs a representative and explanation')
    keep.add(group.representativeId)
    for (const id of group.exampleIds) {
      if (!exampleMap.has(id) || represented.has(id)) throw new Error('Unknown or multiply grouped example')
      represented.add(id)
      if (id !== group.representativeId) removed.push({ example: exampleMap.get(id), replacementId: group.representativeId,
        reason: `${group.meaning}: 같은 핵심 의미로, 별도 학습할 의미 차이가 없어 대표 예문으로 통합.` })
    }
  }
  if (represented.size !== sense.examples.length) throw new Error('Ungrouped example')
  const after = { ...sense, examples: sense.examples.filter(example => keep.has(example.id)) }
  if (removed.length) entries.push({ senseId: sense.id, wordHash: hashContent(wordMap.get(sense.wordId)),
    beforeHash: hashContent(sense), afterHash: hashContent(after), originalOrder: sense.examples.map(example => example.id), removed })
  return after
})
if (!entries.length) throw new Error('Review contains no redundant examples')
const journal = { schemaVersion: 1, id: review.id, scope: 'same-meaning-example-pruning',
  authorization: review.authorization, review: { method: review.method, reviewedAt: review.reviewedAt, sourceHash: review.sourceHash,
    reviewHash: hashContent(review) }, entriesHash: hashContent(entries), entries }
const prior = journals.filter(item => item.id !== review.id)
const existing = journals.find(item => item.id === review.id)
if (existing && hashContent(existing) !== hashContent(journal)) throw new Error('Conflicting pruning journal')
const checked = verifyExamplePruning(words, next, [...prior, journal])
if (process.argv.includes('--apply')) {
  if (hashContent({ words: await read('src/features/vocab/editor-data/vocabularyWords.json'), senses: await read(source) }) !== review.sourceHash ||
      hashContent(await readExamplePruning(root)) !== hashContent(journals)) throw new Error('Source or journals changed before write')
  const directory = path.join(root, 'content/learn/example-pruning')
  await fs.mkdir(directory, { recursive: true })
  // Journal first: an interrupted write is visible and safely resumable with this same review.
  await writeGeneratedFile(path.join(directory, `${review.id}.json`), JSON.stringify(journal, null, 2) + '\n')
  await writeGeneratedFile(path.join(root, source), JSON.stringify(next, null, 2) + '\n')
}
console.log(JSON.stringify({ action: process.argv.includes('--apply') ? 'applied' : 'validated-preview',
  reviewedSenses: judgments.size, changedSenses: entries.length,
  examplesBefore: senses.reduce((n, sense) => n + sense.examples.length, 0),
  examplesAfter: next.reduce((n, sense) => n + sense.examples.length, 0), ...checked.report }, null, 2))
