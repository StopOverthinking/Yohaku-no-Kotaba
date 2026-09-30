import { describe, expect, it } from 'vitest'
import {
  getFilteredWords,
  getWordsInRanges,
} from '@/features/study/wordSelection'
import { allWords } from '@/features/vocab/model/selectors'

const favoriteIds = allWords.slice(0, 8).map((word) => word.id)
const allStudyItems = getFilteredWords({
  setId: 'all',
  favoritesOnly: false,
  favoriteIds: [],
  rangeEnabled: false,
  rangeStart: 1,
  rangeEnd: 1,
})

describe('wordSelection', () => {
  it('filters favorites before learning', () => {
    const candidates = getFilteredWords({
      setId: 'favorites',
      favoritesOnly: false,
      favoriteIds,
      rangeEnabled: false,
      rangeStart: 1,
      rangeEnd: 10,
    })

    expect(candidates.map((item) => item.id)).toEqual(favoriteIds)
  })

  it('collects multiple required ranges without counting overlaps twice', () => {
    const words = allStudyItems.slice(0, 12)
    const required = getWordsInRanges(words, [
      { start: 1, end: 4 },
      { start: 3, end: 6 },
      { start: 10, end: 11 },
    ])

    expect(required.map((word) => word.id)).toEqual(
      [...words.slice(0, 6), ...words.slice(9, 11)].map((word) => word.id),
    )
  })

})
