import type { StudyItem } from '@/features/vocab/model/types'
import type { RequiredLearnRange } from '@/features/preferences/preferencesStore'
import { getStudyItemsForSet, isStudyItemFavorite } from '@/features/vocab/model/selectors'

export type WordSelectionOptions = {
  setId: string | 'all' | 'favorites'
  favoritesOnly: boolean
  favoriteIds: string[]
  rangeEnabled: boolean
  rangeStart: number
  rangeEnd: number
}

export function getFilteredWords({
  setId,
  favoritesOnly,
  favoriteIds,
  rangeEnabled,
  rangeStart,
  rangeEnd,
}: WordSelectionOptions) {
  let items = getStudyItemsForSet(setId, favoriteIds)

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
