import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'
import { hashContent } from './lib/jlpt-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const batch = process.argv[2]
if (!/^\d{3}-[a-z]$/.test(batch ?? '')) throw new Error('Usage: node scripts/prepare-legacy-example-revisions.mjs 001-a')
const read = async p => JSON.parse(await fs.readFile(path.join(root, p), 'utf8'))
const [patches, words, content] = await Promise.all([
  `content/jlpt/legacy/examples-${batch}.json`,
  'src/features/vocab/editor-data/vocabularyWords.json',
  'src/features/vocab/editor-data/learnContent.json',
].map(read))
const wordMap = new Map(words.map(word => [word.id, word]))
const exampleIds = new Set(content.flatMap(sense => sense.examples.map(example => example.id)))
const seen = new Set(), drafts = []
for (const patch of patches) {
  if (seen.has(patch.wordId)) throw new Error(`${patch.wordId}: duplicate patch`)
  seen.add(patch.wordId)
  const word = wordMap.get(patch.wordId)
  const previousSenses = content.filter(sense => sense.wordId === patch.wordId)
  if (!word || hashContent({ word, senses: previousSenses }) !== patch.sourceHash) throw new Error(`${patch.wordId}: source changed`)
  const target = previousSenses.find(sense => sense.id === patch.senseId)
  if (!target || target.examples.length !== 2) throw new Error(`${patch.wordId}: expected two-example source sense`)
  if (exampleIds.has(patch.example.id) || patch.example.version !== 1 || patch.example.status !== 'draft') throw new Error(`${patch.wordId}: invalid new example identity/status`)
  if (!patch.reason?.trim()) throw new Error(`${patch.wordId}: missing scene rationale`)
  exampleIds.add(patch.example.id)
  // This is only the proposed post-review payload, never an approval or an app write.
  const senses = previousSenses.map(sense => sense.id === target.id
    ? { ...sense, examples: [...sense.examples, { ...patch.example, status: 'reviewed' }] } : sense)
  drafts.push({ wordId: word.id, sourceHash: patch.sourceHash, proposalHash: hashContent(patch), word,
    previousSenses, senses, contentHash: hashContent({ word, senses }) })
}
const source = await fs.readFile(path.join(root, 'src/features/learn/contentValidation.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { validateLearnContent } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const replacements = new Map(drafts.map(draft => [draft.wordId, draft.senses]))
const proposed = [...content.filter(sense => !replacements.has(sense.wordId)), ...drafts.flatMap(draft => draft.senses)]
const issues = validateLearnContent(proposed, new Set(words.map(word => word.id)))
if (issues.length) throw new Error(issues.join('\n'))
const out = path.join(root, `output/jlpt/legacy-example-draft-${batch}.json`)
await fs.mkdir(path.dirname(out), { recursive: true })
await fs.writeFile(out, JSON.stringify(drafts, null, 2) + '\n')
console.log(JSON.stringify({ batch, proposedWords: drafts.length, addedExamples: patches.length, status: 'draft-only; final editorial approval required' }))
