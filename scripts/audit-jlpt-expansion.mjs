import fs from 'node:fs/promises'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lexicalKey, hashContent, validateLegacyMembership, appendReviewedSources } from './lib/jlpt-pilot.mjs'
import { evaluatePracticalScope } from './lib/jlpt-scope.mjs'
import { buildReviewedAliases } from './lib/jlpt-aliases.mjs'
import { validateLegacyRevisionJournals } from './lib/legacy-example-revision.mjs'
import { validateLegacyContentJournals } from './lib/legacy-content-revision.mjs'
import { readExamplePruning, verifyExamplePruning } from './lib/example-pruning.mjs'
import { validateVerbConsolidation } from './lib/verb-consolidation.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (p) => JSON.parse(await fs.readFile(path.join(root, p), 'utf8'))
const optionalRead = async (p, fallback) => { try { return await read(p) } catch (error) { if (error.code !== 'ENOENT') throw error; return fallback } }
const [baseline, words, sets, senses, published] = await Promise.all([
  'content/jlpt/baseline.json', 'src/features/vocab/editor-data/vocabularyWords.json',
  'src/features/vocab/editor-data/vocabularySets.json', 'src/features/vocab/editor-data/learnContent.json',
  'content/jlpt/pilot/published.json',
].map(read))
const wordMap = new Map(words.map((w) => [w.id, w]))
const senseMap = new Map(senses.map((s) => [s.wordId, []]))
for (const s of senses) senseMap.get(s.wordId).push(s)
const prior = new Set(baseline.words.map(lexicalKey))
const issues = [], entries = []
let historicalSenses = senses, examplePruning = null
try {
  const pruning = verifyExamplePruning(words, senses, await readExamplePruning(root))
  historicalSenses = pruning.historicalSenses
  examplePruning = pruning.report
} catch (error) { issues.push(error.message) }
const historicalByWord = new Map()
for (const sense of historicalSenses) {
  if (!historicalByWord.has(sense.wordId)) historicalByWord.set(sense.wordId, [])
  historicalByWord.get(sense.wordId).push(sense)
}
const revisionDirectory = 'content/jlpt/legacy/revisions'
let revisionNames = []
try { revisionNames = await fs.readdir(path.join(root, revisionDirectory)) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const legacyRevisions = await Promise.all(revisionNames.filter(name => name.endsWith('.json')).sort().map(name => read(`${revisionDirectory}/${name}`)))
let revisedLegacy = { journals: 0, senses: 0 }
try { revisedLegacy = validateLegacyRevisionJournals(legacyRevisions, words, historicalSenses, baseline.words.map(word => word.id)) }
catch (error) { issues.push(error.message) }
const contentRevisionDirectory = 'content/jlpt/legacy/content-revisions'
let contentRevisionNames = []
try { contentRevisionNames = await fs.readdir(path.join(root, contentRevisionDirectory)) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const legacyContentRevisions = await Promise.all(contentRevisionNames.filter(name => name.endsWith('.json')).sort().map(name => read(`${contentRevisionDirectory}/${name}`)))
let revisedLegacyContent = { journals: 0, words: 0 }
try { revisedLegacyContent = validateLegacyContentJournals(legacyContentRevisions, words, historicalSenses, baseline.words.map(word => word.id)) }
catch (error) { issues.push(error.message) }
const aliasReviews = await optionalRead('content/jlpt/legacy/alias-pilot-review.json', [])
const activeAliasIds = await optionalRead('content/jlpt/legacy/active-aliases.json', [])
let aliasGroups = []
try { aliasGroups = buildReviewedAliases(aliasReviews, activeAliasIds, words, historicalSenses) }
catch (error) { issues.push(error.message) }
const [referenceReviews, membershipReceipt] = await Promise.all([
  optionalRead('content/jlpt/legacy/membership-reviews.json', []),
  optionalRead('content/jlpt/pilot/published-membership.json', null),
])
const consolidationReview = await optionalRead('content/jlpt/legacy/verb-consolidation.json', null)
let consolidation = null
try { consolidation = validateVerbConsolidation(consolidationReview, sets, words, senses, membershipReceipt) }
catch (error) { issues.push(error.message) }
const approvalReceipt = consolidation?.baseMembership ?? membershipReceipt
try {
  const references = validateLegacyMembership(referenceReviews, words, historicalSenses, baseline.words, aliasGroups)
  if (membershipReceipt) {
    if (membershipReceipt.schemaVersion !== 1) throw new Error('Unknown membership receipt version')
    for (const level of ['N5', 'N4', 'N3', 'N2', 'N1']) {
      const receipt = approvalReceipt.byLevel[level]
      const book = sets.find((set) => set.id === `jlpt-level-${level.toLowerCase()}`)
      if (!receipt || (!consolidation && hashContent(book?.wordIds) !== hashContent(receipt.wordIds))) issues.push(`${level}: membership changed since publication`)
      const approvedIds = references.filter((entry) => entry.level === level).map((entry) => entry.id)
      if (receipt?.referenceIds.some((id, index) => approvedIds[index] !== id)) issues.push(`${level}: published reference approval changed`)
      if (receipt?.referenceIds.length && book?.membershipMode !== 'explicit') issues.push(`${level}: references require explicit membership`)
      if (receipt && book) {
        const authored = published.filter((entry) => entry.level === level).map((entry) => entry.id)
        appendReviewedSources(consolidation ? receipt.wordIds : book.wordIds, authored, authored, receipt.referenceIds, receipt.wordIds)
      }
    }
  }
} catch (error) { issues.push(error.message) }
const members = new Set(), unique = new Set()
for (const level of ['N5', 'N4', 'N3', 'N2', 'N1']) {
  const book = sets.find((s) => s.id === `jlpt-level-${level.toLowerCase()}`)
  if (!book) { issues.push(`${level}: missing wordbook`); continue }
  for (const id of book.wordIds) {
    const word = wordMap.get(id)
    if (!word) { issues.push(`${id}: missing word`); continue }
    if (members.has(id) || unique.has(lexicalKey(word))) issues.push(`${id}: duplicate level membership or lexical key`)
    members.add(id); unique.add(lexicalKey(word))
    const wordSenses = senseMap.get(id) ?? []
    const ready = wordSenses.length > 0 && wordSenses.every((s) => s.review.word && s.review.contrast && s.review.diversity &&
      s.examples.length >= 1 && s.examples.every((e) => e.status === 'reviewed'))
    if (!ready) issues.push(`${id}: incomplete senses/examples`)
    entries.push({ id, level, new: !prior.has(lexicalKey(word)), ready, examples: wordSenses.reduce((n, s) => n + s.examples.length, 0) })
  }
}
for (const entry of published) {
  const word = wordMap.get(entry.id), content = historicalByWord.get(entry.id)
  if (!word || content?.length !== 1 || hashContent({ word, sense: content[0] }) !== entry.publishedHash)
    issues.push(`${entry.id}: content changed since recorded pilot review; re-review required`)
}
const scope = await read('content/jlpt/scope.json')
const byLevel = Object.fromEntries(['N5', 'N4', 'N3', 'N2', 'N1'].map((l) => [l, entries.filter((e) => e.level === l).length]))
const baseSelectionSourceHash = hashContent({ published, referenceReviews, membershipReceipt: approvalReceipt, aliasReviews, activeAliasIds, legacyRevisions, legacyContentRevisions })
const selectionSourceHash = consolidation ? hashContent({ baseSelectionSourceHash, consolidationReview }) : baseSelectionSourceHash
let selection = { complete: false, finalCount: null }
try {
  // Keep the original independent approval bound to its exact original corpus.
  // A separately reviewed membership-only migration cannot rewrite that approval.
  if (consolidation) {
    const binding = scope.membershipConsolidation
    if (!binding || binding.reviewHash !== consolidation.manifestHash || binding.baseSourceHash !== baseSelectionSourceHash ||
        binding.baseUniqueWords !== unique.size - consolidation.addedWords ||
        hashContent(binding.addedByLevel) !== hashContent(consolidation.addedByLevel))
      throw new Error('Verb consolidation review is missing or stale')
  } else if (scope.membershipConsolidation) throw new Error('Required verb consolidation review missing')
  selection = evaluatePracticalScope(scope, { sourceHash: baseSelectionSourceHash,
    uniqueWords: unique.size - (consolidation?.addedWords ?? 0), byLevel: consolidation?.baseByLevel ?? byLevel })
  if (selection.finalCount !== null) selection.finalCount += consolidation?.addedWords ?? 0
}
catch (error) { issues.push(error.message) }
const report = {
  schemaVersion: 2, targetPolicy: scope.policy, provisionalRange: scope.provisionalRange,
  approximateTarget: scope.approximateTarget ?? null,
  targetUniqueWords: selection.finalCount, targetNewWords: null, selectionSourceHash,
  levelWords: unique.size, newWords: entries.filter((e) => e.new).length,
  readyWords: entries.filter((e) => e.ready).length,
  examples: entries.reduce((n, e) => n + e.examples, 0),
  byLevel,
  activeAliasGroups: aliasGroups.length,
  ...(consolidation ? { membershipConsolidation: { addedWords: consolidation.addedWords, coveredWords: consolidation.coveredWords,
    addedByLevel: consolidation.addedByLevel, reviewHash: consolidation.manifestHash,
    reviewScope: consolidationReview.reviewScope, preservedIndependentSelectionHash: baseSelectionSourceHash } } : {}),
  revisedLegacy,
  revisedLegacyContent,
  examplePruning,
  complete: selection.complete && !issues.length,
  completionScope: consolidation ? 'original-independent-content-selection plus separately reviewed user-authorized membership consolidation; no new independent content approval claimed'
    : 'reviewed-vocabulary-content-selection; regression, browser performance and public release are verified separately',
  issues,
  remaining: selection.complete && !issues.length ? [] : [
    'Complete and independently review the selected practical N5-N1 content; no fixed count quota',
    ...issues,
  ],
}
await writeGeneratedFile(path.join(root, 'content/jlpt/progress.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (issues.length || (process.argv.includes('--require-target') && !report.complete)) process.exitCode = 1
