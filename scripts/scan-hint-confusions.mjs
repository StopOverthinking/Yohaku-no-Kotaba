import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanHintConfusions } from './lib/hint-confusion-scan.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (relative) => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'))
const [words, theme, senses, ...candidates] = await Promise.all([
  read('src/features/vocab/editor-data/vocabularyWords.json'), read('src/features/vocab/editor-data/themeWords.json'),
  read('src/features/vocab/editor-data/learnContent.json'),
  ...['n5', 'n4', 'n3', 'n2', 'n1', 'unassigned'].map((level) => read(`content/jlpt/candidates/${level}.json`)),
])
const report = scanHintConfusions([...words, ...theme], senses, candidates.flat())
await fs.mkdir(path.join(root, 'output/hints'), { recursive: true })
await fs.writeFile(path.join(root, 'output/hints/scan.json'), JSON.stringify(report, null, 2) + '\n')
const nodes = new Map(report.nodes.map((node) => [node.id, node]))
const rows = report.groups.map((group, index) => `${index}\t${group.id}\t${[...new Map(group.members.map((id) => {
  const node = nodes.get(id)
  return [`${node.family}|${node.meaning}`, `${node.japanese}(${node.meaning})`]
})).values()].join(' | ')}`)
await fs.writeFile(path.join(root, 'output/hints/groups.tsv'), rows.join('\n') + '\n')
console.log(JSON.stringify({ words: words.length + theme.length, senses: senses.length,
  dictionaryLinkedSenses: report.nodes.filter((node) => node.dictionaryId).length,
  reviewedComparisonPairs: report.existingPairs.length, candidatePairs: report.pairs.length,
  koreanGroups: report.groups.filter((group) => group.id.startsWith('ko:')).length,
  dictionaryGroups: report.groups.filter((group) => group.id.startsWith('en:')).length,
  selfOnly: report.selfOnly, output: 'output/hints/scan.json' }, null, 2))
