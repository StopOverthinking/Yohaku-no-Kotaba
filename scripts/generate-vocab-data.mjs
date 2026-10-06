import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { partitionLearnContent } from './lib/learn-content-shards.mjs'
import { addLearnFurigana } from './lib/learn-furigana.mjs'
import { writeGeneratedFile } from './lib/write-generated-file.mjs'
import { buildReviewedAliases } from './lib/jlpt-aliases.mjs'
import { readReviewedExampleHistory, verifyReviewedExampleHistory } from './lib/reviewed-example-history.mjs'
import ts from 'typescript'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
// Historical path retained for canonical JSON and immutable source/audit references.
const sourceDataDir = path.join(projectRoot, 'src', 'features', 'vocab', 'editor-data')
const outputDir = path.join(projectRoot, 'src', 'features', 'vocab', 'data')

const sourcePaths = {
  learnContent: path.join(sourceDataDir, 'learnContent.json'),
  sets: path.join(sourceDataDir, 'vocabularySets.json'),
  words: path.join(sourceDataDir, 'vocabularyWords.json'),
  themeWordbooks: path.join(sourceDataDir, 'themeWordbooks.json'),
  themeWords: path.join(sourceDataDir, 'themeWords.json'),
  comparisonWordbooks: path.join(sourceDataDir, 'comparisonWordbooks.json'),
  comparisonWords: path.join(sourceDataDir, 'comparisonWords.json'),
  comparisonPairs: path.join(sourceDataDir, 'comparisonPairs.json'),
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

async function readVocabSource() {
  const [sets, words, themeWordbooks, themeWords, comparisonWordbooks, comparisonWords, comparisonPairs] = await Promise.all([
    readJsonFile(sourcePaths.sets, null),
    readJsonFile(sourcePaths.words, null),
    readJsonFile(sourcePaths.themeWordbooks, []),
    readJsonFile(sourcePaths.themeWords, []),
    readJsonFile(sourcePaths.comparisonWordbooks, []),
    readJsonFile(sourcePaths.comparisonWords, []),
    readJsonFile(sourcePaths.comparisonPairs, []),
  ])

  if (!sets || !words) {
    return null
  }

  return {
    learnContent: await readJsonFile(sourcePaths.learnContent, []),
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
  const pruning = verifyReviewedExampleHistory(data.words, data.learnContent ?? [], await readReviewedExampleHistory(projectRoot))
  const aliasRoot = path.join(projectRoot, 'content/jlpt/legacy')
  const aliases = buildReviewedAliases(
    await readJsonFile(path.join(aliasRoot, 'alias-pilot-review.json'), []),
    await readJsonFile(path.join(aliasRoot, 'active-aliases.json'), []),
    data.words, pruning.historicalSenses,
  )
  await fs.mkdir(outputDir, { recursive: true })
  await writeGeneratedFile(path.join(outputDir, 'exampleRetirements.ts'),
    `import type { ExampleRetirement } from '../../learn/contextExampleRetirements'\n\nexport const exampleRetirements: ExampleRetirement[] = ${toTsLiteral(pruning.retirements)}\n`)
  await writeGeneratedFile(path.join(outputDir, 'learnAliases.ts'),
    `import type { ContextAliasGroup } from '../../learn/contextTypes'\n\nexport const learnAliases: ContextAliasGroup[] = ${toTsLiteral(aliases)}\n`)
  await fs.mkdir(sourceDataDir, { recursive: true })
  await fs.mkdir(outputDir, { recursive: true })
  const retiredIds = new Set(pruning.retirements.map(row => row.exampleId))
  const furiganaOverrides = await readJsonFile(path.join(projectRoot, 'content/learn/furigana-overrides.json'), [])
  // Only validated retirements may be absent when reading older correction files.
  const furigana = await addLearnFurigana(data.learnContent ?? [], furiganaOverrides.filter(row => !retiredIds.has(row.exampleId)))
  const furiganaReportDir = path.join(projectRoot, 'output/furigana')
  await fs.mkdir(furiganaReportDir, { recursive: true })
  await writeGeneratedFile(path.join(furiganaReportDir, 'review.json'), `${JSON.stringify(furigana.report, null, 2)}\n`)
  if (furigana.report.missing.length) throw new Error(`Missing furigana readings: ${furigana.report.missing.length}; see output/furigana/review.json`)
  const { index: contentIndex, shards } = partitionLearnContent(furigana.senses)
  // Run the same validator used by loaded shards, without requiring Node's TS support.
  const validationSource = await fs.readFile(path.join(projectRoot, 'src/features/learn/contentValidation.ts'), 'utf8')
  const validationJs = ts.transpileModule(validationSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  const { validateLearnContent } = await import(`data:text/javascript;base64,${Buffer.from(validationJs).toString('base64')}`)
  const issues = validateLearnContent(furigana.senses, new Set([...data.words, ...data.themeWords].map((word) => word.id)))
  await writeGeneratedFile(path.join(outputDir, 'learnContentValidation.ts'),
    `// Generated from the complete corpus; loaded shards are also validated at runtime.\nexport const learnContentIssues: string[] = ${toTsLiteral(issues)}\n`, 'utf8')
  const shardDir = path.join(outputDir, 'learnContentShards')
  await fs.mkdir(shardDir, { recursive: true })
  await Promise.all(shards.map((content, index) => writeGeneratedFile(path.join(shardDir, `${index}.ts`),
    `import type { LearnSense } from '../../../learn/contextTypes'\n\nconst content: LearnSense[] = ${toTsLiteral(content)}\nexport default content\n`, 'utf8')))
  await writeGeneratedFile(path.join(outputDir, 'learnContentIndex.ts'),
    `import type { LearnSenseIndex } from '../../learn/contextTypes'\n\nexport const learnContentIndex: (LearnSenseIndex & { shard: number; meaning: string })[] = ${toTsLiteral(contentIndex)}\n`, 'utf8')
  await writeGeneratedFile(path.join(outputDir, 'learnContentLoaders.ts'),
    `import type { LearnSense } from '../../learn/contextTypes'\n\nexport const learnContentLoaders: Record<number, () => Promise<LearnSense[]>> = {\n${shards.map((_, index) => `  ${index}: () => import('./learnContentShards/${index}').then((module) => module.default),`).join('\n')}\n}\n`, 'utf8')

  const setsFile = `import type { VocabularySet } from '../model/types'\n\nexport const vocabularySets: VocabularySet[] = ${toTsLiteral(data.sets)}\n`
  const wordsFile = `import type { VocabularyWord } from '../model/types'\n\nexport const vocabularyWords: VocabularyWord[] = ${toTsLiteral(data.words)}\n`
  const themeWordbooksFile = `import type { ThemeWordbook } from '../model/types'\n\nexport const themeWordbooks: ThemeWordbook[] = ${toTsLiteral(data.themeWordbooks)}\n`
  const themeWordsFile = `import type { VocabularyWord } from '../model/types'\n\nexport const themeWords: VocabularyWord[] = ${toTsLiteral(data.themeWords)}\n`
  const comparisonWordbooksFile = `import type { ComparisonWordbook } from '../model/types'\n\nexport const comparisonWordbooks: ComparisonWordbook[] = ${toTsLiteral(data.comparisonWordbooks)}\n`
  const comparisonWordsFile = `import type { VocabularyWord } from '../model/types'\n\nexport const comparisonWords: VocabularyWord[] = ${toTsLiteral(data.comparisonWords)}\n`
  const comparisonPairsFile = `import type { ComparisonPair } from '../model/types'\n\nexport const comparisonPairs: ComparisonPair[] = ${toTsLiteral(data.comparisonPairs)}\n`
  const indexFile = `export { comparisonPairs } from './comparisonPairs'\nexport { comparisonWords } from './comparisonWords'\nexport { comparisonWordbooks } from './comparisonWordbooks'\nexport { themeWords } from './themeWords'\nexport { themeWordbooks } from './themeWordbooks'\nexport { vocabularySets } from './vocabularySets'\nexport { vocabularyWords } from './vocabularyWords'\n`

  await Promise.all([
    writeGeneratedFile(path.join(outputDir, 'learnContent.ts'), `import type { LearnSense } from '../../learn/contextTypes'\n\nexport const learnContent: LearnSense[] = ${toTsLiteral(data.learnContent ?? [])}\n`, 'utf8'),
    writeGeneratedFile(sourcePaths.sets, `${JSON.stringify(data.sets, null, 2)}\n`, 'utf8'),
    writeGeneratedFile(sourcePaths.words, `${JSON.stringify(data.words, null, 2)}\n`, 'utf8'),
    writeGeneratedFile(sourcePaths.themeWordbooks, `${JSON.stringify(data.themeWordbooks, null, 2)}\n`, 'utf8'),
    writeGeneratedFile(sourcePaths.themeWords, `${JSON.stringify(data.themeWords, null, 2)}\n`, 'utf8'),
    writeGeneratedFile(sourcePaths.comparisonWordbooks, `${JSON.stringify(data.comparisonWordbooks, null, 2)}\n`, 'utf8'),
    writeGeneratedFile(sourcePaths.comparisonWords, `${JSON.stringify(data.comparisonWords, null, 2)}\n`, 'utf8'),
    writeGeneratedFile(sourcePaths.comparisonPairs, `${JSON.stringify(data.comparisonPairs, null, 2)}\n`, 'utf8'),
    writeGeneratedFile(path.join(outputDir, 'vocabularySets.ts'), setsFile, 'utf8'),
    writeGeneratedFile(path.join(outputDir, 'vocabularyWords.ts'), wordsFile, 'utf8'),
    writeGeneratedFile(path.join(outputDir, 'themeWordbooks.ts'), themeWordbooksFile, 'utf8'),
    writeGeneratedFile(path.join(outputDir, 'themeWords.ts'), themeWordsFile, 'utf8'),
    writeGeneratedFile(path.join(outputDir, 'comparisonWordbooks.ts'), comparisonWordbooksFile, 'utf8'),
    writeGeneratedFile(path.join(outputDir, 'comparisonWords.ts'), comparisonWordsFile, 'utf8'),
    writeGeneratedFile(path.join(outputDir, 'comparisonPairs.ts'), comparisonPairsFile, 'utf8'),
    writeGeneratedFile(path.join(outputDir, 'index.ts'), indexFile, 'utf8'),
  ])
}

async function main() {
  const vocabSource = await readVocabSource()
  const legacySets = await collectLegacySets()

  if (!vocabSource && legacySets.length > 0) {
    const legacyData = buildDataFromLegacySets(legacySets)
    await writeOutputFiles({
      sets: legacyData.sets,
      words: legacyData.words,
      themeWordbooks: vocabSource?.themeWordbooks ?? [],
      themeWords: vocabSource?.themeWords ?? [],
      comparisonWordbooks: vocabSource?.comparisonWordbooks ?? [],
      comparisonWords: vocabSource?.comparisonWords ?? [],
      comparisonPairs: vocabSource?.comparisonPairs ?? [],
    })
    return
  }

  if (!vocabSource) {
    return
  }

  await writeOutputFiles(vocabSource)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
