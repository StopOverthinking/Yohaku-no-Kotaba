import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { lexicalKey, parseManuscript } from './lib/jlpt-pilot.mjs'

const started = performance.now()
const [batch, index] = process.argv.slice(2)
if (!/^n[1-5]-\d{3}$/.test(batch ?? '') || !/^\d{2}$/.test(index ?? '')) throw new Error('Expected batch and two-digit part')
const directory = `content/jlpt/batches/${batch}`
const target = `${directory}/words-${index}.json`
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const walk = p => fs.readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)])
const words = read(target), issues = []
const candidates = walk('content/jlpt/candidates').filter(p => p.endsWith('.json')).flatMap(read)
const ids = new Map(candidates.map(c => [c.id, c]))
const existing = [...read('content/jlpt/baseline.json').words, ...read('src/features/vocab/editor-data/vocabularyWords.json'),
  ...walk('content/jlpt/batches').filter(p => /words-\d+\.json$/.test(p) && path.resolve(p) !== path.resolve(target)).flatMap(read)]
const existingIds = new Set(existing.map(w => w.dictionaryId ?? w.id?.replace(/^lex-/, '')))
const keys = new Set(existing.map(lexicalKey))
const required = ['japanese', 'reading', 'type', 'meaning', 'hint', 'confusion', 'distinction', 'dictionaryId', 'level', 'levelNote']
for (const w of words) {
  const label = w.japanese ?? '(missing word)'
  for (const field of required) if (typeof w[field] !== 'string' || !w[field].trim() || /[|\r\n]/.test(w[field])) issues.push(`${label}: invalid ${field}`)
  if (required.some(field => typeof w[field] !== 'string')) continue
  if (w.level !== batch.slice(0, 2).toUpperCase()) issues.push(`${label}: wrong level`)
  if (existingIds.has(w.dictionaryId) || keys.has(lexicalKey(w))) issues.push(`${label}: existing dictionary ID or canonical spelling/reading`)
  existingIds.add(w.dictionaryId); keys.add(lexicalKey(w))
  const candidate = ids.get(w.dictionaryId)
  if (!candidate || ![...candidate.spellings, ...candidate.readings].includes(w.japanese) || !candidate.readings.includes(w.reading)) issues.push(`${label}: dictionary mismatch`)
  if (!['noun', 'verb', 'i_adj', 'na_adj', 'adv', 'expression', 'other'].includes(w.type)) issues.push(`${label}: invalid type`)
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(w.hint)) issues.push(`${label}: Japanese in hint`)
  if (w.type === 'verb' && candidate && !candidate.senses[0].pos.some(p => /Ichidan|Godan|^Kuru verb - special class$|^suru verb - /.test(p))) issues.push(`${label}: unsupported leading verb group`)
}
let examples = 0
if (process.argv.includes('--examples')) {
  const text = fs.readFileSync(`${directory}/examples-${index}.txt`, 'utf8')
  const chunks = text.split(/(?=^@)/m).filter(s => s.trim())
  const entries = []
  for (const chunk of chunks) {
    try { entries.push(...parseManuscript(chunk, batch.slice(0, 2).toUpperCase(), candidates)) }
    catch (e) { issues.push(e.message) }
  }
  const expectedHeaders = words.map(w => '@' + [w.japanese, w.reading, w.type, w.meaning, w.hint, w.confusion, w.distinction, w.dictionaryId].join('|'))
  if (JSON.stringify(text.split(/\r?\n/).filter(l => l.startsWith('@'))) !== JSON.stringify(expectedHeaders)) issues.push('Metadata/manuscript order or content mismatch')
  const normalize = s => s.replace(/[\s、。！？「」]/g, '')
  const corpus = read('src/features/vocab/editor-data/learnContent.json')
  const masks = new Set(corpus.flatMap(s => s.examples.map(e => normalize(e.before + '□' + e.after))))
  const own = new Set()
  for (const entry of entries) for (const e of entry.sense.examples) {
    examples++
    const mask = normalize(e.before + '□' + e.after)
    if (masks.has(mask) || own.has(mask)) issues.push(`${entry.word.japanese}: duplicate masked sentence`)
    own.add(mask)
    if (!(e.before + e.after).trim() || !e.translationTarget || !e.translation.includes(e.translationTarget)) issues.push(`${entry.word.japanese}: missing context/translation target`)
    for (const reading of [entry.word.reading, e.reading].filter(s => s.length >= 3)) if ((e.before + e.after).includes(reading)) issues.push(`${entry.word.japanese}: reading exposed`)
  }
}
const report = { at: new Date().toISOString(), batch, index, phase: process.argv.includes('--examples') ? 'manuscript' : 'metadata', words: words.length, examples, milliseconds: performance.now() - started, issues }
fs.appendFileSync(`${directory}/preflight.jsonl`, JSON.stringify(report) + '\n')
console.log(JSON.stringify(report, null, 2))
if (issues.length) process.exitCode = 1
