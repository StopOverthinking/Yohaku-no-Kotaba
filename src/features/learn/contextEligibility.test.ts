import { describe, expect, it } from 'vitest'
import { addDays, answerContext, emptyContextState, profileKey, reconcileStudySession, reviewProfile, startContext, undoContext } from './contextEngine'
import { eligibleStudyWords } from './contextEligibility'
import { parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import { scopedReviews } from './contextPresentation'
import { reviewList } from './reviewList'
import { testSense } from './contextTestFixtures'

const day = '2026-10-05'
const a = testSense('a'), b = testSense('b')
const options = { setId: 'favorites', setName: 'test', candidateWordIds: ['a'], requiredWordIds: ['a'], wordCount: 10, allowEarly: true }

describe('scheduled-only learning', () => {
  it('blocks the learning day and both intervening days even for explicit, required and favorite scopes; admits the due date', () => {
    const state = answerContext(startContext(emptyContextState(), options, [a], day), true, [a], day)
    for (const offset of [0, 1, 2]) {
      expect(() => startContext(state, options, [a], addDays(day, offset))).toThrow('지금 복습')
      expect(eligibleStudyWords(state, [a], addDays(day, offset)).size).toBe(0)
    }
    expect(startContext(state, options, [a], addDays(day, 3)).session?.current.senseId).toBe(a.id)
  })

  it('does not inflate the target with blocked required words or expose the word through another usage', () => {
    const second = { ...testSense('second'), wordId: 'a' }
    const state = emptyContextState()
    state.profiles[profileKey(a)] = { ...reviewProfile(undefined, a, a.examples[0], true, false, day), levelDay: day }
    const started = startContext(state, { ...options, candidateWordIds: ['a', 'b'], requiredWordIds: ['a', 'b'] }, [a, b, second], day)
    expect(started.session).toMatchObject({ targetCount: 1, requiredWordIds: ['b'], current: { senseId: b.id } })
    expect(answerContext(started, true, [a, b, second], day).session).toBeNull()
  })

  it('completes the failure flow only after the final 120-day recall and keeps completion through reload and undo', () => {
    let state = startContext(emptyContextState(), options, [a], day)
    state = answerContext(state, false, [a], day)
    state = answerContext(state, true, [a], day)
    for (const interval of [1, 2, 3, 5, 8, 14, 21, 36, 48, 72, 96, 120]) {
      const profile = state.profiles[profileKey(a)]
      expect(reviewList(state, [a])[0].interval).toBe(interval)
      expect(profile.mastered).toBeUndefined()
      const before = startContext(state, options, [a], profile.due)
      state = parseContextState(serializeContextState(answerContext(before, true, [a], profile.due)))
      expect(undoContext(state)).toEqual(before)
    }
    expect(state.profiles[profileKey(a)].mastered).toBe(true)
    expect(reviewList(state, [a])).toEqual([])
    expect(scopedReviews(state.profiles, new Map([[a.id, a]]), new Set(['a']), id => id, '2030-01-01').dueCount).toBe(0)
    expect(() => startContext(state, options, [a], '2030-01-01')).toThrow('지금 복습')
  })

  it('skips early cards in resumed legacy sessions, without throwing away another eligible card or same-session retry', () => {
    const active = startContext(emptyContextState(), { ...options, candidateWordIds: ['a', 'b'], requiredWordIds: ['a'], wordCount: 2 }, [a, b], day)
    const legacy = { ...active, profiles: { [profileKey(a)]: { ...reviewProfile(undefined, a, a.examples[0], true, false, day), levelDay: day } } }
    expect(() => answerContext(legacy, true, [a, b], day)).toThrow('예정일 전')
    expect(reconcileStudySession(legacy, [a, b], day).session?.current.senseId).toBe(b.id)
    const retry = answerContext(startContext(emptyContextState(), options, [a], day), false, [a], day)
    expect(reconcileStudySession(retry, [a], day)).toBe(retry)
  })
})
