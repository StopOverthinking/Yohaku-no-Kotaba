import { describe, expect, it } from 'vitest'
import { validateVocabSource, type VocabSource } from './sourceValidation'

function fixture(): VocabSource {
  return {
    sets: [
      { id: 'owner', name: 'Owner', order: 0, wordIdPrefix: 'Owner', wordIds: ['word'] },
      { id: 'level', name: 'Level', order: 1, wordIdPrefix: 'Level', membershipMode: 'explicit', wordIds: ['word'] },
    ],
    words: [{ id: 'word', setId: 'owner', japanese: '猫', reading: 'ねこ', meaning: '고양이', type: 'noun', difficulty: null, verbInfo: null, sourceOrder: 0 }],
    themeWordbooks: [], themeWords: [], comparisonWordbooks: [], comparisonWords: [], comparisonPairs: [],
  }
}

describe('vocabulary source validation', () => {
  it('preserves IDs, owners and explicit range order without mutation', () => {
    const source = fixture()
    const before = JSON.stringify(source)
    expect(validateVocabSource(source)).toEqual([])
    expect(JSON.stringify(source)).toBe(before)
  })

  it('rejects missing, duplicate and unauthorized foreign references', () => {
    const source = fixture()
    source.sets[1].wordIds.push('missing', 'word')
    delete source.sets[1].membershipMode
    expect(validateVocabSource(source)).toEqual(expect.arrayContaining([
      'level: foreign reference word', 'level: unknown reference missing', 'level: duplicate membership word',
    ]))
  })

  it('rejects duplicate IDs across word domains, unknown owners and invalid difficulty', () => {
    const source = fixture()
    source.themeWords.push({ ...source.words[0], setId: 'missing', difficulty: NaN })
    expect(validateVocabSource(source)).toEqual(expect.arrayContaining([
      'word: duplicate word ID', 'word: unknown owner missing', 'word: invalid difficulty',
    ]))
  })

  it('keeps learn-content ID and link validation for drafts', () => {
    const source = fixture()
    source.learnContent = [{ id: 'sense', wordId: 'missing', version: 1, meaning: '', hint: '', confusions: [], review: { word: false, contrast: false, diversity: false }, examples: [] }]
    expect(validateVocabSource(source)).toContain('sense: 연결 단어 없음')
  })
})
