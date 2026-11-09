// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { answerContext, emptyContextState, profileKey, reviewProfile, startContext } from './contextEngine'
import { estimateJlptFromHistory, migrateJlptEstimate } from './jlptLearningEstimate'
import { legacyContextState, testSense } from './contextTestFixtures'
import { parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'

const day = '2026-11-01'
const senses = Array.from({ length: 60 }, (_, i) => testSense(`history-${i}`, 25 + i % 5))
function historical() {
  const state = legacyContextState(emptyContextState())
  state.level = { value: 45, assessedWordIds: senses.slice(0, 20).map(s => s.wordId) }
  for (const [i, sense] of senses.entries()) {
    const profile = reviewProfile(undefined, sense, sense.examples[0], i % 4 !== 0, false, day)
    state.profiles[profileKey(sense)] = { ...profile, levelDay: day }
  }
  return state
}

describe('one-time JLPT reestimate from recoverable history', () => {
  it('fits the recoverable observations independently of the latest volatile score, without changing progress', () => {
    const state = historical(), raw = serializeContextState(state)
    const fit = estimateJlptFromHistory(state, senses)!
    const next = migrateJlptEstimate(state, senses)
    expect(next.jlptEstimate!.value).toBe(fit.value)
    expect(next.jlptEstimate!.value).toBeLessThan(state.level.value)
    expect(next.jlptHistoryReestimate).toEqual({ version: 1, wordCount: 60 })
    expect(next.profiles).toBe(state.profiles)
    expect(next.level).toBe(state.level)
    expect(serializeContextState(state)).toBe(raw)
    expect(estimateJlptFromHistory({ ...state, level: { ...state.level, value: 10 } }, senses)).toEqual(fit)
    expect(estimateJlptFromHistory(state, [...senses].reverse())).toEqual(fit)
    expect(parseContextState(serializeContextState(next))).toEqual(next)
    expect(migrateJlptEstimate(next, senses)).toBe(next)
  })

  it('uses first daily recall rather than memorized retries, exposures or completion flags', () => {
    const state = historical(), expected = estimateJlptFromHistory(state, senses)
    for (const [i, sense] of senses.entries()) {
      const profile = state.profiles[profileKey(sense)]
      if (i % 4 === 0) {
        state.profiles[profileKey(sense)] = { ...reviewProfile(profile, sense, sense.examples[0], true, true, day), levelDay: day }
      } else profile.mastered = true
      state.profiles[profileKey(sense)].examples[sense.examples[0].id].seen += 1000
    }
    state.excludedWordIds = senses.slice(0, 10).map(s => s.wordId)
    expect(estimateJlptFromHistory(state, senses)).toEqual(expected)
  })

  it('accepts twenty recoverable distinct words even when old calibration IDs were reduced by alias merging', () => {
    const state = historical()
    state.level.assessedWordIds.pop()
    const next = migrateJlptEstimate(state, senses)
    expect(next.jlptHistoryReestimate!.wordCount).toBe(60)
    expect(next.jlptEstimate!.value).toBe(estimateJlptFromHistory(state, senses)!.value)
  })

  it('uses only the most recent day per canonical word, with equal total weight for aliases and tied usages', () => {
    const state = historical(), fit = estimateJlptFromHistory(state, senses)
    const alias = testSense('alias', senses[1].examples[0].difficulty)
    state.profiles[profileKey(alias)] = { ...state.profiles[profileKey(senses[1])], senseId: alias.id }
    const resolve = (id: string) => id === alias.wordId ? senses[1].wordId : id
    expect(estimateJlptFromHistory(state, [...senses, alias], resolve)).toEqual(fit)
    const older = { ...state.profiles[profileKey(alias)], lastDay: '2026-10-01', levelDay: '2026-10-01', failedDay: '2026-10-01' }
    state.profiles[profileKey(alias)] = older
    expect(estimateJlptFromHistory(state, [...senses, alias], resolve)).toEqual(fit)
  })

  it('ignores obsolete or unresolved profiles and falls back when fewer than twenty distinct words remain', () => {
    const state = historical()
    for (const sense of senses.slice(0, 42)) state.profiles[profileKey(sense)].lastExampleId = 'removed-example'
    state.profiles[profileKey(senses[42])].levelDay = '2026-10-01'
    const oldVersion = { ...senses[43], version: 2 }
    const next = migrateJlptEstimate(state, [...senses.filter(s => s.id !== oldVersion.id), oldVersion])
    expect(next.jlptEstimate!.value).toBe(state.level.value)
    expect(next.jlptHistoryReestimate!.wordCount).toBe(0)
    expect(estimateJlptFromHistory(emptyContextState(), senses)).toBeNull()
  })

  it.each([true, false])('keeps all-known=%s data finite and moves upward when a historical outcome is corrected', known => {
    const state = historical()
    for (const sense of senses) state.profiles[profileKey(sense)].failedDay = known ? null : day
    const before = estimateJlptFromHistory(state, senses)!.value
    expect(Number.isFinite(before)).toBe(true)
    if (!known) {
      state.profiles[profileKey(senses[0])].failedDay = null
      expect(estimateJlptFromHistory(state, senses)!.value).toBeGreaterThan(before)
    }
  })

  it('reestimates an earlier v4 exactly once at a safe boundary and never reestimates a fresh user', () => {
    const state = { ...historical(), version: 4 as const, jlptEstimate: { policyVersion: 1 as const, value: 45 } }
    const next = migrateJlptEstimate(state, senses)
    expect(next.jlptEstimate!.value).not.toBe(45)
    expect(migrateJlptEstimate(next, [])).toBe(next)
    const fresh = emptyContextState()
    expect(migrateJlptEstimate(fresh, senses)).toBe(fresh)
    const active = startContext(next, { setId: 'test', setName: 'test', candidateWordIds: [senses[0].wordId], requiredWordIds: [], wordCount: 1, allowEarly: false }, senses, '2026-11-10')
    delete active.jlptHistoryReestimate
    const answered = answerContext(active, false, senses, '2026-11-10')
    expect(migrateJlptEstimate(answered, senses)).toBe(answered)
  })
})
