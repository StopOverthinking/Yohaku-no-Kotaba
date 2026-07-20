import { describe, expect, it } from 'vitest'
import {
  buildCandidateWords,
  buildCandidateWordsWithRequired,
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
  it('filters favorites before choosing a shuffled session subset', () => {
    const candidates = getFilteredWords({
      setId: 'favorites',
      favoritesOnly: false,
      favoriteIds,
      rangeEnabled: false,
      rangeStart: 1,
      rangeEnd: 10,
    })

    expect(candidates.map((item) => item.id)).toEqual(favoriteIds)
    expect(buildCandidateWords(candidates, 3, 1).map((item) => item.id)).not.toEqual(
      buildCandidateWords(candidates, 3, 99).map((item) => item.id),
    )
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

  it('always includes required words and randomly fills the remaining count', () => {
    const words = allStudyItems.slice(6, 16)
    const required = [allStudyItems[0], allStudyItems[1], allStudyItems[4], allStudyItems[5]]
    const sessionWords = buildCandidateWordsWithRequired(words, 7, required, 7)

    expect(sessionWords).toHaveLength(7)
    expect(sessionWords.map((word) => word.id)).toEqual(
      expect.arrayContaining(required.map((word) => word.id)),
    )
    expect(sessionWords.filter((word) => words.some((candidate) => candidate.id === word.id))).toHaveLength(3)
  })
})
