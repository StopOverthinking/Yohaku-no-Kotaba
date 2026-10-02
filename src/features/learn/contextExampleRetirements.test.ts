import { describe, expect, it } from 'vitest'
import { emptyContextState, startContext, answerContext, undoContext } from './contextEngine'
import { testSense } from './contextTestFixtures'
import { reconcileRetiredExamples, type ExampleRetirement } from './contextExampleRetirements'
import { parseContextState } from './contextPersistence'

const before = testSense('a')
const old = before.examples[0], kept = before.examples[1]
const after = { ...before, examples: [kept] }
const mappings: ExampleRetirement[] = [{ senseId: before.id, senseVersion: before.version,
  exampleId: old.id, exampleVersion: old.version, replacementId: kept.id, replacementVersion: kept.version }]
const settings = { setId: 'all', setName: 'all', candidateWordIds: ['a'], requiredWordIds: [], wordCount: 1, allowEarly: true }
const saved = () => {
  let state = startContext(emptyContextState(), settings, [before], '2026-10-02')
  state = { ...state, session: { ...state.session!, revealed: true, hintShown: true, hintUsed: true } }
  return answerContext(state, false, [before], '2026-10-02')
}
describe('retired example session recovery', () => {
  it('repairs current, retry and undo cards, hides the new answer, and preserves every learned value', () => {
    const state = saved()
    const repaired = reconcileRetiredExamples(state, [after], mappings)
    expect(repaired.session!.current.exampleId).toBe(kept.id)
    expect(repaired.session!.cards[0].exampleId).toBe(kept.id)
    expect(repaired.history[0].session.current.exampleId).toBe(kept.id)
    expect(repaired.history[0].session.revealed).toBe(false)
    expect(repaired.history[0].session.hintUsed).toBe(false)
    expect(repaired.profiles).toBe(state.profiles)
    expect(repaired.level).toBe(state.level)
    expect(repaired.history[0].profile).toBe(state.history[0].profile)
    expect(repaired.profiles[`${before.id}@1`].examples[old.id].seen).toBe(1)
    expect(repaired.profiles[`${before.id}@1`].examples[kept.id]).toBeUndefined()
    const undone = undoContext(repaired)
    expect(undone.profiles).toEqual({})
    expect(undone.session!.current.exampleId).toBe(kept.id)
    expect(answerContext(undone, true, [after], '2026-10-02').session).toBeNull()
  })
  it('is idempotent and round-trips existing backups without losing old exposure statistics', () => {
    const repaired = reconcileRetiredExamples(saved(), [after], mappings)
    expect(reconcileRetiredExamples(repaired, [after], mappings)).toBe(repaired)
    const restored = parseContextState(JSON.stringify(repaired))
    expect(restored).toEqual(repaired)
  })
  it('preserves queue order and does not silently map an unreviewed edit or another content version', () => {
    const state = saved()
    state.session!.queue = [state.history[0].session.current]
    state.session!.retry = [state.history[0].session.current]
    const repaired = reconcileRetiredExamples(state, [after], mappings)
    expect(repaired.session!.queue.map(c => c.exampleId)).toEqual([kept.id])
    expect(repaired.session!.retry.map(c => c.exampleId)).toEqual([kept.id])
    expect(reconcileRetiredExamples(state, [after], [{ ...mappings[0], exampleVersion: 99 }])).toBe(state)
    expect(() => reconcileRetiredExamples(state, [{ ...after, examples: [] }], mappings)).toThrow('대체 예문')
  })
})
