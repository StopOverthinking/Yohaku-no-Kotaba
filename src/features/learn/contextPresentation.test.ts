import { describe, expect, it } from 'vitest'
import { cardRecency, scopedReviews } from './contextPresentation'
import { profileKey, reviewProfile } from './contextEngine'
import { testSense } from './contextTestFixtures'

describe('learning presentation', () => {
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
