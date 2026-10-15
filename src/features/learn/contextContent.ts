import { learnContentIndex } from '@/features/vocab/data/learnContentIndex'
import { learnContentLoaders } from '@/features/vocab/data/learnContentLoaders'
import { learnContentIssues } from '@/features/vocab/data/learnContentValidation'
import { vocabularyWords, themeWords } from '@/features/vocab/data'
import { isReviewedSense } from './contentValidation'
import { createContentLoader } from './contentLoader'
import { learnAliases } from '@/features/vocab/data/learnAliases'
import { createAliasCatalog } from './contextAliases'
import { senseSeparations } from '@/features/vocab/data/senseSeparations'
import { projectSeparatedSense, separateContextSenses } from './contextSenseSeparations'

export const contextWords = [...vocabularyWords, ...themeWords]
export const contextWordMap = new Map(contextWords.map((word) => [word.id, word]))
export const contextContentIssues = learnContentIssues
export const contextSenses = separateContextSenses(learnContentIndex.filter(isReviewedSense), senseSeparations)
export const contextAliasGroups = learnAliases
export const contextSenseSeparations = senseSeparations
export const contextAliasCatalog = createAliasCatalog(contextSenses, contextAliasGroups)
const { loadSense } = createContentLoader(learnContentIndex, learnContentLoaders)
const separatedUsages = new Map(senseSeparations.flatMap(row => row.usages.map(usage => [usage.id, { row, usage }] as const)))
export async function loadContextSense(id: string) {
  const separated = separatedUsages.get(id)
  return separated ? projectSeparatedSense(await loadSense(separated.row.sourceSenseId), separated.usage) : loadSense(id)
}
export const contextSenseMap = new Map(contextSenses.map((sense) => [sense.id, sense]))
const coveredWordIds = new Set(contextSenses.map((sense) => sense.wordId))
export const contextCoverage = coveredWordIds.size
// Never silently replace missing sentences with the old recognition cards.
export const contextContentReady =
  contextContentIssues.length === 0 && contextWords.every((word) => coveredWordIds.has(word.id))
