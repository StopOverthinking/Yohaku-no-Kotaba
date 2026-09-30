import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { hashContent } from './lib/jlpt-pilot.mjs'
import { prepareLegacyContentRevision, applyLegacyContentRevision, validateLegacyContentRevision } from './lib/legacy-content-revision.mjs'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async file => JSON.parse(await fs.readFile(path.resolve(root, file), 'utf8'))
const optional = async (file, fallback) => { try { return await read(file) } catch (error) { if (error.code !== 'ENOENT') throw error; return fallback } }
const write = (file, value) => writeGeneratedFile(path.resolve(root, file), JSON.stringify(value, null, 2) + '\n')
const [mode, input, reviewFile] = process.argv.slice(2)
if (!['--prepare', '--apply'].includes(mode) || !input || mode === '--apply' && !reviewFile)
  throw new Error('Usage: --prepare proposals.json OR --apply draft.json review.json')
const wordFile = 'src/features/vocab/editor-data/vocabularyWords.json', senseFile = 'src/features/vocab/editor-data/learnContent.json'
const guards = ['content/jlpt/legacy/membership-reviews.json', 'content/jlpt/legacy/alias-pilot-review.json', 'content/jlpt/legacy/active-aliases.json']
const [words, senses, baseline, references, aliases, active] = await Promise.all([
  read(wordFile), read(senseFile), read('content/jlpt/baseline.json'), ...guards.map(file => optional(file, [])),
])
const baselineIds = baseline.words.map(word => word.id)
const protectedIds = [...references.map(row => row.wordId),
  ...aliases.filter(row => active.includes(row.representativeWordId)).flatMap(row => row.members.map(member => member.wordId))]
if (mode === '--prepare') {
  const id = path.basename(input, '.json')
  const draft = prepareLegacyContentRevision(id, await read(input), words, senses, baselineIds, protectedIds)
  const output = `output/jlpt/${id}-content-draft.json`
  await fs.mkdir(path.dirname(path.join(root, output)), { recursive: true })
  await write(output, draft)
  console.log(JSON.stringify({ action: 'draft-only; independent final approval required', output, draftHash: hashContent(draft), words: draft.entries.length }))
} else {
  const [draft, review] = await Promise.all([read(input), read(reviewFile)])
  validateLegacyContentRevision(draft, review, baselineIds, protectedIds)
  const journal = { schemaVersion: 1, kind: 'authorized-core-preserving-content', draft, review }
  const journalPath = `content/jlpt/legacy/content-revisions/${draft.id}.json`
  const existing = await optional(journalPath, null)
  if (existing && hashContent(existing) !== hashContent(journal)) throw new Error('Revision ID already has a different journal')
  const next = applyLegacyContentRevision(draft, review, words, senses, baselineIds, protectedIds, Boolean(existing))
  const wordHash = hashContent(words), senseHash = hashContent(senses)
  if (wordHash === hashContent(next.words) && senseHash === hashContent(next.senses)) {
    console.log(JSON.stringify({ action: 'already-applied', journalPath }))
  } else {
    const source = await fs.readFile(path.join(root, 'src/features/learn/contentValidation.ts'), 'utf8')
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    const { validateLearnContent } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
    const issues = validateLearnContent(next.senses, new Set(next.words.map(word => word.id)))
    if (issues.length) throw new Error(`Invalid revised content: ${issues.join('; ')}`)
    const currentGuards = await Promise.all(guards.map(file => optional(file, [])))
    if (hashContent(await read(wordFile)) !== wordHash || hashContent(await read(senseFile)) !== senseHash ||
        hashContent(currentGuards) !== hashContent([references, aliases, active])) throw new Error('Source or approvals changed during preparation')
    await fs.mkdir(path.dirname(path.join(root, journalPath)), { recursive: true })
    await write(journalPath, journal)
    await write(wordFile, next.words)
    await write(senseFile, next.senses)
    console.log(JSON.stringify({ action: 'applied-reviewed-core-preserving-content', words: draft.entries.length, journalPath,
      next: 'Regenerate runtime/legacy inputs, re-review affected classifications, and run both content audits' }))
  }
}
