import { describe, expect, it } from 'vitest'
import { buildCandidateWords, getFilteredWords } from '@/features/study/wordSelection'
import { allWords } from '@/features/vocab/model/selectors'

const favoriteIds = allWords.slice(0, 8).map((word) => word.id)

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
})
