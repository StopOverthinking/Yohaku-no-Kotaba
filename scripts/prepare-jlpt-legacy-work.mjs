import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashContent, wordKey } from './lib/jlpt-pilot.mjs'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'

// Editorial input only: never updates IDs, levels, profiles or published content.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (p) => JSON.parse(await fs.readFile(path.join(root, p), 'utf8'))
const [baseline, words, senses, ...pools] = await Promise.all([
  'content/jlpt/baseline.json',
  'src/features/vocab/editor-data/vocabularyWords.json',
  'src/features/vocab/editor-data/learnContent.json',
  ...['n5', 'n4', 'n3', 'n2', 'n1', 'unassigned'].map((level) => `content/jlpt/candidates/${level}.json`),
].map(read))
const wordMap = new Map(words.map((word) => [word.id, word]))
const senseMap = new Map(), candidatesByWord = new Map(), groups = new Map(), candidatesByForm = new Map()
for (const sense of senses) {
  if (!senseMap.has(sense.wordId)) senseMap.set(sense.wordId, [])
  senseMap.get(sense.wordId).push(sense)
}
for (const candidate of pools.flat()) {
  for (const id of candidate.existingWordIds ?? []) {
    if (!candidatesByWord.has(id)) candidatesByWord.set(id, [])
    candidatesByWord.get(id).push(candidate)
  }
  for (const japanese of new Set([...candidate.spellings, ...candidate.readings])) for (const reading of new Set(candidate.readings)) {
    const key = wordKey({ japanese, reading })
    if (!candidatesByForm.has(key)) candidatesByForm.set(key, [])
    candidatesByForm.get(key).push(candidate)
  }
}
for (const original of baseline.words) {
  const word = wordMap.get(original.id)
  if (!word) throw new Error(`Missing baseline ID: ${original.id}`)
  const key = wordKey(original)
  if (!groups.has(key)) groups.set(key, { key, status: 'unreviewed', entries: [] })
  let dictionaryCandidates = candidatesByWord.get(word.id) ?? []
  if (!dictionaryCandidates.length) {
    dictionaryCandidates = (candidatesByForm.get(wordKey(word)) ?? []).map(candidate => ({
      ...candidate, legacyMatchEvidence: { method: 'exact dictionary alternative spelling or reading',
        originalJapanese: word.japanese, originalReading: word.reading,
        japanese: word.japanese, reading: word.reading },
    }))
  }
  if (!dictionaryCandidates.length && word.type === 'na_adj' && word.japanese.endsWith('だ') && word.reading.endsWith('だ')) {
    const form = { japanese: word.japanese.slice(0, -1), reading: word.reading.slice(0, -1) }
    dictionaryCandidates = (candidatesByForm.get(wordKey(form)) ?? []).map((candidate) => ({
      ...candidate, legacyMatchEvidence: { method: 'na-adjective dictionary stem without final copula', originalJapanese: word.japanese, originalReading: word.reading, ...form },
    }))
  }
  if (!dictionaryCandidates.length && word.type === 'verb' && word.verbInfo?.startsWith('3') &&
      word.japanese.length > 2 && word.reading.length > 2 && word.japanese.endsWith('する') && word.reading.endsWith('する')) {
    const form = { japanese: word.japanese.slice(0, -2), reading: word.reading.slice(0, -2) }
    dictionaryCandidates = (candidatesByForm.get(wordKey(form)) ?? [])
      .filter(candidate => candidate.senses.some(sense => sense.pos.some(pos => pos === 'noun or participle which takes the aux. verb suru')))
      .map(candidate => ({ ...candidate, legacyMatchEvidence: {
        method: 'explicit group-3 compound and dictionary suru-noun base',
        originalJapanese: word.japanese, originalReading: word.reading, ...form,
      } }))
  }
  groups.get(key).entries.push({
    word, senses: senseMap.get(word.id) ?? [],
    dictionaryCandidates,
    sourceHash: hashContent({ word, senses: senseMap.get(word.id) ?? [] }),
  })
}
const destination = path.join(root, 'output/jlpt/legacy-work')
await fs.mkdir(destination, { recursive: true })
const entries = [...groups.values()], files = []
for (let start = 0; start < entries.length; start += 30) {
  const file = `legacy-${String(files.length + 1).padStart(3, '0')}.json`
  const selected = entries.slice(start, start + 30)
  const document = {
    status: 'unreviewed; same spelling and reading is not proof of equivalent meaning',
    requirements: ['Review N5–N1 level and meaning against dictionary evidence',
      'Keep every existing word and sense ID; do not merge profiles automatically',
      'Keep at least one reviewed representative example per sense; preserve existing examples without a mandatory third',
      'Approve any alias only after comparing meanings and learning histories'],
    groups: selected,
  }
  await writeGeneratedFile(path.join(destination, file), JSON.stringify(document, null, 2) + '\n')
  files.push({ file, groups: selected.length, words: selected.reduce((n, group) => n + group.entries.length, 0), hash: hashContent(document) })
}
const manifest = { status: 'unreviewed', baselineRows: baseline.words.length, lexicalGroups: entries.length, files }
if (files.reduce((n, file) => n + file.words, 0) !== baseline.words.length) throw new Error('Incomplete legacy coverage')
await writeGeneratedFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ baselineRows: manifest.baselineRows, lexicalGroups: manifest.lexicalGroups, files: files.length, action: 'prepared-editorial-input-only' }))
