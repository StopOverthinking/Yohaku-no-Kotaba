import fs from 'node:fs'
import { parseManuscript, hashContent } from './lib/jlpt-pilot.mjs'

// Preparation is not approval. Only the independent reviewer may invoke --accept
// after reading every item and checking the final snapshot against their review.
const [batch, index, action] = process.argv.slice(2)
if (!/^n[1-5]-\d{3}$/.test(batch ?? '') || !/^\d{2}$/.test(index ?? '')) throw new Error('Expected batch and part')
const directory = `content/jlpt/batches/${batch}`
const manuscript = fs.readFileSync(`${directory}/examples-${index}.txt`, 'utf8')
const vocabulary = JSON.parse(fs.readFileSync(`${directory}/words-${index}.json`, 'utf8'))
const sourceHash = hashContent({ vocabulary, manuscript })
const level = batch.slice(0, 2)
const pilot = fs.readFileSync(`content/jlpt/pilot/${level}.txt`, 'utf8')
const candidates = fs.readdirSync('content/jlpt/candidates').filter(f => f.endsWith('.json')).flatMap(f => JSON.parse(fs.readFileSync(`content/jlpt/candidates/${f}`, 'utf8')))
const versions = JSON.parse(fs.readFileSync('content/jlpt/pilot/example-versions.json', 'utf8'))
const expected = new Set(vocabulary.map(w => `lex-${w.dictionaryId}`))
const prior = parseManuscript(pilot, level.toUpperCase(), candidates, versions)
if (prior.some(e => expected.has(e.word.id))) throw new Error('Already appended; do not repeat preparation')
const entries = parseManuscript(pilot.trimEnd() + '\n' + manuscript, level.toUpperCase(), candidates, versions).filter(e => expected.has(e.word.id))
if (entries.length !== expected.size || expected.size !== vocabulary.length) throw new Error('Manuscript membership mismatch')
const snapshot = { batch, index, sourceHash, pilotHash: hashContent(pilot), entries }
const snapshotHash = hashContent(snapshot)
const output = `output/jlpt/review-${batch}-${index}.json`
if (action === '--prepare') {
  fs.writeFileSync(output, JSON.stringify({ ...snapshot, snapshotHash }, null, 2) + '\n')
  console.log(JSON.stringify({ output, words: entries.length, snapshotHash, action: 'draft-only' }))
} else if (action?.startsWith('--accept=')) {
  const prepared = JSON.parse(fs.readFileSync(output, 'utf8'))
  if (action.slice(9) !== snapshotHash || prepared.snapshotHash !== snapshotHash) throw new Error('Changed snapshot: re-review required')
  const notesPath = `${directory}/corrections-${index}.json`
  const corrections = fs.existsSync(notesPath) ? JSON.parse(fs.readFileSync(notesPath, 'utf8')) : []
  if (!Array.isArray(corrections) || corrections.some(c => !expected.has(c.wordId) || !c.note?.trim())) throw new Error('Invalid correction record')
  const review = { schemaVersion: 2, sourceHash,
    review: { outcome: 'accepted', reviewer: 'Codex GPT-6 Astra review agent', model: 'gpt-6-astra', reasoningEffort: 'high',
      method: 'Independent complete editorial review; compact record', reviewedAt: new Date().toISOString(),
      notes: ['All words, meanings, readings, hints, contrasts, examples and translations reviewed.'] },
    entries: entries.map(e => [e.word.id, e.contentHash]), corrections }
  // Never stamp a review before the reviewer explicitly accepts this exact snapshot.
  fs.writeFileSync(`${directory}/review-${index}.json`, JSON.stringify(review, null, 2) + '\n', { flag: 'wx' })
  fs.appendFileSync(`content/jlpt/pilot/${level}.txt`, (pilot.endsWith('\n') ? '' : '\n') + manuscript.trim() + '\n')
  console.log(JSON.stringify({ batch, index, reviewed: entries.length, corrections: corrections.length, at: review.review.reviewedAt }))
} else throw new Error('Use --prepare, then reviewer --accept=<snapshotHash>')
