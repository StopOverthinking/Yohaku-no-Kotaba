import type {
  ContextCard,
  ContextSession,
  ContextState,
  LearnExampleIndex,
  LearnSenseIndex,
  ReviewProfile,
} from './contextTypes'

import { RECOMMENDATION_POLICY, SCHEDULE_VERSION, reviewProfile } from './contextReviewPolicy'
// Keep existing engine imports compatible while consumers move to the policy boundary.
export { RECOMMENDATION_POLICY, SCHEDULE_VERSION, REVIEW_INTERVALS, reviewInterval, localDay, addDays, reviewProfile } from './contextReviewPolicy'

export const profileKey = (sense: LearnSenseIndex) => `${sense.id}@${sense.version}`
export const expectedKnown = (level: number, difficulty: number) =>
  1 / (1 + Math.exp((difficulty - level) / RECOMMENDATION_POLICY.probabilityScale))
export function emptyContextState(): ContextState {
  return {
    version: 2,
    scheduleVersion: SCHEDULE_VERSION,
    revision: 0,
    level: { value: RECOMMENDATION_POLICY.initialLevel, assessedWordIds: [] },
    profiles: {},
    session: null,
    history: [],
  }
}

export function chooseExample(
  sense: LearnSenseIndex,
  profile: ReviewProfile | undefined,
  day: string,
): LearnExampleIndex {
  const examples = sense.examples.filter((e) => e.status === 'reviewed')
  // Across sessions on the same date, retain the teaching example too.
  const sameDay = profile?.lastDay === day && examples.find((e) => e.id === profile.lastExampleId)
  if (sameDay) return sameDay
  return [...examples].sort((a, b) => {
    const aPrevious = a.id === profile?.lastExampleId ? 1 : 0
    const bPrevious = b.id === profile?.lastExampleId ? 1 : 0
    return (
      aPrevious - bPrevious ||
      (profile?.examples[a.id]?.seen ?? 0) - (profile?.examples[b.id]?.seen ?? 0) ||
      a.id.localeCompare(b.id)
    )
  })[0]
}

export function selectNext(
  state: ContextState,
  session: ContextSession,
  senses: LearnSenseIndex[],
  day: string,
): ContextCard | null {
  const byId = new Map(senses.map((s) => [s.id, s]))
  const selectedWords = new Set(session.cards.map((c) => byId.get(c.senseId)?.wordId))
  const candidates = new Set([...session.candidateWordIds, ...session.requiredWordIds])
  const required = new Set(session.requiredWordIds)
  const tie = new Map(session.tieOrder.map((id, i) => [id, i]))
  const target =
    state.level.assessedWordIds.length < RECOMMENDATION_POLICY.calibrationWords
      ? RECOMMENDATION_POLICY.calibrationTarget
      : RECOMMENDATION_POLICY.ongoingTarget
  type Ranked = { sense: LearnSenseIndex; profile: ReviewProfile | undefined; example: LearnExampleIndex; priority: number; distance: number }
  const compare = (a: Ranked, b: Ranked) =>
    a.priority - b.priority ||
    (a.priority === 1
      ? a.profile!.due.localeCompare(b.profile!.due) || b.profile!.failures - a.profile!.failures
      : 0) ||
    (a.priority === 3 ? a.profile!.due.localeCompare(b.profile!.due) : 0) ||
    a.distance - b.distance ||
    (tie.get(a.sense.wordId) ?? 0) - (tie.get(b.sense.wordId) ?? 0) ||
    a.sense.id.localeCompare(b.sense.id)
  // Only the first ranked entry is used. A full sort needlessly allocates and
  // compares the entire 12k-word pool after every answer.
  let first: Ranked | undefined
  for (const sense of senses) {
    if (!candidates.has(sense.wordId) || selectedWords.has(sense.wordId)) continue
    const profile = state.profiles[profileKey(sense)]
    const priority = required.has(sense.wordId) ? 0 : profile && !profile.mastered && profile.due <= day ? 1 : !profile ? 2 : 3
    if (priority === 3 && !session.allowEarly) continue
    if (first && priority > first.priority) continue
    const example = chooseExample(sense, profile, day)
    const entry = {
      sense,
      profile,
      example,
      priority,
      distance: Math.abs(expectedKnown(state.level.value, example.difficulty) - target),
    }
    if (!first || compare(entry, first) < 0) first = entry
  }
  return first
    ? {
        senseId: first.sense.id,
        senseVersion: first.sense.version,
        exampleId: first.example.id,
        exampleVersion: first.example.version,
      }
    : null
}

