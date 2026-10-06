import { describe, expect, it } from 'vitest'
import { cardRecency, scopedReviews, similarHintWords } from './contextPresentation'
import { profileKey, reviewProfile } from './contextEngine'
import { testSense } from './contextTestFixtures'

describe('learning presentation', () => {
  it('deduplicates comparison words and excludes the current answer, headword and readings', () => {
    const sense = testSense('a')
    const word = { japanese: '答える', reading: 'こたえる' }
    sense.confusions = ['返事する', '返事する ', '', word.japanese, word.reading, sense.examples[0].answer, sense.examples[0].reading]
      .map((japanese) => ({ japanese, distinction: '차이' }))
    expect(similarHintWords(sense, word, sense.examples[0])).toEqual(['返事する'])
    sense.confusions = [{ japanese: word.japanese, distinction: '다른 읽기' }]
    expect(similarHintWords(sense, word, sense.examples[0])).toEqual([])
  })

  it('shows a different homograph reading but rejects a qualified version of the answer', () => {
    const sense = testSense('a')
    const word = { japanese: '開く', reading: 'あく' }
    sense.confusions = ['開く', '開く（あく）', '開く（ひらく）'].map((japanese) => ({ japanese, distinction: '읽기 차이' }))
    expect(similarHintWords(sense, word, sense.examples[0])).toEqual(['開く（ひらく）'])
  })

  it('shows at most two comparisons after filtering and deduplication', () => {
    const sense = testSense('a')
    const word = { japanese: '答える', reading: 'こたえる' }
    sense.confusions = [word.japanese, ' ', '返事する', '返事する', '応じる', '言う']
      .map((japanese) => ({ japanese, distinction: '차이' }))
    expect(similarHintWords(sense, word, sense.examples[0])).toEqual(['返事する', '応じる'])
  })

  it('uses calendar days for new, same-day, overdue and future-dated cards', () => {
    const sense = testSense('a')
    const profile = reviewProfile(undefined, sense, sense.examples[0], true, false, '2026-09-29')
    expect(cardRecency(undefined, '2026-10-02')).toBe('새 단어')
    expect(cardRecency(profile, '2026-10-02')).toBe('3일 전')
    expect(cardRecency(profile, '2026-09-29')).toBe('0일 전')
    expect(cardRecency(profile, '2026-09-28')).toBe('0일 전')
    profile.lastDay = '2026-03-07'
    expect(cardRecency(profile, '2026-03-09')).toBe('2일 전')
    profile.lastDay = '2024-02-28'
    expect(cardRecency(profile, '2024-03-01')).toBe('2일 전')
  })

  it('counts due words once across usages and aliases, omitting old versions and outside scope', () => {
    const senses = [testSense('a'), { ...testSense('a-second'), wordId: 'a' }, testSense('alias'), testSense('future'), testSense('outside')]
    const profiles = Object.fromEntries(senses.map(sense => [profileKey(sense), reviewProfile(undefined, sense, sense.examples[0], true, false, '2026-09-29')]))
    profiles[profileKey(senses[3])].due = '2026-10-03'
    profiles['a@0'] = { ...profiles[profileKey(senses[0])], version: 0, due: '2026-01-01' }
    const resolve = (id: string) => id === 'alias' ? 'a' : id
    expect(scopedReviews(profiles, new Map(senses.map(s => [s.id, s])), new Set(['a', 'future']), resolve, '2026-10-02')).toEqual({ dueCount: 1, nextDue: '2026-10-02' })
    expect(scopedReviews(profiles, new Map(senses.map(s => [s.id, s])), new Set(['future']), resolve, '2026-10-02')).toEqual({ dueCount: 0, nextDue: '2026-10-03' })
    expect(scopedReviews(profiles, new Map(senses.map(s => [s.id, s])), new Set(), resolve, '2026-10-02')).toEqual({ dueCount: 0, nextDue: undefined })
  })
})
