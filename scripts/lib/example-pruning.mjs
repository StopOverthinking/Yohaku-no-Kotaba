import fs from 'node:fs/promises'
import path from 'node:path'
import { hashContent } from './jlpt-pilot.mjs'

export async function readExamplePruning(root) {
  const directory = path.join(root, 'content/learn/example-pruning')
  let names
  try { names = await fs.readdir(directory) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
  return Promise.all(names.filter(name => name.endsWith('.json')).sort().map(async name =>
    JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))))
}

/** Deletion-only journals prove that historical approvals still cover the
 * surviving text. Never rewrite an old review hash or silently bless new text.
 * The restored corpus is for historical verification only, never publication.
 */
export function verifyExamplePruning(words, senses, journals) {
  const wordMap = new Map(words.map(word => [word.id, word]))
  const current = new Map(senses.map(sense => [sense.id, sense]))
  if (current.size !== senses.length) throw new Error('Duplicate current sense ID')
  const ids = new Set(), retirements = []
  for (const journal of [...journals].reverse()) {
    if (journal.schemaVersion !== 1 || journal.scope !== 'same-meaning-example-pruning' ||
        !journal.id || ids.has(journal.id) || !journal.authorization?.trim() ||
        !journal.review?.method?.trim() || !Number.isFinite(Date.parse(journal.review?.reviewedAt)) ||
        !Array.isArray(journal.entries) || !journal.entries.length || journal.entriesHash !== hashContent(journal.entries))
      throw new Error('Invalid example pruning journal')
    ids.add(journal.id)
    const seen = new Set()
    for (const entry of journal.entries) {
      const sense = current.get(entry.senseId)
      if (!sense || seen.has(sense.id) || hashContent(wordMap.get(sense.wordId)) !== entry.wordHash ||
          hashContent(sense) !== entry.afterHash || !sense.examples.length ||
          sense.examples.some(example => example.status !== 'reviewed') ||
          !Array.isArray(entry.removed) || !entry.removed.length || !Array.isArray(entry.originalOrder))
        throw new Error(`${entry.senseId}: pruning source changed or invalid survivors`)
      seen.add(sense.id)
      const examples = new Map(sense.examples.map(example => [example.id, example]))
      const survivors = new Map(examples)
      for (const removal of entry.removed) {
        const { example, replacementId, reason } = removal
        if (!example?.id || examples.has(example.id) || !survivors.has(replacementId) || !reason?.trim())
          throw new Error(`${sense.id}: invalid removal or replacement`)
        examples.set(example.id, example)
        retirements.push({ senseId: sense.id, senseVersion: sense.version,
          exampleId: example.id, exampleVersion: example.version,
          replacementId, replacementVersion: survivors.get(replacementId).version })
      }
      if (new Set(entry.originalOrder).size !== examples.size || entry.originalOrder.length !== examples.size ||
          entry.originalOrder.some(id => !examples.has(id)) ||
          hashContent(entry.originalOrder.filter(id => survivors.has(id))) !== hashContent(sense.examples.map(example => example.id)))
        throw new Error(`${sense.id}: pruning cannot add or reorder examples`)
      const before = { ...sense, examples: entry.originalOrder.map(id => examples.get(id)) }
      if (hashContent(before) !== entry.beforeHash) throw new Error(`${sense.id}: pruning changed retained content or metadata`)
      current.set(sense.id, before)
    }
  }
  // Follow successive retirements to a currently reviewed survivor.
  const key = row => `${row.senseId}@${row.senseVersion}/${row.exampleId}@${row.exampleVersion}`
  const byId = new Map(retirements.map(row => [key(row), row]))
  if (byId.size !== retirements.length) throw new Error('Duplicate retired example')
  const liveSenses = new Map(senses.map(sense => [sense.id, sense]))
  const liveExamples = new Set(senses.flatMap(sense => sense.examples.map(example => example.id)))
  const resolved = retirements.map(row => {
    if (liveExamples.has(row.exampleId)) throw new Error('Retired example was resurrected')
    let target = row
    const visited = new Set([key(row)])
    while (true) {
      const next = byId.get(`${target.senseId}@${target.senseVersion}/${target.replacementId}@${target.replacementVersion}`)
      if (!next) break
      if (visited.has(key(next))) throw new Error('Cyclic example retirement')
      visited.add(key(next)); target = next
    }
    const sense = liveSenses.get(row.senseId)
    if (sense?.version !== row.senseVersion || !sense.examples.some(example =>
      example.id === target.replacementId && example.version === target.replacementVersion && example.status === 'reviewed'))
      throw new Error('Retirement must resolve to a current reviewed example')
    return { ...row, replacementId: target.replacementId, replacementVersion: target.replacementVersion }
  })
  return { historicalSenses: senses.map(sense => current.get(sense.id)), retirements: resolved,
    report: { journals: journals.length, removedExamples: resolved.length, sourceHash: hashContent(journals) } }
}
