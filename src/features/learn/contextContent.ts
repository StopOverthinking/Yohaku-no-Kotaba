import { learnContentIndex } from '@/features/vocab/data/learnContentIndex'
import { learnContentLoaders } from '@/features/vocab/data/learnContentLoaders'
import { learnContentIssues } from '@/features/vocab/data/learnContentValidation'
import { vocabularyWords, themeWords } from '@/features/vocab/data'
import { isReviewedSense } from './contentValidation'
import { createContentLoader } from './contentLoader'
import { learnAliases } from '@/features/vocab/data/learnAliases'
import { createAliasCatalog } from './contextAliases'

export const contextWords = [...vocabularyWords, ...themeWords]
export const contextWordMap = new Map(contextWords.map((word) => [word.id, word]))
export const contextContentIssues = learnContentIssues
export const contextSenses = learnContentIndex.filter(isReviewedSense)
export const contextAliasGroups = learnAliases
export const contextAliasCatalog = createAliasCatalog(contextSenses, contextAliasGroups)
export const { loadSense: loadContextSense } = createContentLoader(learnContentIndex, learnContentLoaders)
export const contextSenseMap = new Map(contextSenses.map((sense) => [sense.id, sense]))
const coveredWordIds = new Set(contextSenses.map((sense) => sense.wordId))
export const contextCoverage = coveredWordIds.size
// Never silently replace missing sentences with the old recognition cards.
export const contextContentReady =
  contextContentIssues.length === 0 && contextWords.every((word) => coveredWordIds.has(word.id))
