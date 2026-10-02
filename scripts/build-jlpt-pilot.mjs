import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'
import { buildReviewedAliases } from './lib/jlpt-aliases.mjs'
import { readExamplePruning, verifyExamplePruning } from './lib/example-pruning.mjs'
import { parseManuscript, applyReview, hashContent, lexicalKey, appendReviewedMembership, appendReviewedSources, validateLegacyMembership, validateExampleRevision } from './lib/jlpt-pilot.mjs'
import { validateVerbConsolidation } from './lib/verb-consolidation.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (p) => JSON.parse(await fs.readFile(path.join(root, p), 'utf8'))
const optionalRead = async (p, fallback) => { try { return await read(p) } catch (error) { if (error.code !== 'ENOENT') throw error; return fallback } }
const write = async (p, value) => writeGeneratedFile(path.join(root, p), JSON.stringify(value, null, 2) + '\n')
const base = 'content/jlpt'
const editor = 'src/features/vocab/editor-data'
const exampleVersions = await read(`${base}/pilot/example-versions.json`)
const candidates = (await Promise.all(['n5', 'n4', 'n3', 'n2', 'n1', 'unassigned'].map((l) => read(`${base}/candidates/${l}.json`)))).flat()
const entries = (await Promise.all(['N5', 'N4', 'N3', 'N2', 'N1'].map(async (level) =>
  parseManuscript(await fs.readFile(path.join(root, `${base}/pilot/${level.toLowerCase()}.txt`), 'utf8'), level, candidates, exampleVersions)))).flat()
