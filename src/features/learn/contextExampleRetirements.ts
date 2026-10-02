import type { ContextCard, ContextSession, ContextState, LearnSenseIndex } from './contextTypes'

export type ExampleRetirement = {
  senseId: string
  senseVersion: number
  exampleId: string
  exampleVersion: number
  replacementId: string
  replacementVersion: number
}

/** Replace only explicitly retired, semantically equivalent cards. Exposure
 * statistics and undo profile snapshots keep their original example IDs.
 */
export function reconcileRetiredExamples(state: ContextState, senses: LearnSenseIndex[], retirements: ExampleRetirement[]): ContextState {
  if (!retirements.length) return state
  const key = (card: ContextCard) => `${card.senseId}@${card.senseVersion}/${card.exampleId}@${card.exampleVersion}`
  const map = new Map(retirements.map(row => [key(row), row]))
  const senseMap = new Map(senses.map(sense => [sense.id, sense]))
  function card(value: ContextCard): ContextCard {
    const row = map.get(key(value))
    if (!row) return value
    const sense = senseMap.get(row.senseId)
    if (sense?.version !== row.senseVersion || !sense.examples.some(example => example.id === row.replacementId &&
      example.version === row.replacementVersion && example.status === 'reviewed'))
      throw new Error('대체 예문을 확인할 수 없습니다. 학습 기록은 보존됩니다.')
    return { ...value, exampleId: row.replacementId, exampleVersion: row.replacementVersion }
  }
  function session(value: ContextSession): ContextSession {
    const current = card(value.current)
    const cards = value.cards.map(card), queue = value.queue.map(card), retry = value.retry.map(card)
    if (current === value.current && cards.every((c, i) => c === value.cards[i]) &&
        queue.every((c, i) => c === value.queue[i]) && retry.every((c, i) => c === value.retry[i])) return value
    return { ...value, current, cards, queue, retry,
      ...(current !== value.current ? { revealed: false, hintShown: false, hintUsed: false } : {}) }
  }
  const active = state.session ? session(state.session) : null
  const history = state.history.map(undo => {
    const repaired = session(undo.session)
    return repaired === undo.session ? undo : { ...undo, session: repaired }
  })
  if (active === state.session && history.every((undo, i) => undo === state.history[i])) return state
  return { ...state, session: active, history }
}
