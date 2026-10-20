import fs from 'node:fs/promises'
import { addLearnFurigana } from './lib/learn-furigana.mjs'
import { hashContent } from './lib/jlpt-pilot.mjs'

const read = async path => JSON.parse(await fs.readFile(new URL('../' + path, import.meta.url), 'utf8'))
const [words, senses, overrides, review, ...dictionary] = await Promise.all([
  read('src/features/vocab/editor-data/vocabularyWords.json'), read('src/features/vocab/editor-data/learnContent.json'),
  read('content/learn/furigana-overrides.json'), read('content/learn/pronunciation-review.json'),
  ...['n5', 'n4', 'n3', 'n2', 'n1', 'unassigned'].map(level => read(`content/jlpt/candidates/${level}.json`)),
])
for (const [key, value] of Object.entries({ words, senses, furiganaOverrides: overrides }))
  if (review.sourceHashes[key] !== hashContent(value)) throw new Error(`Pronunciation review is stale: ${key}; review changed content before updating its snapshot`)
const candidates = new Map(dictionary.flat().map(entry => ['lex-' + entry.id, entry]))
const mismatches = words.filter(word => {
  const entry = candidates.get(word.id)
  return entry && (![entry.japanese, ...entry.spellings, ...entry.readings].includes(word.japanese) || !entry.readings.includes(word.reading))
})
if (mismatches.length) throw new Error(`Dictionary notation/reading mismatches: ${mismatches.map(word => word.id).join(', ')}`)
const ids = new Set(senses.flatMap(sense => sense.examples.map(example => example.id)))
const generated = await addLearnFurigana(senses, overrides.filter(row => ids.has(row.exampleId)))
const examples = new Map(generated.senses.flatMap(sense => sense.examples.map(example => [example.id, example])))
if (generated.report.missing.length) throw new Error('Missing surrounding readings')
if (review.scope.words !== words.length || review.scope.senses !== senses.length || review.scope.examples !== examples.size)
  throw new Error('Pronunciation review scope is stale')
const changed = new Set()
for (const change of review.changes) {
  const key = `${change.exampleId}:${change.side}`
  const example = examples.get(change.exampleId)
  if (changed.has(key) || !['before', 'after'].includes(change.side) || example?.[change.side] !== change.text ||
      hashContent(example[`${change.side}Furigana`]) !== change.afterPartsHash)
    throw new Error(`Reviewed pronunciation was lost or changed: ${key}`)
  changed.add(key)
}
console.log(JSON.stringify({ words: words.length, senses: senses.length, examples: examples.size,
  dictionaryLinkedWords: words.filter(word => candidates.has(word.id)).length, dictionaryPairMismatches: mismatches.length,
  surroundingFields: examples.size * 2, reviewedChangedFields: changed.size, missingReadings: 0,
  note: 'Structural regression and dictionary evidence checks; the dated editorial scan is recorded separately and is not an independent language approval.' }, null, 2))
