import { describe, expect, it } from 'vitest'
import { addDays, answerContext, emptyContextState, profileKey, reviewInterval, reviewProfile, startContext, undoContext } from './contextEngine'
import { parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import { testSense } from './contextTestFixtures'

const oldIntervals = [1, 3, 7, 14, 30, 60, 120, 180]
const newIntervals = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 150, 180]
const day = '2026-09-29'

describe('denser review schedule', () => {
  it('advances through every new interval and caps at 180 days', () => {
    const sense = testSense('a')
    let profile = reviewProfile(undefined, sense, sense.examples[0], true, false, day)
    let reviewedAt = day
    for (const [step, interval] of newIntervals.entries()) {
      if (step > 0) {
        reviewedAt = profile.due
        profile = reviewProfile(profile, sense, sense.examples[0], true, false, reviewedAt)
      }
      expect(profile.step).toBe(step)
      expect(profile.due).toBe(addDays(reviewedAt, interval))
    }
    reviewedAt = profile.due
    profile = reviewProfile(profile, sense, sense.examples[0], true, false, reviewedAt)
    expect(profile.step).toBe(14)
    expect(profile.due).toBe(addDays(reviewedAt, 180))
  })

  it('migrates every old stage without moving its date or changing its penalized interval', () => {
    const senses = oldIntervals.map((_, i) => testSense(String(i)))
    const state = emptyContextState()
    for (const [step, sense] of senses.entries()) {
      const profile = reviewProfile(undefined, sense, sense.examples[0], true, false, day)
      Object.assign(profile, { step, failedDays: 2, failures: 3, failedDay: day, levelDay: day })
      state.profiles[profileKey(sense)] = profile
    }
    const old = JSON.parse(serializeContextState(state))
    delete old.scheduleVersion
    const migrated = parseContextState(JSON.stringify(old))
    for (const [step, sense] of senses.entries()) {
      const profile = migrated.profiles[profileKey(sense)]
      expect(profile).toEqual({ ...state.profiles[profileKey(sense)], step: newIntervals.indexOf(oldIntervals[step]) })
      expect(reviewInterval(profile.step, profile.failedDays)).toBe(Math.max(1, Math.round(oldIntervals[step] / 1.5)))
    }
    expect(migrated.scheduleVersion).toBe(2)
    expect(parseContextState(serializeContextState(migrated))).toEqual(migrated)
    old.scheduleVersion = 1
    expect(parseContextState(JSON.stringify(old))).toEqual(migrated)
    old.scheduleVersion = 3
    expect(() => parseContextState(JSON.stringify(old))).toThrow()
    delete old.scheduleVersion
    old.profiles[profileKey(senses[0])].step = 8
    expect(() => parseContextState(JSON.stringify(old))).toThrow()
  })

  it('migrates compressed undo profiles so going back preserves the original interval', () => {
    const senses = [testSense('a'), testSense('b')]
    let state = emptyContextState()
    const profile = reviewProfile(undefined, senses[0], senses[0].examples[0], true, false, '2026-09-01')
    Object.assign(profile, { step: 4, levelDay: '2026-09-01', due: day })
    state.profiles[profileKey(senses[0])] = profile
    state = startContext(state, { setId: 'all', setName: 'test', candidateWordIds: ['a', 'b'], requiredWordIds: ['a'], wordCount: 2, allowEarly: false }, senses, day)
    state = answerContext(state, true, senses, day)
    const old = JSON.parse(serializeContextState(state))
    delete old.scheduleVersion
    const migrated = parseContextState(JSON.stringify(old))
    const undone = undoContext(migrated)
    expect(undone.profiles[profileKey(senses[0])]).toEqual({ ...profile, step: 8 })
    const next = answerContext(undone, true, senses, day)
    expect(next.profiles[profileKey(senses[0])]).toMatchObject({ step: 9, due: addDays(day, 45) })
  })
})
