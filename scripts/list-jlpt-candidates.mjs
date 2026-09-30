import fs from 'node:fs'
import path from 'node:path'
import { lexicalKey } from './lib/jlpt-pilot.mjs'

// Read-only editorial shortlist. No level assignment, reservation or approval.
const level = process.argv[2]?.toLowerCase()
if (!['n5', 'n4', 'n3', 'n2', 'n1', 'unassigned'].includes(level)) throw new Error('Expected candidate pool name')
const option = (name, fallback) => Number(process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback)
const offset = option('offset', 0), count = option('count', 100)
if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(count) || count < 1 || count > 500) throw new Error('Invalid offset/count')
const evidenceLevel = process.argv.find(a => a.startsWith('--evidence-level='))?.split('=')[1]?.toUpperCase()
if (evidenceLevel !== undefined && !/^N[1-5]$/.test(evidenceLevel)) throw new Error('Invalid evidence level')
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const walk = p => fs.readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)])
const existing = [...read('content/jlpt/baseline.json').words, ...read('src/features/vocab/editor-data/vocabularyWords.json'),
  ...walk('content/jlpt/batches').filter(p => /words-\d+\.json$/.test(p)).flatMap(read)]
const ids = new Set(existing.map(w => w.dictionaryId ?? w.id?.replace(/^lex-/, '')))
// Deferred drafts retain their prose for explicit reassignment; don't silently reselect them.
const heldIds = new Set(walk('content/jlpt/batches').filter(p => /held-\d+\.json$/.test(p)).flatMap(read).map(row => row.word?.dictionaryId).filter(Boolean))
const excludedIds = new Set(walk('content/jlpt/batches').filter(p => path.basename(p) === 'selection.json')
  .flatMap(p => read(p).excluded ?? []).map(row => row.dictionaryId).filter(Boolean))
const keys = new Set(existing.map(lexicalKey))
// Include unpublished pilot entries too; reviewed self entries only exclude candidates.
for (const file of ['n5', 'n4', 'n3', 'n2', 'n1']) {
  for (const line of fs.readFileSync(`content/jlpt/pilot/${file}.txt`, 'utf8').split(/\r?\n/).filter(l => l.startsWith('@'))) {
    const [japanese, reading, type, , , , , dictionaryId] = line.slice(1).split('|')
    keys.add(lexicalKey({ japanese, reading, type }))
    if (dictionaryId) ids.add(dictionaryId)
  }
}
const candidates = read(`content/jlpt/candidates/${level}.json`)
const available = candidates.filter(c => {
  if (evidenceLevel && !c.levelEvidence?.levels?.includes(evidenceLevel)) return false
  if (ids.has(c.id) || c.existingWordIds?.length || (!process.argv.includes('--include-held') && heldIds.has(c.id))) return false
  if (!process.argv.includes('--include-excluded') && excludedIds.has(c.id)) return false
  const type = c.senses[0].pos.some(p => p.includes('adjectival nouns') || p.includes('na-adjective')) ? 'na_adj' : 'other'
  return !keys.has(lexicalKey({ japanese: c.japanese, reading: c.reading, type }))
})
const rows = available.slice(offset, offset + count).map(({ id, japanese, reading, spellings, readings, senses, proposedLevel, levelEvidence, priorities }) =>
  ({ id, japanese, reading, spellings, readings, senses, proposedLevel, levelEvidence, priorities }))
const output = `output/jlpt/available-${level}${evidenceLevel ? `-evidence-${evidenceLevel.toLowerCase()}` : ''}-${offset}-${count}.json`
fs.mkdirSync('output/jlpt', { recursive: true })
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), pool: level, evidenceLevel: evidenceLevel ?? null, available: available.length, offset, rows,
  note: 'Unreviewed candidates only. Re-run preflight after choosing and writing words; availability can change. Never use count as finished vocabulary.' }, null, 2) + '\n')
console.log(JSON.stringify({ output, available: available.length, returned: rows.length, preview: rows.slice(0, 12).map(c => ({ id: c.id, japanese: c.japanese, reading: c.reading })) }))
