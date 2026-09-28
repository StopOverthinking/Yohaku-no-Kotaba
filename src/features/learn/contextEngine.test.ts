import { describe, expect, it } from 'vitest'
import {
  addDays,
  answerContext,
  chooseExample,
  emptyContextState,
  profileKey,
  reviewProfile,
  selectNext,
  startContext,
  undoContext,
} from './contextEngine'
import { testSense } from './contextTestFixtures'

const day = '2026-09-28'
const senses = [testSense('a', 10), testSense('b', 30), testSense('c', 50), testSense('d', 30)]
const options = {
  setId: 'all',
  setName: '테스트',
  candidateWordIds: ['a', 'b', 'c', 'd'],
  requiredWordIds: [],
  wordCount: 3,
  allowEarly: false,
}

describe('context scheduling', () => {
  it('starts from the median, reserves required words, and adapts the next unseen word', () => {
    let state = startContext(
      emptyContextState(senses),
      { ...options, requiredWordIds: ['a', 'c', 'a'], wordCount: 1 },
      senses,
      day,
      () => 0,
    )
    expect(state.level.value).toBe(30)
    expect(state.session?.targetCount).toBe(2)
    const first = state.session!.current.senseId
    state = answerContext(state, true, senses, day)
    expect(new Set([first, state.session!.current.senseId])).toEqual(new Set(['sense-a', 'sense-c']))
    expect(state.level.value).toBeGreaterThan(30)
    expect(state.session!.cards).toHaveLength(2)
  })

  it('repeats failures until known, without repeatedly advancing level or dates that day', () => {
    let state = startContext(
      emptyContextState(senses),
      { ...options, candidateWordIds: ['b'], wordCount: 1 },
      senses,
      day,
    )
    state = answerContext(state, false, senses, day)
    const value = state.level.value
    const example = state.session!.current.exampleId
    for (let i = 0; i < 15; i++) state = answerContext(state, false, senses, day)
    expect(state.session!.round).toBe(17)
    expect(state.session!.current.exampleId).toBe(example)
    state = answerContext(state, true, senses, day)
    expect(state.session).toBeNull()
    expect(state.level.value).toBe(value)
    expect(state.profiles['sense-b@1']).toMatchObject({
      due: '2026-09-29',
      step: 0,
      failures: 16,
      failedDays: 1,
      dailyAttempts: 17,
    })
  })

  it('rotates examples on a later date and advances only on due recall', () => {
    const sense = senses[1],
      example = sense.examples[0]
    const first = reviewProfile(undefined, sense, example, true, false, day)
    expect(first.due).toBe('2026-09-29')
    expect(chooseExample(sense, first, day).id).toBe(example.id)
    expect(chooseExample(sense, first, '2026-09-29').id).toBe(sense.examples[1].id)
    const due = reviewProfile(first, sense, sense.examples[1], true, true, '2026-09-29')
    expect(due).toMatchObject({ step: 1, due: '2026-10-02' })
    const early = reviewProfile(due, sense, example, true, false, '2026-09-30')
    expect(early.due).toBe('2026-10-02')
    const failed = reviewProfile(early, sense, example, false, false, '2026-09-30')
    expect(failed).toMatchObject({ step: 0, due: '2026-10-01', failedDays: 1 })
  })

  it('uses actual review date for overdue intervals and shortens after failed dates', () => {
    const sense = senses[0]
    let profile = reviewProfile(undefined, sense, sense.examples[0], false, false, day)
    profile = reviewProfile(profile, sense, sense.examples[0], false, false, '2026-09-29')
    profile = reviewProfile(profile, sense, sense.examples[1], true, false, '2026-10-10')
    expect(profile.failedDays).toBe(2)
    expect(profile.due).toBe('2026-10-12')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('prioritizes overdue reviews over new words and excludes future reviews in automatic mode', () => {
    const state = emptyContextState(senses)
    state.profiles[profileKey(senses[2])] = reviewProfile(
      undefined,
      senses[2],
      senses[2].examples[0],
      true,
      false,
      '2026-09-20',
    )
    let active = startContext(state, options, senses, day)
    expect(active.session!.current.senseId).toBe('sense-c')
    active = answerContext(active, true, senses, day)
    expect(active.session!.current.senseId).not.toBe('sense-c')
    const onlyFuture = startContext(
      state,
      { ...options, candidateWordIds: ['c'], allowEarly: true },
      senses,
      '2026-09-20',
    )
    expect(
      selectNext(onlyFuture, { ...onlyFuture.session!, cards: [], allowEarly: false }, senses, '2026-09-20'),
    ).toBeNull()
  })

  it('undo restores profile, level, hint, answer reveal, queue and selected candidates', () => {
    let state = startContext(emptyContextState(senses), options, senses, day, () => 0.2)
    state.session = { ...state.session!, revealed: true, hintShown: true }
    const before = structuredClone(state)
    state = answerContext(state, false, senses, day)
    state = answerContext(state, true, senses, day)
    expect(undoContext(undoContext(state))).toEqual(before)
  })

  it('new sense versions do not inherit previous mastery', () => {
    const state = emptyContextState(senses)
    state.profiles['sense-b@1'] = reviewProfile(undefined, senses[1], senses[1].examples[0], true, false, day)
    const updated = [{ ...senses[1], version: 2 }]
    expect(
      startContext(state, { ...options, candidateWordIds: ['b'] }, updated, day).session?.current.senseId,
    ).toBe('sense-b')
  })

  it('continues distinct-word calibration across sessions and changes gain after twenty words', () => {
    const pool = Array.from({ length: 21 }, (_, i) => testSense(`cal-${i}`, 30))
    let state = emptyContextState(pool)
    for (let i = 0; i < 20; i++) {
      state = startContext(state, { ...options, candidateWordIds: [`cal-${i}`], wordCount: 1 }, pool, day)
      state = answerContext(state, i % 2 === 0, pool, day)
      if (state.session) state = answerContext(state, true, pool, day)
    }
    expect(state.level.assessedWordIds).toHaveLength(20)
    const previousLevel = state.level.value
    state = startContext(state, { ...options, candidateWordIds: ['cal-20'], wordCount: 1 }, pool, day)
    state = answerContext(state, true, pool, day)
    expect(state.level.value - previousLevel).toBeLessThan(2)
    expect(state.level.assessedWordIds).toHaveLength(20)
  })

  it('initializes the level from the available scope and never draws outside it', () => {
    const state = startContext(
      emptyContextState(senses),
      { ...options, candidateWordIds: ['a'], wordCount: 10 },
      senses,
      day,
    )
    expect(state.level.value).toBe(10)
    expect(state.session!.targetCount).toBe(1)
    expect(answerContext(state, true, senses, day).session).toBeNull()
  })

  it('same-date sessions cannot promote an interval twice, and the next day resets daily count', () => {
    const sense = senses[1]
    let profile = reviewProfile(undefined, sense, sense.examples[0], true, false, '2026-09-27')
    profile = reviewProfile(profile, sense, sense.examples[1], true, false, day)
    const due = profile.due
    for (let i = 0; i < 4; i++) profile = reviewProfile(profile, sense, sense.examples[1], true, false, day)
    expect(profile).toMatchObject({ step: 1, due, dailyAttempts: 5 })
    profile = reviewProfile(profile, sense, sense.examples[0], true, false, '2026-09-29')
    expect(profile).toMatchObject({ step: 1, due, dailyAttempts: 1 })
  })
})
