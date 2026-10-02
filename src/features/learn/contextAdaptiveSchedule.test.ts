import { describe, expect, it } from 'vitest'
import { addDays, answerContext, emptyContextState, profileKey, reviewProfile, startContext, undoContext } from './contextEngine'
import { parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import { testSense } from './contextTestFixtures'
import { reviewList } from './reviewList'
import { scopedReviews } from './contextPresentation'

const day = '2026-10-02'
const sense = testSense('a')
const example = sense.examples[0]
const key = profileKey(sense)
const options = { setId: 'test', setName: 'test', candidateWordIds: ['a'], requiredWordIds: [], wordCount: 1, allowEarly: true }
const reload = (state: ReturnType<typeof emptyContextState>) => parseContextState(serializeContextState(state))

describe('daily recall flows', () => {
  it('follows 3, 7, 30, 90 days, then graduates only after the final due recall; reload and undo restore completion', () => {
    let state = startContext(emptyContextState(), options, [sense], day)
    let reviewedAt = day
    for (const [i, interval] of [3, 7, 30, 90].entries()) {
      if (i > 0) {
        reviewedAt = state.profiles[key].due
        state = startContext(state, options, [sense], reviewedAt)
      }
      const before = state
      state = reload(answerContext(state, true, [sense], reviewedAt))
      expect(state.profiles[key].due).toBe(addDays(reviewedAt, interval))
      expect(state.profiles[key].mastered).toBeUndefined()
      expect(reviewList(state, [sense])[0].interval).toBe(interval)
      expect(undoContext(state)).toEqual(before)
    }
    const due = state.profiles[key].due
    state = startContext(state, options, [sense], addDays(due, -1))
    state = answerContext(state, true, [sense], addDays(due, -1))
    expect(state.profiles[key].mastered).toBeUndefined()
    state = startContext(state, options, [sense], due)
    const before = state
    state = reload(answerContext(state, true, [sense], due))
    expect(state.profiles[key].mastered).toBe(true)
    expect(reviewList(state, [sense])).toEqual([])
    expect(scopedReviews(state.profiles, new Map([[sense.id, sense]]), new Set(['a']), id => id, addDays(due, 365))).toEqual({ dueCount: 0, nextDue: undefined })
    expect(() => startContext(state, { ...options, allowEarly: false }, [sense], addDays(due, 365))).toThrow('지금 복습')
    expect(undoContext(state)).toEqual(before)
    // Explicit practice remains possible, and a new day's failure reactivates it.
    state = startContext(state, options, [sense], addDays(due, 1))
    state = reload(answerContext(state, false, [sense], addDays(due, 1)))
    expect(state.profiles[key]).toMatchObject({ step: 0, due: addDays(due, 2), failures: 1 })
    expect(state.profiles[key].mastered).toBeUndefined()
    expect(reviewList(state, [sense])).toHaveLength(1)
  })

  it.each([true, false])('only the first answer of a day affects scheduling, failure counters and score (first known=$known)', known => {
    let state = startContext(emptyContextState(), options, [sense], day)
    state = reload(answerContext(state, known, [sense], day))
    const initial = state.profiles[key]
    const level = state.level
    for (const answer of [false, false, true, false, true]) {
      if (!state.session) state = startContext(state, options, [sense], day)
      state = reload(answerContext(state, answer, [sense], day))
      expect(state.profiles[key]).toMatchObject({ due: initial.due, step: initial.step, failures: initial.failures, failedDays: initial.failedDays, failedDay: initial.failedDay })
      expect(state.profiles[key].examples[example.id].failures).toBe(known ? 0 : 1)
      expect(state.level).toEqual(level)
    }
    expect(state.profiles[key].dailyAttempts).toBe(6)
  })

  it.each([0, 1, 4, 40])('resets to the same one-failure flow regardless of past failures=$failures or successes', failures => {
    let profile = { ...reviewProfile(undefined, sense, example, true, false, day), step: 11, failures, levelDay: day }
    profile = reviewProfile(profile, sense, example, false, false, addDays(day, 1))
    expect(profile).toMatchObject({ step: 0, due: addDays(day, 2), failures: failures + 1 })
    for (const interval of [2, 2, 4, 6, 8, 11, 17, 24, 36, 48, 72, 96, 120, 144, 144]) {
      const reviewedAt = profile.due
      profile = reviewProfile(profile, sense, example, true, false, reviewedAt)
      expect(profile.due).toBe(addDays(reviewedAt, interval))
    }
    const failedAt = profile.due
    profile = reviewProfile(profile, sense, example, false, false, failedAt)
    expect(profile).toMatchObject({ step: 0, due: addDays(failedAt, 1), failures: failures + 2 })
    profile = reviewProfile(profile, sense, example, true, false, profile.due)
    expect(profile.due).toBe(addDays(failedAt, 3))
  })

  it('loads policy v2 without changing dates or undo and upgrades the policy once', () => {
    let state = emptyContextState()
    state.profiles[key] = { ...reviewProfile(undefined, sense, example, false, false, day), step: 4, failures: 20, levelDay: day, due: '2026-10-08' }
    state = startContext(state, options, [sense], '2026-10-03')
    state = answerContext(state, true, [sense], '2026-10-03')
    const raw = JSON.parse(serializeContextState(state))
    raw.scheduleVersion = 2
    const restored = parseContextState(JSON.stringify(raw))
    expect(restored).toEqual(state)
    expect(reload(restored)).toEqual(restored)
    expect(undoContext(restored).profiles[key].due).toBe('2026-10-08')
    const due = startContext(restored, options, [sense], '2026-10-08')
    const answered = reload(answerContext(due, true, [sense], '2026-10-08'))
    expect(answered.profiles[key]).toMatchObject({ step: 5, due: '2026-10-16', failures: 20 })
    expect(undoContext(answered)).toEqual(due)
    raw.profiles[key].mastered = 'true'
    expect(() => parseContextState(JSON.stringify(raw))).toThrow()
  })
})
