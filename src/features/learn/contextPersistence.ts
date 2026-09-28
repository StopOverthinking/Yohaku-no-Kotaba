import type { ContextState } from './contextTypes'
import { expandContextState } from './contextSerialization'

export const CONTEXT_STORAGE_KEY = 'jsp-react:context-learn-v2'

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

function profile(value: unknown): boolean {
  if (
    !record(value) ||
    typeof value.senseId !== 'string' ||
    !positive(value.version) ||
    !date(value.due) ||
    !date(value.lastDay) ||
    !date(value.levelDay) ||
    (value.failedDay !== null && !date(value.failedDay)) ||
    !count(value.step) ||
    (value.step as number) > 7 ||
    !count(value.failures) ||
    !count(value.failedDays) ||
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
  const state: unknown = expandContextState(JSON.parse(raw))
  if (
    !record(state) ||
    state.version !== 2 ||
    !count(state.revision) ||
    !level(state.level) ||
    !record(state.profiles) ||
    !Array.isArray(state.history) ||
    (state.session !== null && !session(state.session))
  )
    throw new Error('학습 기록을 읽을 수 없습니다.')
  if (
    !Object.entries(state.profiles).every(
      ([key, value]) => profile(value) && record(value) && key === `${value.senseId}@${value.version}`,
    )
  )
    throw new Error('학습 기록 형식이 올바르지 않습니다.')
  for (const entry of state.history) {
    if (
      !record(entry) ||
      typeof entry.profileKey !== 'string' ||
      !level(entry.level) ||
      !session(entry.session) ||
      (entry.profile !== null &&
        (!profile(entry.profile) ||
          !record(entry.profile) ||
          entry.profileKey !== `${entry.profile.senseId}@${entry.profile.version}`))
    )
      throw new Error('이전 카드 기록을 읽을 수 없습니다.')
  }
  return state as ContextState
}
