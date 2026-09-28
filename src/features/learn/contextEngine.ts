import type {
  ContextCard,
  ContextSession,
  ContextState,
  LearnExample,
  LearnSense,
  ReviewProfile,
} from './contextTypes'

export const RECOMMENDATION_POLICY = {
  calibrationWords: 20,
  calibrationGain: 8,
  ongoingGain: 2,
  probabilityScale: 8,
  calibrationTarget: 0.5,
  ongoingTarget: 0.75,
  failurePenalty: 0.25,
  failureDayCap: 4,
  intervals: [1, 3, 7, 14, 30, 60, 120, 180],
} as const
export const REVIEW_INTERVALS = RECOMMENDATION_POLICY.intervals
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function addDays(day: string, days: number) {
  const [y, m, d] = day.split('-').map(Number)
  return localDay(new Date(y, m - 1, d + days, 12))
}
export const profileKey = (sense: LearnSense) => `${sense.id}@${sense.version}`
export const expectedKnown = (level: number, difficulty: number) =>
  1 / (1 + Math.exp((difficulty - level) / RECOMMENDATION_POLICY.probabilityScale))
export function emptyContextState(senses: LearnSense[]): ContextState {
  const difficulties = senses
    .flatMap((s) => s.examples.filter((e) => e.status === 'reviewed').map((e) => e.difficulty))
    .sort((a, b) => a - b)
  const middle = Math.floor(difficulties.length / 2)
  const median =
    difficulties.length === 0
      ? 30
      : difficulties.length % 2
        ? difficulties[middle]
        : (difficulties[middle - 1] + difficulties[middle]) / 2
  return {
    version: 2,
    revision: 0,
    level: { value: median, assessedWordIds: [] },
    profiles: {},
    session: null,
    history: [],
  }
}

export function chooseExample(
  sense: LearnSense,
  profile: ReviewProfile | undefined,
  day: string,
): LearnExample {
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
  senses: LearnSense[],
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
  const ranked = senses
    .filter((s) => candidates.has(s.wordId) && !selectedWords.has(s.wordId))
    .map((sense) => {
      const profile = state.profiles[profileKey(sense)]
      const example = chooseExample(sense, profile, day)
      const priority = required.has(sense.wordId) ? 0 : profile && profile.due <= day ? 1 : !profile ? 2 : 3
      return {
        sense,
        profile,
        example,
        priority,
        distance: Math.abs(expectedKnown(state.level.value, example.difficulty) - target),
      }
    })
    .filter((entry) => entry.priority < 3 || session.allowEarly)
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.priority === 1
          ? a.profile!.due.localeCompare(b.profile!.due) || b.profile!.failures - a.profile!.failures
          : 0) ||
        (a.priority === 3 ? a.profile!.due.localeCompare(b.profile!.due) : 0) ||
        a.distance - b.distance ||
        (tie.get(a.sense.wordId) ?? 0) - (tie.get(b.sense.wordId) ?? 0) ||
        a.sense.id.localeCompare(b.sense.id),
    )
  const first = ranked[0]
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
  senses: LearnSense[],
  day: string,
  random = Math.random,
): ContextState {
  const availableIds = new Set(senses.map((s) => s.wordId))
  const candidateWordIds = [...new Set(options.candidateWordIds)].filter((id) => availableIds.has(id))
  const requiredWordIds = [...new Set(options.requiredWordIds)].filter((id) => availableIds.has(id))
  const allIds = [...new Set([...candidateWordIds, ...requiredWordIds])]
  const initialState =
    !state.level.assessedWordIds.length && !Object.keys(state.profiles).length
      ? { ...state, level: emptyContextState(senses.filter((sense) => allIds.includes(sense.wordId))).level }
      : state
  const eligibleIds = new Set(
    senses
      .filter(
        (sense) =>
          allIds.includes(sense.wordId) &&
          (options.allowEarly ||
            requiredWordIds.includes(sense.wordId) ||
            !state.profiles[profileKey(sense)] ||
            state.profiles[profileKey(sense)].due <= day),
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

export function reviewProfile(
  previous: ReviewProfile | undefined,
  sense: LearnSense,
  example: LearnExample,
  known: boolean,
  hint: boolean,
  day: string,
): ReviewProfile {
  const profile: ReviewProfile = previous
    ? { ...previous, examples: { ...previous.examples } }
    : {
        senseId: sense.id,
        version: sense.version,
        due: addDays(day, 1),
        step: 0,
        lastDay: '',
        dailyAttempts: 0,
        failedDay: null,
        levelDay: '',
        failedDays: 0,
        failures: 0,
        lastExampleId: '',
        examples: {},
      }
  const isFirstToday = profile.lastDay !== day
  profile.dailyAttempts = isFirstToday ? 1 : profile.dailyAttempts + 1
  if (!known) {
    profile.failures++
    if (profile.failedDay !== day) profile.failedDays++
    profile.failedDay = day
    profile.step = 0
    profile.due = addDays(day, 1)
  } else if (previous && isFirstToday && profile.due <= day) {
    profile.step = Math.min(REVIEW_INTERVALS.length - 1, profile.step + 1)
    const days = Math.max(
      1,
      Math.round(
        REVIEW_INTERVALS[profile.step] /
          (1 +
            RECOMMENDATION_POLICY.failurePenalty *
              Math.min(profile.failedDays, RECOMMENDATION_POLICY.failureDayCap)),
      ),
    )
    profile.due = addDays(day, days)
  }
  const exampleStats = profile.examples[example.id] ?? { seen: 0, failures: 0, hints: 0 }
  profile.examples[example.id] = {
    seen: exampleStats.seen + 1,
    failures: exampleStats.failures + (known ? 0 : 1),
    hints: exampleStats.hints + (hint ? 1 : 0),
  }
  profile.lastDay = day
  profile.lastExampleId = example.id
  return profile
}

export function answerContext(
  state: ContextState,
  known: boolean,
  senses: LearnSense[],
  day: string,
): ContextState {
  if (!state.session) return state
  const previousSession = state.session
  const sense = senses.find(
    (s) => s.id === previousSession.current.senseId && s.version === previousSession.current.senseVersion,
  )
  const example = sense?.examples.find(
    (e) => e.id === previousSession.current.exampleId && e.version === previousSession.current.exampleVersion,
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
