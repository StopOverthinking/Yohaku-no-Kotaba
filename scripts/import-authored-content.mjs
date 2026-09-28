import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'src/features/vocab/editor-data')
const words = [...JSON.parse(await fs.readFile(path.join(dataDir, 'vocabularyWords.json'), 'utf8')), ...JSON.parse(await fs.readFile(path.join(dataDir, 'themeWords.json'), 'utf8'))]
const map = new Map(words.map((word) => [word.id, word]))
const target = path.join(dataDir, 'learnContent.json')
const previous = JSON.parse(await fs.readFile(target, 'utf8'))
const entries = new Map(previous.map((sense) => [sense.wordId, sense]))
const inputs = process.argv.slice(2)
const imported = new Set()
if (!inputs.length) throw new Error('Provide authored TSV files explicitly; this is not a prebuild generator.')
for (const input of inputs) {
  const lines = (await fs.readFile(path.resolve(root, input), 'utf8')).split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#'))
  for (const line of lines) {
    const columns = line.split('\t')
    if (columns.length !== 9) throw new Error(`Expected 9 columns: ${columns[0]}`)
    const [wordId, meaning, hint, confusion, distinction, ja1, ko1, ja2, ko2] = columns
    if (imported.has(wordId)) throw new Error(`Duplicate authored word: ${wordId}`)
    imported.add(wordId)
    const word = map.get(wordId)
    if (!word || !ko2) throw new Error(`Invalid authored row: ${wordId}`)
    const id = `sense-${wordId}-1`
    const examples = [[ja1, ko1], [ja2, ko2]].map(([ja, ko], i) => {
      const match = /^(.*?)\[([^/\]]+)\/([^\]]+)\](.*)$/u.exec(ja)
      const focus = /\[([^\]]+)\]/u.exec(ko)
      if (!match || !focus || (ja.match(/\[/g) ?? []).length !== 1 || (ko.match(/\[/g) ?? []).length !== 1) throw new Error(`Invalid answer boundaries: ${wordId}`)
      return { id: `${id}-ex-${i + 1}`, version: 1, before: match[1], answer: match[2], after: match[4], reading: match[3], translation: ko.replace(/\[|\]/g, ''), translationTarget: focus[1], difficulty: word.difficulty ?? 30, status: 'draft' }
    })
    // Import is deliberately draft-only: syntactic validity is not editorial review.
    entries.set(wordId, { id, wordId, version: 1, meaning, hint, confusions: [{ japanese: confusion, distinction }], review: { word: false, contrast: false, diversity: false }, examples })
  }
}
await fs.writeFile(target, JSON.stringify([...entries.values()], null, 2) + '\n')
console.log(`Imported ${imported.size} authored rows as drafts; ${entries.size} senses in total.`)