export type StartContextOptions = {
  setId: string
  setName: string
  candidateWordIds: string[]
  requiredWordIds: string[]
  wordCount: number
  allowEarly: boolean
}
export function startContext(
  state: ContextState,
  options: StartContextOptions,
  senses: LearnSenseIndex[],
  day: string,
  random = Math.random,
): ContextState {
  const availableIds = new Set(senses.map((s) => s.wordId))
  const candidateWordIds = [...new Set(options.candidateWordIds)].filter((id) => availableIds.has(id))
  const requiredWordIds = [...new Set(options.requiredWordIds)].filter((id) => availableIds.has(id))
  const allIds = [...new Set([...candidateWordIds, ...requiredWordIds])]
  const initialState =
    !state.level.assessedWordIds.length && !Object.keys(state.profiles).length
      ? { ...state, level: emptyContextState().level }
      : state
  const eligibleIds = new Set(
    senses
      .filter(
        (sense) =>
          allIds.includes(sense.wordId) &&
          (options.allowEarly ||
            requiredWordIds.includes(sense.wordId) ||
            !state.profiles[profileKey(sense)] ||
            (!state.profiles[profileKey(sense)].mastered && state.profiles[profileKey(sense)].due <= day)),
      )
      .map((sense) => sense.wordId),
  )
  const tieOrder = [...allIds]
  for (let i = tieOrder.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[tieOrder[i], tieOrder[j]] = [tieOrder[j], tieOrder[i]]
  }
  const session: ContextSession = {
    id: globalThis.crypto.randomUUID(),
    setId: options.setId,
    setName: options.setName,
    candidateWordIds,
    requiredWordIds,
    allowEarly: options.allowEarly,
    targetCount: Math.min(
      eligibleIds.size,
      Math.max(1, Math.floor(options.wordCount) || 1, requiredWordIds.length),
    ),
    tieOrder,
    cards: [],
    round: 1,
    queue: [],
    retry: [],
    current: { senseId: '', senseVersion: 1, exampleId: '', exampleVersion: 1 },
    revealed: false,
    hintShown: false,
    hintUsed: false,
    decisions: 0,
    unknownWordIds: [],
  }
  const current = selectNext(initialState, session, senses, day)
  if (!current) throw new Error('지금 복습할 항목이 없습니다.')
  session.current = current
  session.cards = [current]
  return { ...initialState, session, history: [] }
}

export function answerContext(
  state: ContextState,
  known: boolean,
  senses: LearnSenseIndex[],
  day: string,
): ContextState {
  if (!state.session) return state
  const previousSession = state.session
  const sense = senses.find(
    (s) => s.id === previousSession.current.senseId && s.version === previousSession.current.senseVersion,
  )
  const example = sense?.examples.find(
    (e) => e.id === previousSession.current.exampleId && e.version === previousSession.current.exampleVersion && e.status === 'reviewed',
  )
  if (!sense || !example) throw new Error('예문이 변경되었습니다. 학습을 다시 시작해 주세요.')
  const key = profileKey(sense)
  const previous = state.profiles[key]
  const profile = reviewProfile(previous, sense, example, known, previousSession.hintUsed, day)
  const level = { ...state.level, assessedWordIds: [...state.level.assessedWordIds] }
  if (previous?.levelDay !== day) {
    const k =
      level.assessedWordIds.length < RECOMMENDATION_POLICY.calibrationWords
        ? RECOMMENDATION_POLICY.calibrationGain
        : RECOMMENDATION_POLICY.ongoingGain
    level.value += k * ((known ? 1 : 0) - expectedKnown(level.value, example.difficulty))
    if (
      !level.assessedWordIds.includes(sense.wordId) &&
      level.assessedWordIds.length < RECOMMENDATION_POLICY.calibrationWords
    )
      level.assessedWordIds.push(sense.wordId)
    profile.levelDay = day
  }
  const session: ContextSession = {
    ...previousSession,
    revealed: false,
    hintShown: false,
    hintUsed: false,
    decisions: previousSession.decisions + 1,
    retry: [...previousSession.retry],
    queue: [...previousSession.queue],
    cards: [...previousSession.cards],
    unknownWordIds: [...previousSession.unknownWordIds],
  }
  if (!known) {
    session.retry.push(session.current)
    if (!session.unknownWordIds.includes(sense.wordId)) session.unknownWordIds.push(sense.wordId)
  }
  const next: ContextState = {
    ...state,
    level,
    profiles: { ...state.profiles, [key]: profile },
    session,
    history: [
      ...state.history,
      { session: previousSession, level: state.level, profileKey: key, profile: previous ?? null },
    ],
  }
  let current: ContextCard | null | undefined
  if (session.round === 1 && session.cards.length < session.targetCount) {
    current = selectNext(next, session, senses, day)
    if (current) session.cards.push(current)
  }
  if (!current) current = session.queue.shift()
  if (!current && session.retry.length) {
    session.round++
    session.queue = session.retry
    session.retry = []
    current = session.queue.shift()
  }
  if (current) session.current = current
  else next.session = null
  return next
}

export function undoContext(state: ContextState): ContextState {
  const last = state.history.at(-1)
  if (!last) return state
  const profiles = { ...state.profiles }
  if (last.profile) profiles[last.profileKey] = last.profile
  else delete profiles[last.profileKey]
  return { ...state, profiles, level: last.level, session: last.session, history: state.history.slice(0, -1) }
}
