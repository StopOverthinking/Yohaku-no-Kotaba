import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { findSimilarSentences } from './lib/sentence-similarity.mjs'

// Integrates existing independent approvals. It never creates editorial approvals.
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const optionalRead = (p, fallback) => fs.existsSync(p) ? read(p) : fallback
const referenceIds = () => Object.values(optionalRead('content/jlpt/pilot/published-membership.json', { byLevel: {} }).byLevel)
  .flatMap(level => level.referenceIds)
const run = (script, args = []) => {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${script}: ${result.stderr || result.stdout}`)
  return result.stdout
}
const registry = read('content/jlpt/pilot/reviews.json')
const publishedIds = new Set(read('content/jlpt/pilot/published.json').map(entry => entry.id))
const pending = []
for (const batch of fs.readdirSync('content/jlpt/batches').filter(name => /^n[1-5]-\d{3}$/.test(name)).sort()) {
  const directory = `content/jlpt/batches/${batch}`
  for (const file of fs.readdirSync(directory).filter(name => /^review-\d{2}\.json$/.test(name)).sort()) {
    const record = read(path.join(directory, file))
    const ids = Array.isArray(record) ? record.map(row => row.wordId) : record.schemaVersion === 2 ? record.entries.map(row => row[0]) : []
    if (!ids.length) throw new Error(`Unsupported review record: ${batch}/${file}`)
    const missing = ids.filter(id => !Object.hasOwn(registry, id))
    const unpublished = ids.filter(id => !publishedIds.has(id))
    if (missing.length || unpublished.length) pending.push({ batch, part: file.slice(7, 9), missing: missing.length, unpublished: unpublished.length })
  }
}
const priorReferences = new Set(referenceIds())
const pendingReferences = optionalRead('content/jlpt/legacy/membership-reviews.json', []).filter(review => !priorReferences.has(review.wordId))
  .map(review => ({ wordId: review.wordId, level: review.level }))
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ action: 'read-only-plan', pending, words: pending.reduce((n, part) => n + part.unpublished, 0), pendingReferences }, null, 2))
} else {
  const before = read('content/jlpt/progress.json')
  const beforeAudit = optionalRead('output/jlpt/latest-content-audit.json', null)
  run('scripts/build-jlpt-pilot.mjs')
  // Check new scenes against the full current corpus before changing app content.
  // A manuscript approval alone cannot detect a later cross-batch scene collision.
  const additions = read('output/jlpt/pilot-draft.json').filter(entry => !publishedIds.has(entry.word.id))
  if (additions.length) {
    const corpus = read('src/features/vocab/editor-data/learnContent.json')
    const newIds = new Set(additions.flatMap(entry => entry.sense.examples.map(example => example.id)))
    const prospective = [...corpus, ...additions.map(entry => entry.sense)]
      .flatMap(sense => sense.examples.map(example => ({ ...example, wordId: sense.wordId, masked: `${example.before}□${example.after}` })))
    const { similar, comparisons } = findSimilarSentences(prospective)
    const newSimilar = similar.filter(pair => newIds.has(pair.a) || newIds.has(pair.b))
    fs.writeFileSync('output/jlpt/prepublication-similarity.json', JSON.stringify({ at: new Date().toISOString(), newWords: additions.length, comparisons, similar: newSimilar }, null, 2) + '\n')
    if (newSimilar.length) throw new Error(`New manuscript scenes require independent review before publication: ${newSimilar.length} pairs; see output/jlpt/prepublication-similarity.json`)
  }
  // Existing accept command validates IDs, source/snapshot hashes, reviewer, scope and count.
  for (const entry of pending) run('scripts/accept-jlpt-batch.mjs', [entry.batch, `--part=${entry.part}`])
  // Publication validates every current manuscript approval before modifying editor data.
  // A reviewer append during this step can fail safely; retry after the new receipt arrives.
  run('scripts/build-jlpt-pilot.mjs', ['--publish'])
  run('scripts/generate-vocab-data.mjs')
  run('scripts/audit-jlpt-expansion.mjs')
  fs.mkdirSync('output/jlpt', { recursive: true })
  const auditOutput = run('scripts/audit-learn-content.mjs', ['--out=output/jlpt/latest-content-audit.json', '--require-complete'])
  const after = read('content/jlpt/progress.json')
  const audit = JSON.parse(auditOutput)
  const result = { at: new Date().toISOString(), acceptedParts: pending, addedWords: after.levelWords - before.levelWords,
    addedNewWords: after.newWords - before.newWords, addedReferenceIds: referenceIds().filter(id => !priorReferences.has(id)),
    addedExamples: after.examples - before.examples, levelWords: after.levelWords, newWords: after.newWords, byLevel: after.byLevel,
    addedCorpusWords: beforeAudit ? audit.words - beforeAudit.words : null,
    addedCorpusExamples: beforeAudit ? audit.examples - beforeAudit.examples : null,
    audit, action: 'local-reviewed-content-only' }
  fs.appendFileSync('content/jlpt/integration-log.jsonl', JSON.stringify(result) + '\n')
  console.log(JSON.stringify(result, null, 2))
}
