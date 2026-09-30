import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashContent } from './lib/jlpt-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const batch = process.argv[2]
if (!/^\d{3}$/.test(batch ?? '')) throw new Error('Usage: node scripts/audit-jlpt-legacy-assignments.mjs 001')
const read = async (p) => JSON.parse(await fs.readFile(path.join(root, p), 'utf8'))
const [work, proposals, words, senses, baseline] = await Promise.all([
  `output/jlpt/legacy-work/legacy-${batch}.json`,
  `content/jlpt/legacy/assignments-${batch}.json`,
  'src/features/vocab/editor-data/vocabularyWords.json',
  'src/features/vocab/editor-data/learnContent.json',
  'content/jlpt/baseline.json',
].map(read))
const currentWords = new Map(words.map((word) => [word.id, word]))
const originals = new Set(baseline.words.map((word) => word.id))
const expected = new Map(work.groups.flatMap((group) => group.entries.map((entry) => [entry.word.id, entry])))
const issues = [], seen = new Set()
for (const row of proposals) {
  const entry = expected.get(row.wordId)
  if (!entry || seen.has(row.wordId)) { issues.push(`${row.wordId}: unknown or duplicate ID`); continue }
  seen.add(row.wordId)
  const currentHash = hashContent({ word: currentWords.get(row.wordId), senses: senses.filter((sense) => sense.wordId === row.wordId) })
  if (row.sourceHash !== entry.sourceHash || row.sourceHash !== currentHash) issues.push(`${row.wordId}: source changed`)
  if (row.level !== null && !/^N[1-5]$/.test(row.level ?? '')) issues.push(`${row.wordId}: invalid level`)
  if (!row.levelNote?.trim() || !row.meaningReview?.trim()) issues.push(`${row.wordId}: missing rationale`)
  if (!Array.isArray(row.issues) || row.issues.some((issue) => typeof issue !== 'string')) issues.push(`${row.wordId}: invalid issue list`)
  if (row.level === null && !row.issues?.length) issues.push(`${row.wordId}: unresolved level without explanation`)
  if (row.dictionaryId !== null && !entry.dictionaryCandidates.some((candidate) => candidate.id === row.dictionaryId)) issues.push(`${row.wordId}: dictionary choice has no supplied evidence`)
  if (!Array.isArray(row.aliasCandidateIds) || row.aliasCandidateIds.some((id) => id === row.wordId || !originals.has(id))) issues.push(`${row.wordId}: invalid alias candidate`)
}
for (const id of expected.keys()) if (!seen.has(id)) issues.push(`${id}: missing assignment`)
let reviews = []
try { reviews = await read(`content/jlpt/legacy/review-${batch}.json`) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const reviewed = new Set(), proposalMap = new Map(proposals.map((row) => [row.wordId, row]))
for (const review of reviews) {
  const proposal = proposalMap.get(review.wordId)
  if (!proposal || reviewed.has(review.wordId)) { issues.push(`${review.wordId}: unknown or duplicate review`); continue }
  reviewed.add(review.wordId)
  if (review.sourceHash !== proposal.sourceHash || review.proposalHash !== hashContent(proposal)) issues.push(`${review.wordId}: stale classification review`)
  if (review.scope !== 'legacy-classification-proposal-only' || review.model !== 'gpt-6-astra' || review.reasoningEffort !== 'high') issues.push(`${review.wordId}: unexpected review scope or reviewer`)
  if (!['accepted', 'needs_followup', 'rejected'].includes(review.outcome)) issues.push(`${review.wordId}: invalid review outcome`)
}
console.log(JSON.stringify({ batch, expectedWords: expected.size, proposedWords: proposals.length,
  unresolvedLevels: proposals.filter((row) => row.level === null).length,
  withEditorialIssues: proposals.filter((row) => row.issues?.length).length,
  reviewedClassifications: reviewed.size, acceptedClassifications: reviews.filter((row) => row.outcome === 'accepted').length,
  status: 'structural audit only; independent editorial approval still required', issues }, null, 2))
if (issues.length) process.exitCode = 1
