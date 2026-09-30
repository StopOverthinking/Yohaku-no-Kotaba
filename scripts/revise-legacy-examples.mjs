import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { hashContent } from './lib/jlpt-pilot.mjs'
import { prepareLegacyExampleRevision, applyLegacyExampleRevision } from './lib/legacy-example-revision.mjs'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async file => JSON.parse(await fs.readFile(path.resolve(root, file), 'utf8'))
const optional = async (file, fallback) => { try { return await read(file) } catch (e) { if (e.code !== 'ENOENT') throw e; return fallback } }
const write = async (file, value) => writeGeneratedFile(path.resolve(root, file), JSON.stringify(value, null, 2) + '\n')
const [mode, input, reviewFile] = process.argv.slice(2)
if (!['--prepare', '--apply'].includes(mode) || !input || (mode === '--apply' && !reviewFile))
  throw new Error('Usage: --prepare proposal.json OR --apply draft.json review.json')
const editor = 'src/features/vocab/editor-data'
const [words, senses, baseline] = await Promise.all([
  read(`${editor}/vocabularyWords.json`), read(`${editor}/learnContent.json`), read('content/jlpt/baseline.json'),
])
const baselineIds = baseline.words.map(word => word.id)
if (mode === '--prepare') {
  const proposal = await read(input)
  const id = proposal.id ?? path.basename(input, '.json').replace(/-proposal$/, '')
  const draft = prepareLegacyExampleRevision(id, proposal.items, words, senses, baselineIds)
  const output = `output/jlpt/${id}-revision-draft.json`
  await fs.mkdir(path.join(root, 'output/jlpt'), { recursive: true })
  await write(output, draft)
  console.log(JSON.stringify({ action: 'draft-only; independent approval required', output, draftHash: hashContent(draft), senses: draft.entries.length }))
} else {
  const [draft, review, references, aliases, activeAliasIds] = await Promise.all([
    read(input), read(reviewFile), optional('content/jlpt/legacy/membership-reviews.json', []),
    optional('content/jlpt/legacy/alias-pilot-review.json', []), optional('content/jlpt/legacy/active-aliases.json', []),
  ])
  // Existing publication/alias receipts need their own re-review, not an implicit hash replacement.
  const protectedIds = [...references.map(entry => entry.wordId),
    ...aliases.filter(entry => activeAliasIds.includes(entry.representativeWordId)).flatMap(entry => entry.members.map(member => member.wordId))]
  const originalHash = hashContent(senses), wordsHash = hashContent(words)
  // Validate the approved draft even when recovering a previously committed write.
  applyLegacyExampleRevision(draft, review, draft.entries.map(entry => entry.word),
    draft.entries.map(entry => entry.before), baselineIds, protectedIds)
  const journal = { schemaVersion: 1, kind: 'authorized-before-after-content', draft, review }
  const journalPath = `content/jlpt/legacy/revisions/${draft.id}.json`
  const existing = await optional(journalPath, null)
  if (existing && hashContent(existing) !== hashContent(journal)) throw new Error('Revision journal ID already belongs to different content')
  const alreadyApplied = draft.entries.every(entry => hashContent({
    word: words.find(word => word.id === entry.word.id), sense: senses.find(sense => sense.id === entry.before.id),
  }) === entry.afterHash)
  if (alreadyApplied) {
    if (!existing) throw new Error('Changed source without the matching revision journal')
    console.log(JSON.stringify({ action: 'already-applied', journalPath }))
  } else {
    const next = applyLegacyExampleRevision(draft, review, words, senses, baselineIds, protectedIds)
    const source = await fs.readFile(path.join(root, 'src/features/learn/contentValidation.ts'), 'utf8')
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    const { validateLearnContent } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
    const issues = validateLearnContent(next, new Set(words.map(word => word.id)))
    if (issues.length) throw new Error(`Invalid revised content: ${issues.join('; ')}`)
    if (hashContent(await read(`${editor}/learnContent.json`)) !== originalHash ||
        hashContent(await read(`${editor}/vocabularyWords.json`)) !== wordsHash ||
        hashContent(await optional('content/jlpt/legacy/membership-reviews.json', [])) !== hashContent(references) ||
        hashContent(await optional('content/jlpt/legacy/alias-pilot-review.json', [])) !== hashContent(aliases) ||
        hashContent(await optional('content/jlpt/legacy/active-aliases.json', [])) !== hashContent(activeAliasIds))
      throw new Error('Content or publication approvals changed while preparing revision')
    // Journal first. An interrupted attempt is distinguishable from a completed
    // one by the before/after hashes and may retry only the same approved draft.
    await fs.mkdir(path.dirname(path.join(root, journalPath)), { recursive: true })
    await write(journalPath, journal)
    await write(`${editor}/learnContent.json`, next)
    console.log(JSON.stringify({ action: 'applied-reviewed-examples-only', journalPath,
      words: draft.entries.map(entry => entry.word.id), next: 'Regenerate runtime and affected legacy review inputs; run both content audits' }))
  }
}
