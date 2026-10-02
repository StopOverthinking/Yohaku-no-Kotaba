import { describe, expect, it } from 'vitest'
import { addDays, localDay, reviewProfile } from './contextReviewPolicy'
import { testSense } from './contextTestFixtures'

describe('pure review policy boundary', () => {
  it('uses local calendar dates across leap days and year boundaries', () => {
    expect(localDay(new Date(2028, 1, 29, 23, 59))).toBe('2028-02-29')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('leaves the previous profile and example history intact on first and repeated decisions', () => {
    const sense = testSense('a')
    const example = sense.examples[0]
    const previous = {
      ...reviewProfile(undefined, sense, example, true, false, '2026-10-02'),
      step: 11, mastered: true, due: '2027-02-09', levelDay: '2026-10-02',
    }
    const original = structuredClone(previous)
    const sameDay = reviewProfile(previous, sense, example, false, true, '2026-10-02')
    expect(sameDay).toMatchObject({ step: 11, mastered: true, due: '2027-02-09', failures: 0, dailyAttempts: 2 })
    const tomorrow = reviewProfile(previous, sense, example, false, true, '2026-10-03')
    expect(tomorrow).toMatchObject({ step: 0, due: '2026-10-04', failures: 1, failedDays: 1, dailyAttempts: 1 })
    expect(tomorrow.mastered).toBeUndefined()
    expect(tomorrow.examples[example.id]).toEqual({ seen: 2, failures: 1, hints: 1 })
    expect(previous).toEqual(original)
    expect(tomorrow.examples).not.toBe(previous.examples)
  })
})
