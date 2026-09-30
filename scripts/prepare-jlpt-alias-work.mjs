import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashContent, lexicalKey } from './lib/jlpt-pilot.mjs'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'

// Connected candidate groups are editorial input, never an equivalence judgment.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))
const [words, senses, sets, names, active] = await Promise.all([
  read('src/features/vocab/editor-data/vocabularyWords.json'), read('src/features/vocab/editor-data/learnContent.json'),
  read('src/features/vocab/editor-data/vocabularySets.json'), fs.readdir(path.join(root, 'content/jlpt/legacy')),
  read('content/jlpt/legacy/active-aliases.json'),
])
const proposals = (await Promise.all(names.filter(name => /^assignments-\d{3}\.json$/.test(name)).sort()
  .map(name => read(`content/jlpt/legacy/${name}`)))).flat()
const wordMap = new Map(words.map(word => [word.id, word])), edges = new Map(), keys = new Map()
const connect = (a, b) => {
  if (!wordMap.has(a) || !wordMap.has(b)) throw new Error('Unknown alias candidate ID')
  if (!edges.has(a)) edges.set(a, new Set())
  if (!edges.has(b)) edges.set(b, new Set())
  edges.get(a).add(b); edges.get(b).add(a)
}
for (const word of words) {
  const key = lexicalKey(word)
  if (keys.has(key)) connect(keys.get(key), word.id)
  else keys.set(key, word.id)
}
for (const proposal of proposals) for (const id of proposal.aliasCandidateIds ?? []) connect(proposal.wordId, id)
const visited = new Set(), groups = []
for (const start of [...edges.keys()].sort()) {
  if (visited.has(start)) continue
  const pending = [start], ids = []
  while (pending.length) {
    const id = pending.pop()
    if (visited.has(id)) continue
    visited.add(id); ids.push(id); pending.push(...edges.get(id))
  }
  ids.sort()
  const entries = ids.map(id => {
    const word = wordMap.get(id), content = senses.filter(sense => sense.wordId === id)
    const sourceHash = hashContent({ word, senses: content }), classification = proposals.find(proposal => proposal.wordId === id) ?? null
    return { word, senses: content, sourceHash,
      publishedLevels: sets.filter(set => set.id.startsWith('jlpt-level-') && set.wordIds.includes(id)).map(set => set.name),
      classification, classificationSourceCurrent: classification ? classification.sourceHash === sourceHash : null }
  })
  groups.push({ id: `candidate-${hashContent(ids).slice(0, 16)}`, sourceHash: hashContent(entries),
    status: 'unreviewed', activeRepresentatives: ids.filter(id => active.includes(id)), entries })
}
const directory = path.join(root, 'output/jlpt/alias-work')
await fs.mkdir(directory, { recursive: true })
const files = []
for (let i = 0; i < groups.length; i += 10) {
  const file = `alias-${String(files.length + 1).padStart(3, '0')}.json`
  const document = { scope: 'candidate evidence only; no automatic profile or content changes', requirements: [
    'Compare every meaning, hint, contrast and example before deciding core equivalence',
    'Keep distinct meanings and all original IDs; do not transfer mastery to broader meanings',
    'Only single-sense equivalent-core-usage groups fit the current migration contract',
    'Prefer a currently published representative when equivalent; otherwise propose the most complete existing usage and level',
    'Record explicit hold reasons and necessary content repairs; no quota-driven merging',
  ], groups: groups.slice(i, i + 10) }
  await writeGeneratedFile(path.join(directory, file), JSON.stringify(document, null, 2) + '\n')
  files.push({ file, groups: document.groups.length, hash: hashContent(document) })
}
const manifest = { status: 'unreviewed candidate groups, not active aliases', groups: groups.length,
  words: groups.reduce((n, group) => n + group.entries.length, 0), files }
await writeGeneratedFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest))
