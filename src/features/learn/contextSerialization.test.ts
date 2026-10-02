import { describe, expect, it } from 'vitest'
import { answerContext, emptyContextState, startContext, undoContext } from './contextEngine'
import { parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import { testSense } from './contextTestFixtures'

describe('compact undo persistence', () => {
  it('round-trips mixed rounds and every undo snapshot', () => {
    const senses = ['a', 'b', 'c'].map((id) => testSense(id))
    let state = startContext(
      emptyContextState(),
      {
        setId: 'all',
        setName: 'test',
        candidateWordIds: ['a', 'b', 'c'],
        requiredWordIds: [],
        wordCount: 3,
        allowEarly: false,
      },
      senses,
      '2026-09-28',
    )
    const snapshots = [state]
    for (const known of [false, false, true, false, true, false]) {
      state = answerContext(state, known, senses, '2026-09-28')
      snapshots.push(state)
    }
    let restored = parseContextState(serializeContextState(state))
    for (const expected of snapshots.reverse()) {
      expect(restored).toEqual(expected)
      restored = undoContext(restored)
    }
  })

  it('stores large scopes once instead of repeating them for every answer', () => {
    const senses = Array.from({ length: 1520 }, (_, i) => testSense(`word-${i}`))
    let state = startContext(
      emptyContextState(),
      {
        setId: 'all',
        setName: 'test',
        candidateWordIds: senses.map((s) => s.wordId),
        requiredWordIds: [],
        wordCount: 1520,
        allowEarly: false,
      },
      senses,
      '2026-09-28',
    )
    for (let i = 0; i < 100; i++) state = answerContext(state, true, senses, '2026-09-28')
    const raw = serializeContextState(state)
    expect(raw.length).toBeLessThan(250_000)
    expect(raw.length).toBeLessThan(JSON.stringify(state).length / 10)
    expect(parseContextState(raw)).toEqual(state)
  })

  it('rejects corrupted patch boundaries', () => {
    const senses = [testSense('a'), testSense('b')]
    let state = startContext(
      emptyContextState(),
      {
        setId: 'all',
        setName: 'test',
        candidateWordIds: ['a', 'b'],
        requiredWordIds: [],
        wordCount: 2,
        allowEarly: false,
      },
      senses,
      '2026-09-28',
    )
    state = answerContext(state, false, senses, '2026-09-28')
    const data = JSON.parse(serializeContextState(state))
    data.history[0].session.values.cards = { start: -1, remove: 0, insert: [] }
    expect(() => parseContextState(JSON.stringify(data))).toThrow()
  })
})