const exampleIds = new Set(entries.flatMap((entry) => entry.sense.examples.map((example) => example.id)))
if (Object.keys(exampleVersions).some((id) => !exampleIds.has(id))) throw new Error('Unknown revised example ID')
const baseline = await read(`${base}/baseline.json`)
const oldKeys = new Set(baseline.words.map(lexicalKey))
const recordedIds = new Set((await read(`${base}/pilot/published.json`)).map((entry) => entry.id))
const seenIds = new Set()
const duplicateIds = entries.filter((entry) => { if (seenIds.has(entry.word.id)) return true; seenIds.add(entry.word.id); return false })
if (duplicateIds.length) throw new Error('Duplicate ID across levels')
// This importer adds only new words. Reusing legacy words needs the separate alias migration.
// Keep historical IDs until their explicit alias migration; never count them as new.
if (entries.some((e) => oldKeys.has(lexicalKey(e.word)) && !recordedIds.has(e.word.id))) throw new Error('Pilot collides with baseline; explicit reuse required')
await fs.mkdir(path.join(root, 'output/jlpt'), { recursive: true })
await write('output/jlpt/pilot-draft.json', entries)
if (process.argv.includes('--publish')) {
  const reviews = await read(`${base}/pilot/reviews.json`)
  const previouslyPublished = await read(`${base}/pilot/published.json`)
  const revisionIds = new Set((process.argv.find((arg) => arg.startsWith('--revise='))?.slice(9) ?? '').split(',').filter(Boolean))
  if ([...revisionIds].some((id) => !previouslyPublished.some((entry) => entry.id === id))) throw new Error('Unknown revision word ID')
  const approved = entries.map((e) => ({ ...e, sense: applyReview(e, reviews[e.word.id]) }))
  const [words, sets, senses] = await Promise.all(['vocabularyWords', 'vocabularySets', 'learnContent'].map((name) => read(`${editor}/${name}.json`)))
  const [referenceReviews, membershipReceipt, aliasReviews, activeAliasIds] = await Promise.all([
    optionalRead(`${base}/legacy/membership-reviews.json`, []),
    optionalRead(`${base}/pilot/published-membership.json`, { schemaVersion: 1, byLevel: {} }),
    optionalRead(`${base}/legacy/alias-pilot-review.json`, []),
    optionalRead(`${base}/legacy/active-aliases.json`, []),
  ])
  if (membershipReceipt.schemaVersion !== 1) throw new Error('Unknown membership receipt version')
  const consolidationReview = await optionalRead(`${base}/legacy/verb-consolidation.json`, null)
  validateVerbConsolidation(consolidationReview, sets, words, senses, membershipReceipt)
  const pruningJournals = await readExamplePruning(root)
  const pruning = verifyExamplePruning(words, senses, pruningJournals)
  const historicalSenseMap = new Map(pruning.historicalSenses.map(sense => [sense.id, sense]))
  const aliasGroups = buildReviewedAliases(aliasReviews, activeAliasIds, words, pruning.historicalSenses)
  const references = validateLegacyMembership(referenceReviews, words, pruning.historicalSenses, baseline.words, aliasGroups)
  const originalHashes = Object.fromEntries(['vocabularyWords', 'vocabularySets', 'learnContent'].map((name, i) => [name, hashContent([words, sets, senses][i])]))
  const wordById = new Map(words.map((word) => [word.id, word]))
  const senseIndexById = new Map(senses.map((sense, index) => [sense.id, index]))
  const existingKeys = new Set(words.map(lexicalKey))
  const publishedById = new Map(previouslyPublished.map((entry) => [entry.id, entry]))
  for (const entry of approved) {
    const oldWord = wordById.get(entry.word.id)
    const oldSenseIndex = senseIndexById.get(entry.sense.id)
    const oldSense = oldSenseIndex === undefined ? undefined : senses[oldSenseIndex]
    if (oldWord || oldSense) {
      // Re-importing the original manuscript must not resurrect retired examples.
      const historical = historicalSenseMap.get(entry.sense.id)
      if (oldSense && hashContent(oldSense) !== hashContent(historical)) {
        if (hashContent(oldWord) !== hashContent(entry.word) || hashContent(historical) !== hashContent(entry.sense))
          throw new Error(`${entry.word.id}: pruned content requires a new explicit content revision`)
        continue
      }
      if (hashContent(oldWord) !== hashContent(entry.word) || hashContent(oldSense) !== hashContent(entry.sense)) {
        if (!revisionIds.has(entry.word.id) || !oldWord || !oldSense)
          throw new Error(`${entry.word.id}: editor has diverged; refusing to overwrite`)
        validateExampleRevision(oldWord, oldSense, entry.word, entry.sense,
          publishedById.get(entry.word.id)?.publishedHash)
        senses[oldSenseIndex] = entry.sense
      }
      continue
    }
    if (existingKeys.has(lexicalKey(entry.word))) throw new Error('New word already exists under another ID')
    wordById.set(entry.word.id, entry.word); senseIndexById.set(entry.sense.id, senses.length); existingKeys.add(lexicalKey(entry.word))
    words.push(entry.word); senses.push(entry.sense)
  }
  for (const level of ['N5', 'N4', 'N3', 'N2', 'N1']) {
    const wordIds = approved.filter((e) => e.level === level).map((e) => e.word.id)
    const id = `jlpt-level-${level.toLowerCase()}`
    const oldSet = sets.find((s) => s.id === id)
    const priorIds = previouslyPublished.filter((entry) => entry.level === level).map((entry) => entry.id)
    const priorMembership = membershipReceipt.byLevel[level] ?? { wordIds: priorIds, referenceIds: [] }
    const referenceIds = references.filter((entry) => entry.level === level).map((entry) => entry.id)
    appendReviewedMembership(priorMembership.referenceIds, priorMembership.referenceIds, referenceIds)
    if (oldSet) {
      const next = appendReviewedSources(oldSet.wordIds, priorIds, wordIds,
        [...priorMembership.referenceIds, ...(priorMembership.consolidationIds ?? [])], priorMembership.wordIds)
      oldSet.wordIds = appendReviewedMembership(next, next, [...next, ...referenceIds.slice(priorMembership.referenceIds.length)])
      if (referenceIds.length) oldSet.membershipMode = 'explicit'
    } else {
      if (priorIds.length || priorMembership.wordIds.length) throw new Error('Previously published level book is missing')
      sets.push({ id, name: level, order: sets.length, wordIdPrefix: `JLPTLevel${level}`, wordIds: [...wordIds, ...referenceIds],
        ...(referenceIds.length ? { membershipMode: 'explicit' } : {}), updatedAt: '2026-09-29T00:00:00.000Z' })
    }
    membershipReceipt.byLevel[level] = { wordIds: [...sets.find((set) => set.id === id).wordIds], referenceIds,
      ...(priorMembership.consolidationIds ? { consolidationIds: priorMembership.consolidationIds } : {}) }
  }
  // Recheck disk immediately before writing, so an editor save is never silently replaced.
  if (hashContent(await readExamplePruning(root)) !== hashContent(pruningJournals))
    throw new Error('Example pruning changed during import')
  for (const name of Object.keys(originalHashes))
    if (hashContent(await read(`${editor}/${name}.json`)) !== originalHashes[name]) throw new Error('Editor changed during import')
  if (hashContent(await optionalRead(`${base}/legacy/membership-reviews.json`, [])) !== hashContent(referenceReviews))
    throw new Error('Reference approvals changed during import')
  if (hashContent(await optionalRead(`${base}/legacy/alias-pilot-review.json`, [])) !== hashContent(aliasReviews) ||
      hashContent(await optionalRead(`${base}/legacy/active-aliases.json`, [])) !== hashContent(activeAliasIds))
    throw new Error('Alias approvals changed during import')
  if (hashContent(await optionalRead(`${base}/legacy/verb-consolidation.json`, null)) !== hashContent(consolidationReview))
    throw new Error('Verb consolidation review changed during import')
  await write(`${editor}/vocabularyWords.json`, words)
  await write(`${editor}/vocabularySets.json`, sets)
  await write(`${editor}/learnContent.json`, senses)
  await write(`${base}/pilot/published-membership.json`, membershipReceipt)
  await write(`${base}/pilot/published.json`, approved.map((e) => ({
    id: e.word.id, level: e.level, source: e.source, contentHash: e.contentHash,
    publishedHash: hashContent({ word: e.word, sense: e.sense }),
  })))
}
console.log(JSON.stringify({ words: entries.length, examples: entries.reduce((sum, entry) => sum + entry.sense.examples.length, 0),
  byLevel: Object.fromEntries(['N5', 'N4', 'N3', 'N2', 'N1'].map((l) => [l, entries.filter((e) => e.level === l).length])),
  action: process.argv.includes('--publish') ? 'imported-reviewed-pilot' : 'draft-only' }, null, 2))
