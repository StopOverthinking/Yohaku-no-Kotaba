import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wordKey } from './lib/jlpt-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))
const [baseline, words, senses, ...pools] = await Promise.all([
  'content/jlpt/baseline.json',
  'src/features/vocab/editor-data/vocabularyWords.json',
  'src/features/vocab/editor-data/learnContent.json',
  ...['n5', 'n4', 'n3', 'n2', 'n1', 'unassigned'].map((level) => `content/jlpt/candidates/${level}.json`),
].map(read))
const wordMap = new Map(words.map((word) => [word.id, word]))
const byWord = new Map(), matches = new Map(), groups = new Map()
for (const sense of senses) {
  if (!byWord.has(sense.wordId)) byWord.set(sense.wordId, [])
  byWord.get(sense.wordId).push(sense)
}
for (const candidate of pools.flat()) for (const id of candidate.existingWordIds ?? []) {
  if (!matches.has(id)) matches.set(id, [])
  matches.get(id).push(candidate)
}
const rows = baseline.words.map((original) => {
  const current = wordMap.get(original.id)
  if (!current) throw new Error(`${original.id}: legacy ID missing; migration must preserve compatibility`)
  const key = wordKey(original)
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(original.id)
  return {
    ...original, meaning: current.meaning,
    candidates: (matches.get(original.id) ?? []).map((candidate) => ({
      id: candidate.id, proposedLevel: candidate.proposedLevel,
    })),
    senses: (byWord.get(original.id) ?? []).map((sense) => ({
      id: sense.id, meaning: sense.meaning,
      reviewedExamples: sense.examples.filter((example) => example.status === 'reviewed').length,
    })),
  }
})
const duplicateGroups = [...groups].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({
  key, ids, meanings: ids.map((id) => wordMap.get(id).meaning),
}))
const summary = {
  baselineRows: rows.length, uniqueKeys: groups.size, duplicateGroups: duplicateGroups.length,
  noDictionaryMatch: rows.filter((row) => !row.candidates.length).length,
  ambiguousDictionaryMatch: rows.filter((row) => row.candidates.length > 1).length,
  missingSenses: rows.filter((row) => !row.senses.length).length,
  sensesNeedingThirdExample: rows.flatMap((row) => row.senses).filter((sense) => sense.reviewedExamples < 3).length,
}
const report = {
  status: 'unreviewed candidates; no automatic level assignment or profile merging',
  ...summary, duplicateGroups, rows,
}
const destination = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) ?? 'output/jlpt/legacy-mapping-audit.json'
await fs.mkdir(path.dirname(path.resolve(root, destination)), { recursive: true })
await fs.writeFile(path.resolve(root, destination), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
