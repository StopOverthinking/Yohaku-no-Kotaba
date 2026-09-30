import { describe, expect, it } from 'vitest'
import { emptyContextState, startContext, answerContext, undoContext, profileKey, reviewProfile } from './contextEngine'
import { serializeContextState } from './contextSerialization'
import { parseContextState } from './contextPersistence'
import { testSense } from './contextTestFixtures'

describe('large corpus scheduling', () => {
  it('preserves required order, 500 decisions and undo with 12,000 existing profiles', () => {
    const senses = Array.from({ length: 12000 }, (_, i) => {
      const s = testSense(`scale-${i}`, i % 75 + 5)
      s.examples.push({ ...s.examples[0], id: `${s.wordId}-e3` })
      return s
    })
    let state = emptyContextState(senses)
    for (const s of senses) state.profiles[profileKey(s)] = {
      ...reviewProfile(undefined, s, s.examples[0], true, false, '2026-09-20'),
      levelDay: '2026-09-20',
    }
    state = startContext(state, { setId: 'all', setName: 'Scale fixture', candidateWordIds: senses.map((s) => s.wordId),
      requiredWordIds: [senses[11999].wordId], wordCount: 501, allowEarly: false }, senses, '2026-09-29')
    expect(state.session!.current.senseId).toBe(senses[11999].id)
    const first = state.session!.current
    const timings: number[] = []
    for (let i = 0; i < 500; i++) {
      const begin = performance.now()
      state = answerContext(state, true, senses, '2026-09-29')
      timings.push(performance.now() - begin)
    }
    expect(state.session!.decisions).toBe(500)
    expect(new Set(state.session!.cards.map((c) => c.senseId)).size).toBe(501)
    const serialized = serializeContextState(state)
    state = parseContextState(serialized)
    expect(Object.keys(state.profiles)).toHaveLength(12000)
    for (let i = 0; i < 500; i++) state = undoContext(state)
    expect(state.session!.current).toEqual(first)
    expect(state.session!.decisions).toBe(0)
    expect(state.history).toHaveLength(0)
    const sorted = timings.sort((a, b) => a - b)
    console.info(JSON.stringify({ workload: 'synthetic engine only; excludes browser UI/storage', words: 12000,
      examples: 36000, decisions: 500, p95Milliseconds: Number(sorted[474].toFixed(2)),
      serializedCharacters: serialized.length }))
  }, 60000)
})
