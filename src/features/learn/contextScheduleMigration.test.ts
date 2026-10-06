import { describe, expect, it } from 'vitest'
import { addDays, answerContext, emptyContextState, profileKey, reviewInterval, reviewProfile, startContext, undoContext } from './contextEngine'
import { parseContextState, UnsupportedContextVersionError } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import { testSense } from './contextTestFixtures'

const oldIntervals = [1, 3, 7, 14, 30, 60, 120, 180]
const mappedSteps = [0, 1, 3, 4, 6, 8, 10, 11]
const mappedIntervals = [1, 2, 5, 8, 21, 48, 96, 120]
const day = '2026-09-29'

describe('denser review schedule', () => {
  it.each([2, 3])('maps all fifteen policy-v%s failure stages once and preserves reserved dates and counters', scheduleVersion => {
    const expected = [0, 1, 1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 11]
    const state = emptyContextState()
    expected.forEach((_, step) => {
      const sense = testSense(`old-${step}`)
      state.profiles[profileKey(sense)] = { ...reviewProfile(undefined, sense, sense.examples[0], false, false, day),
        step, due: '2027-04-01', failures: 24, failedDays: 12, levelDay: day }
    })
    const raw = JSON.parse(serializeContextState(state))
    raw.scheduleVersion = scheduleVersion
    const restored = parseContextState(JSON.stringify(raw))
    Object.entries(restored.profiles).forEach(([key, profile], step) => {
      expect(profile).toEqual({ ...state.profiles[key], step: expected[step] })
    })
    expect(parseContextState(serializeContextState(restored))).toEqual(restored)
    const invalid = { ...restored, excludedWordIds: [5] }
    expect(() => parseContextState(JSON.stringify(invalid))).toThrow('학습 기록')
    restored.profiles[Object.keys(restored.profiles)[0]].step = 12
    expect(() => parseContextState(serializeContextState(restored))).toThrow('형식')
  })
  it.each(['version', 'scheduleVersion'])('rejects unsupported %s before interpreting future undo encoding', field => {
    const raw = JSON.stringify({ ...emptyContextState(), [field]: 99, sessionEncoding: 'future' })
    expect(() => parseContextState(raw)).toThrow(UnsupportedContextVersionError)
    expect(() => parseContextState(raw)).toThrow(/지원하지 않는/)
    expect(JSON.parse(raw)[field]).toBe(99)
  })

  it('migrates every old failure stage without moving its date or counters', () => {
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
      expect(profile).toEqual({ ...state.profiles[profileKey(sense)], step: mappedSteps[step] })
      expect(reviewInterval(profile.step, profile.failures)).toBe(mappedIntervals[step])
    }
    expect(migrated.scheduleVersion).toBe(4)
    expect(parseContextState(serializeContextState(migrated))).toEqual(migrated)
    old.scheduleVersion = 1
    expect(parseContextState(JSON.stringify(old))).toEqual(migrated)
    old.scheduleVersion = 5
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
