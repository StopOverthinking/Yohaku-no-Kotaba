import type { StudyItem } from '@/features/vocab/model/types'
import type { RequiredLearnRange } from '@/features/preferences/preferencesStore'
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

export function getWordsInRanges(words: StudyItem[], ranges: RequiredLearnRange[]) {
  const selectedIds = new Set<string>()

  for (const range of ranges) {
    const start = Math.max(1, Math.floor(range.start) || 1)
    const end = Math.max(start, Math.floor(range.end) || start)
    for (const word of words.slice(start - 1, end)) {
      selectedIds.add(word.id)
    }
  }

  return words.filter((word) => selectedIds.has(word.id))
}

export function buildCandidateWordsWithRequired(
  words: StudyItem[],
  wordCount: number,
  requiredWords: StudyItem[],
  seed?: number,
) {
  const requiredById = new Map(requiredWords.map((word) => [word.id, word]))
  const optionalById = new Map(
    words
      .filter((word) => !requiredById.has(word.id))
      .map((word) => [word.id, word]),
  )
  const targetCount = Math.max(1, Math.floor(wordCount) || 1, requiredById.size)
  const optionalCount = Math.max(0, targetCount - requiredById.size)
  const optionalWords = shuffleArray([...optionalById.values()], seed).slice(0, optionalCount)
  const sessionWords = [...requiredById.values(), ...optionalWords]

  return shuffleArray(sessionWords, seed === undefined ? undefined : seed + 1)
}
