import { learnContent } from '@/features/vocab/data/learnContent'
import { vocabularyWords, themeWords } from '@/features/vocab/data'
import { isReviewedSense, validateLearnContent } from './contentValidation'

export const contextWords = [...vocabularyWords, ...themeWords]
export const contextWordMap = new Map(contextWords.map((word) => [word.id, word]))
export const contextContentIssues = validateLearnContent(learnContent, new Set(contextWordMap.keys()))
export const contextSenses = learnContent.filter(isReviewedSense)
export const contextSenseMap = new Map(contextSenses.map((sense) => [sense.id, sense]))
const coveredWordIds = new Set(contextSenses.map((sense) => sense.wordId))
export const contextCoverage = coveredWordIds.size
// Never silently replace missing sentences with the old recognition cards.
export const contextContentReady =
  contextContentIssues.length === 0 && contextWords.every((word) => coveredWordIds.has(word.id))
