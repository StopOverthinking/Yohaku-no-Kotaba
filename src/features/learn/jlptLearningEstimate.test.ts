// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { emptyContextState, expectedKnown } from './contextEngine'
import { formatJlptLevel, currentJlptGrade } from './jlptEstimate'
import { emptyJlptEstimate, migrateJlptEstimate, updateJlptEstimate } from './jlptLearningEstimate'
import { legacyContextState } from './contextTestFixtures'

const level = { value: 30, assessedWordIds: Array.from({ length: 20 }, (_, i) => `word-${i}`) }
const initial = { policyVersion: 1 as const, value: 30 }

describe('stable JLPT learning estimate', () => {
  it('initializes only after calibration, without counting the twentieth answer twice', () => {
    const empty = emptyJlptEstimate()
    expect(updateJlptEstimate(empty, { ...level, assessedWordIds: level.assessedWordIds.slice(1) }, 20, true)).toBe(empty)
    expect(updateJlptEstimate(empty, level, 20, true)).toEqual(initial)
    const state = { ...emptyContextState(), level: { ...level, assessedWordIds: [] }, jlptEstimate: initial }
    expect(currentJlptGrade(state)).toBe('N3.5')
  })

  it('reduces the isolated 75%-probability error from N3.8 to N3.6 while a correct answer keeps N3.5', () => {
    const difficulty = 30 - 8 * Math.log(3)
    expect(formatJlptLevel(updateJlptEstimate(initial, level, difficulty, false).value!)).toBe('N3.6')
    expect(formatJlptLevel(updateJlptEstimate(initial, level, difficulty, true).value!)).toBe('N3.5')
    expect(initial.value).toBe(30)
  })

  it('never reverses response direction or moves the grade by more than one tenth, including all boundaries', () => {
    for (let score = -10; score <= 70; score += 0.05) {
      for (const difficulty of [-1000, score - 8, score, score + 8, 1000]) {
        for (const known of [true, false]) {
          const after = updateJlptEstimate({ ...initial, value: score }, level, difficulty, known).value!
          expect(known ? after >= score : after <= score).toBe(true)
          expect(Math.abs(Number(formatJlptLevel(after).slice(1)) - Number(formatJlptLevel(score).slice(1)))).toBeLessThanOrEqual(0.10000001)
        }
      }
    }
  })

  it('reduces steady-state variability by at least half on the same adaptive response streams', () => {
    const variance = (xs: number[]) => {
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length
      return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length
    }
    for (let seed = 1; seed <= 8; seed++) {
      let randomState = seed, fast = 30, stable = initial
      const fastValues: number[] = [], stableValues: number[] = []
      for (let n = 0; n < 8000; n++) {
        const difficulty = fast - 8 * Math.log(3)
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
        const known = randomState / 2 ** 32 < expectedKnown(30, difficulty)
        fast += 2 * ((known ? 1 : 0) - expectedKnown(fast, difficulty))
        stable = updateJlptEstimate(stable, level, difficulty, known) as typeof initial
        if (n >= 1000) { fastValues.push(fast); stableValues.push(stable.value) }
      }
      expect(Math.sqrt(variance(stableValues) / variance(fastValues))).toBeLessThan(0.5)
    }
  })

  it.each([22.5, 37.5])('follows at least half of a sustained change toward %s within 200 expected responses', target => {
    let fast = 30, estimate = initial
    for (let n = 0; n < 200; n++) {
      const difficulty = fast - 8 * Math.log(3)
      const expected = expectedKnown(target, difficulty)
      const yes = updateJlptEstimate(estimate, level, difficulty, true).value!
      const no = updateJlptEstimate(estimate, level, difficulty, false).value!
      estimate = { ...initial, value: expected * yes + (1 - expected) * no }
      fast += 2 * (expected - expectedKnown(fast, difficulty))
    }
    expect(Math.abs(estimate.value - target)).toBeLessThan(Math.abs(30 - target) / 2)
  })

  it('migrates idle legacy records once, preserving the displayed grade and existing score', () => {
    const legacy = legacyContextState({ ...emptyContextState(), level })
    const migrated = migrateJlptEstimate(legacy)
    expect(migrated.version).toBe(4)
    expect(migrated.jlptEstimate).toEqual(initial)
    expect(currentJlptGrade(migrated)).toBe(currentJlptGrade(legacy))
    expect(migrateJlptEstimate(migrated)).toBe(migrated)
    expect(legacy.version).toBe(2)
  })
})
