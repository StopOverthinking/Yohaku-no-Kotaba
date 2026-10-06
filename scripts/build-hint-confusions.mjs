import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanHintConfusions } from './lib/hint-confusion-scan.mjs'
import { buildHintConfusions } from './lib/hint-confusion-review.mjs'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (relative) => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'))
const source = 'src/features/vocab/editor-data/'
const [basic, theme, senses, review, ...candidates] = await Promise.all([
  read(source + 'vocabularyWords.json'), read(source + 'themeWords.json'), read(source + 'learnContent.json'),
  read('content/learn/hint-confusions-review.json'),
  ...['n5', 'n4', 'n3', 'n2', 'n1', 'unassigned'].map((level) => read(`content/jlpt/candidates/${level}.json`)),
])
const words = [...basic, ...theme]
const scan = scanHintConfusions(words, senses, candidates.flat())
const report = buildHintConfusions(scan, review, words, senses)
const sourcePath = path.join(root, source + 'hintConfusions.json')
await fs.mkdir(path.join(root, 'output/hints'), { recursive: true })
await fs.writeFile(path.join(root, 'output/hints/review-audit.json'), JSON.stringify({ sourceHash: scan.sourceHash, ...report }, null, 2) + '\n')
if (process.argv.includes('--require-complete') && report.pending.length)
  throw new Error(`${report.pending.length} hint groups still need editorial review`)
if (process.argv.includes('--apply')) await writeGeneratedFile(sourcePath, JSON.stringify(report.supplements, null, 2) + '\n')
else {
  const current = await read(source + 'hintConfusions.json')
  if (JSON.stringify(current) !== JSON.stringify(report.supplements)) throw new Error('Hint supplements are not synchronized; run with --apply')
}
console.log(JSON.stringify({ words: words.length, senses: senses.length, reviewedGroups: scan.groups.length - report.pending.length,
  pendingGroups: report.pending.length, supplementedSenses: Object.keys(report.supplements).length,
  supplementedWords: new Set(Object.keys(report.supplements).map((id) => senses.find((sense) => sense.id === id).wordId)).size,
  acceptedPairs: report.pairs.length, suppressedSelfLabels: report.suppressed.length }, null, 2))
