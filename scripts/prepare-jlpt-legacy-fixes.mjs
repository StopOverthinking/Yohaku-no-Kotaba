import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashContent } from './lib/jlpt-pilot.mjs'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'

// Read-only editorial input; a held record is not permission to overwrite content.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))
const [held, words, senses, referenceReviews, names] = await Promise.all([
  read('content/jlpt/legacy/membership-held.json'), read('src/features/vocab/editor-data/vocabularyWords.json'),
  read('src/features/vocab/editor-data/learnContent.json'), read('content/jlpt/legacy/membership-reviews.json'),
  fs.readdir(path.join(root, 'output/jlpt/legacy-work')),
])
const evidence = new Map()
for (const name of names.filter(name => /^legacy-\d{3}\.json$/.test(name)).sort()) {
  const file = await read(`output/jlpt/legacy-work/${name}`)
  for (const group of file.groups) for (const entry of group.entries)
    evidence.set(entry.word.id, { file: name, candidates: entry.dictionaryCandidates })
}
const rows = held.map(record => {
  const word = words.find(word => word.id === record.wordId), content = senses.filter(sense => sense.wordId === record.wordId)
  if (!word || !content.length) throw new Error(`Missing held source: ${record.wordId}`)
  const sourceHash = hashContent({ word, senses: content })
  return { word, senses: content, sourceHash, held: record, heldSourceStillCurrent: record.sourceHash === sourceHash,
    alreadyReferenceApproved: referenceReviews.some(review => review.wordId === word.id), dictionaryEvidence: evidence.get(word.id) ?? null }
})
const document = {
  scope: 'editorial fix proposals only; preserve original IDs and content until independent approval and explicit application',
  policy: ['Do not add a mandatory third example', 'Preserve existing representative senses and all unchanged example IDs',
    'Add a distinct common sense with one reviewed representative example only when needed for practical coverage',
    'Distinguish example-only, equivalent-usage word metadata correction, additional common sense, alias decision, and evidence needed',
    'Never convert held candidates to approved references automatically'],
  rows,
}
const output = 'output/jlpt/legacy-fix-candidates.json'
await writeGeneratedFile(path.join(root, output), JSON.stringify(document, null, 2) + '\n')
console.log(JSON.stringify({ action: 'prepared-unapproved-input', words: rows.length, staleHeldHashes: rows.filter(row => !row.heldSourceStillCurrent).length,
  alreadyApproved: rows.filter(row => row.alreadyReferenceApproved).length, output, inputHash: hashContent(document) }))
