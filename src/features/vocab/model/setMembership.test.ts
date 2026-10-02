import { describe, expect, it, vi } from 'vitest'
import { normalizeSetMembership, resolveSetWords } from './setMembership'
import { allSelectableWordbooks, getWordsForSet, getStudyItemsForSet, normalizeSelectableSetId } from './selectors'
import { vocabularySets, vocabularyWords } from '../data'

vi.mock('../data', () => ({
  vocabularySets: [
    { id: 'original', name: '원본', order: 0, wordIds: ['a', 'b'] },
    { id: 'level', name: 'N3', order: 1, membershipMode: 'explicit', wordIds: ['b', 'a'] },
    { id: 'archived', name: '병합된 단어장', order: 2, archived: true, wordIds: ['a'] },
    { id: 'jlpt-level-n5', name: 'N5', order: 3, membershipMode: 'explicit', wordIds: ['a'] },
  ],
  vocabularyWords: ['a', 'b'].map((id, index) => ({
    id, setId: 'original', japanese: id, reading: id, meaning: id,
    type: 'noun', difficulty: 20, verbInfo: null, sourceOrder: index,
  })),
  themeWordbooks: [], themeWords: [], comparisonPairs: [], comparisonWords: [], comparisonWordbooks: [],
}))

describe('shared level membership', () => {
  it('hides archived books and redirects saved selection while retaining old session lookup', () => {
    expect(allSelectableWordbooks.some(book => book.id === 'archived')).toBe(false)
    expect(normalizeSelectableSetId('archived')).toBe('jlpt-level-n5')
    expect(getStudyItemsForSet('archived').map(item => item.id)).toEqual(['a'])
    expect(getStudyItemsForSet('jlpt-level-n5')[0]).toBe(getStudyItemsForSet('archived')[0])
  })
  it('resolves the same original objects in level order without duplicating all/favorite views', () => {
    expect(getWordsForSet('level').map((word) => word.id)).toEqual(['b', 'a'])
    expect(getWordsForSet('level')[0]).toBe(vocabularyWords[1])
    expect(getStudyItemsForSet('level').map((item) => item.id)).toEqual(['b', 'a'])
    expect(getStudyItemsForSet('all')).toHaveLength(2)
    expect(getStudyItemsForSet('favorites', ['b'])).toHaveLength(1)
    expect(vocabularyWords.every((word) => word.setId === 'original')).toBe(true)
  })
  it('keeps established range positions and appends newly owned words after references', () => {
    const next = { ...vocabularyWords[0], id: 'c', setId: 'level' }
    expect(normalizeSetMembership(vocabularySets[1], [...vocabularyWords, next])).toEqual(['b', 'a', 'c'])
    expect(normalizeSetMembership(vocabularySets[0], [...vocabularyWords, next])).toEqual(['a', 'b'])
    expect(vocabularySets[1].wordIds).toEqual(['b', 'a'])
  })
  it('removes dangling and repeated references without exposing another data kind', () => {
    const set = { ...vocabularySets[1], wordIds: ['b', 'missing', 'b', 'a'] }
    expect(normalizeSetMembership(set, vocabularyWords)).toEqual(['b', 'a'])
    expect(resolveSetWords(set, new Map(vocabularyWords.map((word) => [word.id, word]))).map((word) => word.id)).toEqual(['b', 'a'])
  })
})
