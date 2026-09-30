import { describe, expect, it } from 'vitest'
import { getSelectableWordbooks, getStudyItemsForSet, getStudySelectableWordbooks, getWordById, normalizeSelectableSetId } from '@/features/vocab/model/selectors'

describe('wordbook selectors', () => {
  it.each(['theme-core', 'ComparingWords'])('excludes removed wordbook %s from selections and contents', (id) => {
    expect(getSelectableWordbooks().map((book) => book.id)).not.toContain(id)
    expect(getStudySelectableWordbooks().map((book) => book.id)).not.toContain(id)
    expect(getStudyItemsForSet(id)).toEqual([])
    expect(normalizeSelectableSetId(id)).toBe('all')
  })

  it('excludes removed words from lookup and favorites', () => {
    const ids = ['theme-core-JLPTN3_1', 'ComparingWords_1']
    for (const id of ids) expect(getWordById(id)).toBeUndefined()
    expect(getStudyItemsForSet('favorites', ids)).toEqual([])
  })
})
