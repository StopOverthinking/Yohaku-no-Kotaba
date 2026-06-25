import type { StudyItem } from '@/features/vocab/model/types'
import { getStudyItemById, getStudyItemsForSet, isStudyItemFavorite } from '@/features/vocab/model/selectors'
import { shuffleArray } from '@/lib/random'

export type WordSelectionOptions = {
  setId: string | 'all' | 'favorites' | 'wrong_answers'
  favoritesOnly: boolean
  favoriteIds: string[]
  wrongAnswerIds?: string[]
  rangeEnabled: boolean
  rangeStart: number
  rangeEnd: number
}

export function getFilteredWords({
  setId,
  favoritesOnly,
  favoriteIds,
  wrongAnswerIds = [],
  rangeEnabled,
  rangeStart,
  rangeEnd,
}: WordSelectionOptions) {
  let items: StudyItem[] =
    setId === 'wrong_answers'
      ? wrongAnswerIds
          .map((wordId) => getStudyItemById(wordId))
          .filter((item): item is StudyItem => item !== undefined)
      : getStudyItemsForSet(setId, favoriteIds)

  if (favoritesOnly) {
    items = items.filter((item) => isStudyItemFavorite(item, favoriteIds))
  }

  if (rangeEnabled) {
    const start = Math.max(1, rangeStart)
    const end = Math.max(start, rangeEnd)
    items = items.slice(start - 1, end)
  }

  return items
}

export function buildCandidateWords(words: StudyItem[], wordCount: number, seed?: number) {
  const normalizedWordCount = Math.max(1, Math.floor(wordCount) || 1)
  return shuffleArray(words, seed).slice(0, Math.min(normalizedWordCount, words.length))
}
