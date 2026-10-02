import type { ContextState } from './contextTypes'
import { REVIEW_INTERVALS, SCHEDULE_VERSION } from './contextReviewPolicy'
import { expandContextState } from './contextSerialization'

export const CONTEXT_STORAGE_KEY = 'jsp-react:context-learn-v2'

const LEGACY_INTERVALS = [1, 3, 7, 14, 30, 60, 120, 180] as const

export class UnsupportedContextVersionError extends Error {
  constructor(readonly kind: 'state' | 'schedule') {
    super(kind === 'schedule'
      ? '이 앱에서 지원하지 않는 복습 정책 버전입니다.'
      : '이 앱에서 지원하지 않는 학습 기록 버전입니다.')
    this.name = 'UnsupportedContextVersionError'
  }
}

type RecordValue = Record<string, unknown>
const record = (value: unknown): value is RecordValue =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown) => Number.isInteger(value) && (value as number) >= 0
const positive = (value: unknown) => count(value) && (value as number) > 0
const strings = (value: unknown) => Array.isArray(value) && value.every((id) => typeof id === 'string')
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const level = (value: unknown) =>
  record(value) && Number.isFinite(value.value) && strings(value.assessedWordIds)
const card = (value: unknown) =>
  record(value) &&
  typeof value.senseId === 'string' &&
  typeof value.exampleId === 'string' &&
  positive(value.senseVersion) &&
  positive(value.exampleVersion)
const cards = (value: unknown) => Array.isArray(value) && value.every(card)

function profile(value: unknown, stepCount: number): boolean {
  if (
    !record(value) ||
    typeof value.senseId !== 'string' ||
    !positive(value.version) ||
    !date(value.due) ||
    !date(value.lastDay) ||
    !date(value.levelDay) ||
    (value.failedDay !== null && !date(value.failedDay)) ||
    !count(value.step) ||
    (value.step as number) >= stepCount ||
    !count(value.failures) ||
    !count(value.failedDays) ||
    (value.mastered !== undefined && typeof value.mastered !== 'boolean') ||
    !positive(value.dailyAttempts) ||
    typeof value.lastExampleId !== 'string' ||
    !record(value.examples)
  )
    return false
  return Object.values(value.examples).every(
    (stats) => record(stats) && [stats.seen, stats.failures, stats.hints].every(count),
  )
}

function session(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    typeof value.setName === 'string' &&
    typeof value.setId === 'string' &&
    [value.candidateWordIds, value.requiredWordIds, value.tieOrder, value.unknownWordIds].every(strings) &&
    [value.cards, value.queue, value.retry].every(cards) &&
    card(value.current) &&
    positive(value.round) &&
    positive(value.targetCount) &&
    count(value.decisions) &&
    [value.allowEarly, value.revealed, value.hintShown, value.hintUsed].every(
      (flag) => typeof flag === 'boolean',
    )
  )
}

export function parseContextState(raw: string): ContextState {
  const parsed: unknown = JSON.parse(raw)
  // Reject unknown contracts before attempting to expand their undo encoding.
  if (record(parsed)) {
    if (Number.isInteger(parsed.version) && parsed.version !== 2 && parsed.version !== 3)
      throw new UnsupportedContextVersionError('state')
    if (Number.isInteger(parsed.scheduleVersion) && parsed.scheduleVersion !== 1 && parsed.scheduleVersion !== 2 && parsed.scheduleVersion !== SCHEDULE_VERSION)
      throw new UnsupportedContextVersionError('schedule')
  }
  const state: unknown = expandContextState(parsed)
  if (
    !record(state) ||
    (state.version !== 2 && state.version !== 3) ||
    (state.scheduleVersion !== undefined && state.scheduleVersion !== 1 && state.scheduleVersion !== 2 && state.scheduleVersion !== SCHEDULE_VERSION) ||
    !count(state.revision) ||
    !level(state.level) ||
    (state.lastScoreChange !== undefined &&
      (!record(state.lastScoreChange) ||
        !Number.isFinite(state.lastScoreChange.before) ||
        !Number.isFinite(state.lastScoreChange.after) ||
        typeof state.lastScoreChange.completedAt !== 'string')) ||
    !record(state.profiles) ||
    !Array.isArray(state.history) ||
    (state.session !== null && !session(state.session))
  )
    throw new Error('학습 기록을 읽을 수 없습니다.')
  const legacy = state.scheduleVersion === undefined || state.scheduleVersion === 1
  const stepCount = legacy ? LEGACY_INTERVALS.length : REVIEW_INTERVALS.length
  if (
    !Object.entries(state.profiles).every(
      ([key, value]) => profile(value, stepCount) && record(value) && key === `${value.senseId}@${value.version}`,
    )
  )
    throw new Error('학습 기록 형식이 올바르지 않습니다.')
  if (state.version === 3) {
    if (legacy || !record(state.aliasMigrations) || !Object.keys(state.aliasMigrations).length)
      throw new Error('단어 연결 원본 기록이 없습니다.')
    const archivedWords = new Set<string>()
    for (const [id, migration] of Object.entries(state.aliasMigrations)) {
      if (!record(migration) || !record(migration.group) || migration.group.id !== id || !id ||
          typeof migration.group.representativeWordId !== 'string' || !Array.isArray(migration.group.members) ||
          migration.group.members.length < 2 || !date(migration.day) || !level(migration.level) || !record(migration.profiles))
        throw new Error('단어 연결 원본 기록이 올바르지 않습니다.')
      const keys = new Set<string>()
      let representatives = 0
      for (const member of migration.group.members) {
        if (!record(member) || typeof member.wordId !== 'string' || !member.wordId ||
            typeof member.senseId !== 'string' || !member.senseId || !positive(member.version) || archivedWords.has(member.wordId))
          throw new Error('단어 연결 대상이 올바르지 않습니다.')
        archivedWords.add(member.wordId)
        keys.add(`${member.senseId}@${member.version}`)
        if (member.wordId === migration.group.representativeWordId) representatives++
      }
      if (representatives !== 1 || !Object.entries(migration.profiles).every(([key, value]) =>
        keys.has(key) && profile(value, stepCount) && record(value) && key === `${value.senseId}@${value.version}`))
        throw new Error('단어 연결 이전 프로필이 올바르지 않습니다.')
    }
  } else if (state.aliasMigrations !== undefined) {
    throw new Error('단어 연결 기록의 버전이 올바르지 않습니다.')
  }
  for (const entry of state.history) {
    if (
      !record(entry) ||
      typeof entry.profileKey !== 'string' ||
      !level(entry.level) ||
      !session(entry.session) ||
      (entry.profile !== null &&
        (!profile(entry.profile, stepCount) ||
          !record(entry.profile) ||
          entry.profileKey !== `${entry.profile.senseId}@${entry.profile.version}`))
    )
      throw new Error('이전 카드 기록을 읽을 수 없습니다.')
  }
  const result = state as ContextState
  if (legacy) {
    // Keep established dates and interval lengths, including every undo snapshot.
    const migrate = (value: ContextState['profiles'][string]) => {
      value.step = REVIEW_INTERVALS.indexOf(LEGACY_INTERVALS[value.step])
    }
    Object.values(result.profiles).forEach(migrate)
    result.history.forEach((entry) => { if (entry.profile) migrate(entry.profile) })
  }
  result.scheduleVersion = SCHEDULE_VERSION
  return result
}
