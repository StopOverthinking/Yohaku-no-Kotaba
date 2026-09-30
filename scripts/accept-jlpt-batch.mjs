import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyReview, hashContent, expandBatchReview } from './lib/jlpt-pilot.mjs'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const batch = process.argv[2]
if (!/^n[1-5]-\d{3}$/.test(batch ?? '')) throw new Error('Usage: node scripts/accept-jlpt-batch.mjs n3-001')
const directory = path.join(root, 'content/jlpt/batches', batch)
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))
const draft = await read(path.join(root, 'output/jlpt/pilot-draft.json'))
const entries = new Map(draft.map((entry) => [entry.word.id, entry]))
const reviewPath = path.join(root, 'content/jlpt/pilot/reviews.json')
const original = await fs.readFile(reviewPath, 'utf8')
const reviews = JSON.parse(original)
const part = process.argv.find(arg => arg.startsWith('--part='))?.slice(7)
if (part && !/^\d{2}$/.test(part)) throw new Error('Invalid part')
const files = (await fs.readdir(directory)).filter((file) => /^words-\d+\.json$/.test(file) && (!part || file === `words-${part}.json`)).sort()
if (!files.length) throw new Error('No vocabulary files')
const seen = new Set()
let added = 0
for (const file of files) {
  const vocabulary = await read(path.join(directory, file))
  // Missing any review file rejects the whole batch before writing anything.
  const record = await read(path.join(directory, file.replace('words-', 'review-')))
  const manuscript = record.schemaVersion === 2 ? await fs.readFile(path.join(directory, file.replace('words-', 'examples-').replace('.json', '.txt')), 'utf8') : ''
  const rows = expandBatchReview(record, vocabulary, manuscript)
  const expected = new Set(vocabulary.map((word) => `lex-${word.dictionaryId}`))
  if (expected.size !== vocabulary.length || rows.length !== expected.size) throw new Error(`${file}: review count mismatch`)
  for (const { wordId, ...review } of rows) {
    if (!expected.delete(wordId) || seen.has(wordId)) throw new Error(`${wordId}: wrong or duplicated batch review`)
    seen.add(wordId)
    const entry = entries.get(wordId)
    if (!entry || entry.contentHash !== hashContent({ word: entry.word, sense: entry.sense, level: entry.level }))
      throw new Error(`${wordId}: missing or stale draft`)
    if (review.model !== 'gpt-6-astra' || review.reasoningEffort !== 'high')
      throw new Error(`${wordId}: expected Astra high review`)
    applyReview(entry, review)
    if (reviews[wordId]) {
      if (hashContent(reviews[wordId]) !== hashContent(review)) throw new Error(`${wordId}: existing review differs; explicit revision required`)
    } else {
      reviews[wordId] = review
      added++
    }
  }
}
if (await fs.readFile(reviewPath, 'utf8') !== original) throw new Error('Review registry changed during import')
if (added) await writeGeneratedFile(reviewPath, JSON.stringify(reviews, null, 2) + '\n')
console.log(JSON.stringify({ batch, files: files.length, reviewedWords: seen.size, added, action: 'accepted-reviews-only; run publish separately' }, null, 2))
