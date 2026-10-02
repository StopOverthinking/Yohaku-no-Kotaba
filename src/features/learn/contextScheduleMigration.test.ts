import { describe, expect, it } from 'vitest'
import { addDays, answerContext, emptyContextState, profileKey, reviewInterval, reviewProfile, startContext, undoContext } from './contextEngine'
import { parseContextState, UnsupportedContextVersionError } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import { testSense } from './contextTestFixtures'

const oldIntervals = [1, 3, 7, 14, 30, 60, 120, 180]
const newIntervals = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 150, 180]
const day = '2026-09-29'

describe('denser review schedule', () => {
  it.each(['version', 'scheduleVersion'])('rejects unsupported %s before interpreting future undo encoding', field => {
    const raw = JSON.stringify({ ...emptyContextState(), [field]: 99, sessionEncoding: 'future' })
    expect(() => parseContextState(raw)).toThrow(UnsupportedContextVersionError)
    expect(() => parseContextState(raw)).toThrow(/지원하지 않는/)
    expect(JSON.parse(raw)[field]).toBe(99)
  })

  it('migrates every old stage without moving its date or changing its basic interval', () => {
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
      expect(reviewInterval(profile.step, profile.failures)).toBe(Math.max(1, Math.round(oldIntervals[step] / 1.25)))
    }
    expect(migrated.scheduleVersion).toBe(3)
    expect(parseContextState(serializeContextState(migrated))).toEqual(migrated)
    old.scheduleVersion = 1
    expect(parseContextState(JSON.stringify(old))).toEqual(migrated)
    old.scheduleVersion = 4
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
    // Simulate the old engine's post-answer stage (the v3 engine jumps to index 8).
    old.profiles[profileKey(senses[0])].step = 5
    const migrated = parseContextState(JSON.stringify(old))
    const undone = undoContext(migrated)
    expect(undone.profiles[profileKey(senses[0])]).toEqual({ ...profile, step: 8 })
    const next = answerContext(undone, true, senses, day)
    expect(next.profiles[profileKey(senses[0])]).toMatchObject({ step: 11, due: addDays(day, 90) })
  })
})
