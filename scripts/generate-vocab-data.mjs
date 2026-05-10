import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const editorDataDir = path.join(projectRoot, 'src', 'features', 'vocab', 'editor-data')
const outputDir = path.join(projectRoot, 'src', 'features', 'vocab', 'data')

const editorPaths = {
  sets: path.join(editorDataDir, 'vocabularySets.json'),
  words: path.join(editorDataDir, 'vocabularyWords.json'),
  themeWordbooks: path.join(editorDataDir, 'themeWordbooks.json'),
  themeWords: path.join(editorDataDir, 'themeWords.json'),
  comparisonWordbooks: path.join(editorDataDir, 'comparisonWordbooks.json'),
  comparisonWords: path.join(editorDataDir, 'comparisonWords.json'),
  comparisonPairs: path.join(editorDataDir, 'comparisonPairs.json'),
}

const sourceFiles = [
  path.join(workspaceRoot, 'vocab', 'vocab_pagodaN3.js'),
  path.join(workspaceRoot, 'vocab', 'vocab_handmade.js'),
  path.join(workspaceRoot, 'vocab', 'vocab_darakwon_verb.js'),
]

function slugify(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function normalizeType(type) {
  const allowed = new Set(['verb', 'noun', 'i_adj', 'na_adj', 'adv', 'expression', 'other'])
  return allowed.has(type) ? type : 'other'
}

function toTsLiteral(value) {
  return JSON.stringify(value, null, 2)
}

async function collectLegacySets() {
  const sets = []
  const context = vm.createContext({
    registerVocabularySet: (set) => {
      sets.push(set)
    },
  })

  for (const file of sourceFiles) {
    try {
      await fs.access(file)
    } catch {
      continue
    }

    const source = await fs.readFile(file, 'utf8')
    vm.runInContext(source, context, { filename: file })
  }

  return sets
}

function buildDataFromLegacySets(legacySets) {
  const sets = []
  const words = []

  legacySets.forEach((set, setIndex) => {
    const setId = slugify(set.name || `set-${setIndex + 1}`) || `set-${setIndex + 1}`
    const wordIds = []

    set.words.forEach((word, wordIndex) => {
      const id = String(word.id ?? `${setId}-${wordIndex + 1}`)
      wordIds.push(id)
      words.push({
        id,
        setId,
        japanese: String(word.japanese ?? ''),
        reading: String(word.reading ?? ''),
        meaning: String(word.meaning ?? ''),
        type: normalizeType(word.type),
        difficulty: Number.isFinite(word.difficulty) ? Number(word.difficulty) : null,
        verbInfo: typeof word.verb_info === 'string' ? word.verb_info : null,
        sourceOrder: wordIndex,
      })
    })

    sets.push({
      id: setId,
      name: String(set.name ?? `Set ${setIndex + 1}`),
      order: setIndex,
      wordIds,
    })
  })

  return { sets, words }
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

async function readEditorSource() {
  const [sets, words, themeWordbooks, themeWords, comparisonWordbooks, comparisonWords, comparisonPairs] = await Promise.all([
    readJsonFile(editorPaths.sets, null),
    readJsonFile(editorPaths.words, null),
    readJsonFile(editorPaths.themeWordbooks, []),
    readJsonFile(editorPaths.themeWords, []),
    readJsonFile(editorPaths.comparisonWordbooks, []),
    readJsonFile(editorPaths.comparisonWords, []),
    readJsonFile(editorPaths.comparisonPairs, []),
  ])

  if (!sets || !words) {
    return null
  }

  return {
    sets,
    words,
    themeWordbooks,
    themeWords,
    comparisonWordbooks,
    comparisonWords,
    comparisonPairs,
  }
}

async function writeOutputFiles(data) {
  await fs.mkdir(editorDataDir, { recursive: true })
  await fs.mkdir(outputDir, { recursive: true })

  const setsFile = `import type { VocabularySet } from '../model/types'\n\nexport const vocabularySets: VocabularySet[] = ${toTsLiteral(data.sets)}\n`
  const wordsFile = `import type { VocabularyWord } from '../model/types'\n\nexport const vocabularyWords: VocabularyWord[] = ${toTsLiteral(data.words)}\n`
  const themeWordbooksFile = `import type { ThemeWordbook } from '../model/types'\n\nexport const themeWordbooks: ThemeWordbook[] = ${toTsLiteral(data.themeWordbooks)}\n`
  const themeWordsFile = `import type { VocabularyWord } from '../model/types'\n\nexport const themeWords: VocabularyWord[] = ${toTsLiteral(data.themeWords)}\n`
  const comparisonWordbooksFile = `import type { ComparisonWordbook } from '../model/types'\n\nexport const comparisonWordbooks: ComparisonWordbook[] = ${toTsLiteral(data.comparisonWordbooks)}\n`
  const comparisonWordsFile = `import type { VocabularyWord } from '../model/types'\n\nexport const comparisonWords: VocabularyWord[] = ${toTsLiteral(data.comparisonWords)}\n`
  const comparisonPairsFile = `import type { ComparisonPair } from '../model/types'\n\nexport const comparisonPairs: ComparisonPair[] = ${toTsLiteral(data.comparisonPairs)}\n`
  const indexFile = `export { comparisonPairs } from './comparisonPairs'\nexport { comparisonWords } from './comparisonWords'\nexport { comparisonWordbooks } from './comparisonWordbooks'\nexport { themeWords } from './themeWords'\nexport { themeWordbooks } from './themeWordbooks'\nexport { vocabularySets } from './vocabularySets'\nexport { vocabularyWords } from './vocabularyWords'\n`

  await Promise.all([
    fs.writeFile(editorPaths.sets, `${JSON.stringify(data.sets, null, 2)}\n`, 'utf8'),
    fs.writeFile(editorPaths.words, `${JSON.stringify(data.words, null, 2)}\n`, 'utf8'),
    fs.writeFile(editorPaths.themeWordbooks, `${JSON.stringify(data.themeWordbooks, null, 2)}\n`, 'utf8'),
    fs.writeFile(editorPaths.themeWords, `${JSON.stringify(data.themeWords, null, 2)}\n`, 'utf8'),
    fs.writeFile(editorPaths.comparisonWordbooks, `${JSON.stringify(data.comparisonWordbooks, null, 2)}\n`, 'utf8'),
    fs.writeFile(editorPaths.comparisonWords, `${JSON.stringify(data.comparisonWords, null, 2)}\n`, 'utf8'),
    fs.writeFile(editorPaths.comparisonPairs, `${JSON.stringify(data.comparisonPairs, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(outputDir, 'vocabularySets.ts'), setsFile, 'utf8'),
    fs.writeFile(path.join(outputDir, 'vocabularyWords.ts'), wordsFile, 'utf8'),
    fs.writeFile(path.join(outputDir, 'themeWordbooks.ts'), themeWordbooksFile, 'utf8'),
    fs.writeFile(path.join(outputDir, 'themeWords.ts'), themeWordsFile, 'utf8'),
    fs.writeFile(path.join(outputDir, 'comparisonWordbooks.ts'), comparisonWordbooksFile, 'utf8'),
    fs.writeFile(path.join(outputDir, 'comparisonWords.ts'), comparisonWordsFile, 'utf8'),
    fs.writeFile(path.join(outputDir, 'comparisonPairs.ts'), comparisonPairsFile, 'utf8'),
    fs.writeFile(path.join(outputDir, 'index.ts'), indexFile, 'utf8'),
  ])
}

async function main() {
  const editorSource = await readEditorSource()
  const legacySets = await collectLegacySets()

  if (legacySets.length > 0) {
    const legacyData = buildDataFromLegacySets(legacySets)
    await writeOutputFiles({
      sets: legacyData.sets,
      words: legacyData.words,
      themeWordbooks: editorSource?.themeWordbooks ?? [],
      themeWords: editorSource?.themeWords ?? [],
      comparisonWordbooks: editorSource?.comparisonWordbooks ?? [],
      comparisonWords: editorSource?.comparisonWords ?? [],
      comparisonPairs: editorSource?.comparisonPairs ?? [],
    })
    return
  }

  if (!editorSource) {
    return
  }

  await writeOutputFiles(editorSource)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
