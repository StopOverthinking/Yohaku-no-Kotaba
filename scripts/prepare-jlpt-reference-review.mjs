import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lexicalKey, hashContent, aliasCandidateMembers } from './lib/jlpt-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (name) => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'))
const base = 'content/jlpt/legacy'
const [words, senses, names] = await Promise.all([
  read('src/features/vocab/editor-data/vocabularyWords.json'),
  read('src/features/vocab/editor-data/learnContent.json'), fs.readdir(path.join(root, base)),
])
const wordById = new Map(words.map((word) => [word.id, word]))
const sensesByWord = new Map(), keyCounts = new Map()
for (const sense of senses) {
  if (!sensesByWord.has(sense.wordId)) sensesByWord.set(sense.wordId, [])
  sensesByWord.get(sense.wordId).push(sense)
}
for (const word of words) { const key = lexicalKey(word); keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1) }
const prior = names.includes('membership-reviews.json') ? await read(`${base}/membership-reviews.json`) : []
const alreadyReviewed = new Set(prior.map((entry) => entry.wordId))
const heldReviews = names.includes('membership-held.json') ? await read(`${base}/membership-held.json`) : []
if (!process.argv.includes('--include-held')) heldReviews.forEach((entry) => alreadyReviewed.add(entry.wordId))
const rows = [], held = []
const proposalFiles = await Promise.all(names.filter(name => /^assignments-\d{3}\.json$/.test(name)).sort()
  .map(async name => [name.match(/\d{3}/)[0], await read(`${base}/${name}`)]))
const proposalsByBatch = new Map(proposalFiles.map(([batch, entries]) => [batch, new Map(entries.map(entry => [entry.wordId, entry]))]))
const aliasMembers = aliasCandidateMembers(proposalFiles.flatMap(([, entries]) => entries))
for (const name of names.filter((name) => /^review-\d{3}\.json$/.test(name)).sort()) {
  const batch = name.match(/\d{3}/)[0]
  const proposals = proposalsByBatch.get(batch)
  for (const review of await read(`${base}/${name}`)) {
    if (review.outcome !== 'accepted' || alreadyReviewed.has(review.wordId)) continue
    const proposal = proposals.get(review.wordId), word = wordById.get(review.wordId)
    const content = sensesByWord.get(review.wordId) ?? []
    if (!proposal || !word || review.scope !== 'legacy-classification-proposal-only' ||
        review.model !== 'gpt-6-astra' || review.reasoningEffort !== 'high' ||
        review.proposalHash !== hashContent(proposal) || review.sourceHash !== hashContent({ word, senses: content }))
      throw new Error(`${review.wordId}: stale or invalid classification review`)
    if (keyCounts.get(lexicalKey(word)) !== 1 || aliasMembers.has(word.id)) {
      held.push({ wordId: word.id, reason: 'duplicate or alias candidate; separate migration required' }); continue
    }
    rows.push({ batch, word, senses: content, sourceHash: review.sourceHash, proposal, classificationReview: review })
  }
}
const output = 'output/jlpt/legacy-reference-candidates.json'
await fs.mkdir(path.join(root, 'output/jlpt'), { recursive: true })
await fs.writeFile(path.join(root, output), JSON.stringify({ generatedAt: new Date().toISOString(),
  scope: 'review input only; no content or publication approval', rows, held }, null, 2) + '\n')
console.log(JSON.stringify({ candidates: rows.length, heldAliases: held.length, output }))
