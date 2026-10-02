import { describe, expect, it } from 'vitest'
import { emptyContextState, profileKey, reviewProfile } from './contextEngine'
import { reviewList, formatScoreChange } from './reviewList'
import { testSense } from './contextTestFixtures'

describe('review list', () => {
  it('keeps pending reviews beyond 30 days visible until explicitly mastered', () => {
    const senses = ['thirty', 'sixty', 'penalty', 'old-version', 'unseen'].map((id) => testSense(id))
    const state = emptyContextState()
    for (const sense of senses.slice(0, 4)) {
      state.profiles[profileKey(sense)] = reviewProfile(
        undefined,
        sense,
        sense.examples[0],
        true,
        false,
        '2026-09-01',
      )
    }
    Object.assign(state.profiles[profileKey(senses[0])], { step: 8, due: '2026-10-01' })
    Object.assign(state.profiles[profileKey(senses[1])], { step: 10, due: '2026-09-02' })
    Object.assign(state.profiles[profileKey(senses[2])], { step: 10, failedDays: 1, failures: 4, due: '2026-09-30' })
    senses[3].version = 2
    expect(reviewList(state, senses).map(({ sense, interval }) => [sense.wordId, interval])).toEqual([
      ['sixty', 60],
      ['penalty', 48],
      ['thirty', 30],
    ])
    // Early practice changes lastDay, never the established interval or list membership.
    state.profiles[profileKey(senses[1])].lastDay = '2026-09-28'
    expect(reviewList(state, senses)).toHaveLength(3)
  })
  it('returns failed mastered words to the list and rounds tiny score changes without negative zero', () => {
    const sense = testSense('a')
    const state = emptyContextState()
    const profile = reviewProfile(undefined, sense, sense.examples[0], true, false, '2026-09-01')
    profile.step = 14
    state.profiles[profileKey(sense)] = reviewProfile(
      profile,
      sense,
      sense.examples[1],
      false,
      false,
      '2026-09-29',
    )
    expect(reviewList(state, [sense])[0].interval).toBe(1)
    expect(formatScoreChange(35, 34.99)).toBe('0.0')
    expect(formatScoreChange(35, 36.5)).toBe('+1.5')
  })
})
