import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSemanticHintConfusions, assertSemanticHintSynchronization } from './lib/hint-semantic-review.mjs'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (relative) => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'))
const source = 'src/features/vocab/editor-data/'
const [basic, theme, senses, review, ...candidates] = await Promise.all([
  read(source + 'vocabularyWords.json'), read(source + 'themeWords.json'), read(source + 'learnContent.json'),
  read('content/learn/hint-semantic-review.json'),
  ...['n5', 'n4', 'n3', 'n2', 'n1', 'unassigned'].map((level) => read(`content/jlpt/candidates/${level}.json`)),
])
const words = [...basic, ...theme]
const report = buildSemanticHintConfusions(review, words, senses, candidates.flat())
const sourcePath = path.join(root, source + 'hintConfusions.json')
await fs.mkdir(path.join(root, 'output/hints'), { recursive: true })
await fs.writeFile(path.join(root, 'output/hints/review-audit.json'), JSON.stringify(report, null, 2) + '\n')
if (process.argv.includes('--require-complete') && report.pending.length)
  throw new Error(`${report.pending.length} hint groups still need editorial review`)
if (process.argv.includes('--apply')) await writeGeneratedFile(sourcePath, JSON.stringify(report.supplements, null, 2) + '\n')
else {
  const current = await read(source + 'hintConfusions.json')
  assertSemanticHintSynchronization(current, report.supplements)
}
console.log(JSON.stringify({ words: words.length, senses: senses.length, reviewedSenses: report.coverage.length,
  pendingSenses: report.pending.length, supplementedSenses: Object.keys(report.supplements).length,
  supplementedWords: new Set(Object.keys(report.supplements).map((id) => senses.find((sense) => sense.id === id).wordId)).size,
  selectedLabels: report.displayAudit.reduce((sum, entry) => sum + entry.selected.length, 0),
  displayAuditedSenses: report.displayAudit.length,
  withoutComparisons: report.displayAudit.filter((entry) => !entry.selected.length).length }, null, 2))
