import { shuffleArray } from '@/lib/random'
import type { VocabularyWord } from '@/features/vocab/model/types'
import type {
  SmartReviewProfile,
  SmartReviewProfileMap,
  SmartReviewScheduleRecord,
  SmartReviewSessionItemState,
  SmartReviewSessionResult,
  SmartReviewSessionRecord,
  SmartReviewSetupSummary,
  SmartReviewStudyPrompt,
  StartSmartReviewPayload,
} from '@/features/smart-review/smartReviewTypes'

const REVIEW_INTERVALS_DAYS = [1, 2, 4, 7, 10, 14, 21, 30, 45, 90] as const
const LEGACY_REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30, 90] as const
const INITIAL_SUCCESS_INTERVAL_DAYS = 2

function addDays(base: Date, days: number) {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeDate(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value))
  }

  const parsed = Number.parseInt(String(value ?? fallback), 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

function parseInteger(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeUpdatedAt(value: unknown, fallback: string) {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function stageToIntervalDays(stage: number) {
  return LEGACY_REVIEW_INTERVALS_DAYS[stage] ?? null
}

function normalizeIntervalDays(value: unknown, fallback: number | null) {
  if (value === null) return null

  const parsed = parseInteger(value)
  if (parsed === null) return fallback
  if (parsed < 0) return fallback

  return REVIEW_INTERVALS_DAYS.includes(parsed as (typeof REVIEW_INTERVALS_DAYS)[number]) ? parsed : fallback
}

function getNextIntervalDays(intervalDays: number | null) {
  if (intervalDays === null) {
    return INITIAL_SUCCESS_INTERVAL_DAYS
  }

  const currentIndex = REVIEW_INTERVALS_DAYS.indexOf(intervalDays as (typeof REVIEW_INTERVALS_DAYS)[number])
  if (currentIndex >= 0) {
    return REVIEW_INTERVALS_DAYS[currentIndex + 1] ?? null
  }

  return REVIEW_INTERVALS_DAYS.find((candidate) => candidate > intervalDays) ?? null
}

function normalizeRequestedWordCount(wordCount: number) {
  return Math.max(1, Math.floor(wordCount) || 1)
}

export function hasSmartReviewPrompt(word: VocabularyWord) {
  return Boolean(
    word.smartReviewPrompt?.japaneseSentence.trim()
    && word.smartReviewPrompt.japaneseSentence.includes('____')
    && word.smartReviewPrompt.translationSentence.trim(),
  )
}

export function normalizeSmartReviewProfile(raw: unknown, wordId: string): SmartReviewProfile {
  const fallbackUpdatedAt = new Date().toISOString()
  if (!isObject(raw)) {
    return {
      ...createEmptyProfile(wordId),
      updatedAt: fallbackUpdatedAt,
    }
  }

  const dueAt = normalizeDate(raw.dueAt)
  const stage = parseInteger(raw.stage)
  const intervalDays = normalizeIntervalDays(raw.intervalDays, stage !== null && stage >= 0 ? stageToIntervalDays(stage) : null)
  const updatedAt = normalizeUpdatedAt(raw.updatedAt, normalizeDate(raw.lastReviewedAt) ?? dueAt ?? fallbackUpdatedAt)

  return {
    wordId,
    dueAt,
    intervalDays,
    updatedAt,
  }
}

export function normalizeSmartReviewProfileMap(raw: unknown): SmartReviewProfileMap {
  if (!isObject(raw)) return {}

  const entries = Object.entries(raw).map(([wordId, value]) => [wordId, normalizeSmartReviewProfile(value, wordId)] as const)
  return Object.fromEntries(entries)
}

export function createEmptyProfile(wordId: string): SmartReviewProfile {
  return {
    wordId,
    dueAt: null,
    intervalDays: null,
    updatedAt: '1970-01-01T00:00:00.000Z',
  }
}

export function normalizeSmartReviewSessionRecord(raw: unknown): SmartReviewSessionRecord | null {
  if (!isObject(raw)) return null
  if (!Array.isArray(raw.selectedWordIds) || !Array.isArray(raw.activeQueue)) return null

  const selectedWordIds = raw.selectedWordIds.filter((value): value is string => typeof value === 'string')
  const activeQueue = raw.activeQueue.filter((value): value is string => typeof value === 'string')
  const retryQueue = Array.isArray(raw.retryQueue)
    ? raw.retryQueue.filter((value): value is string => typeof value === 'string')
    : []

  if (selectedWordIds.length === 0 || activeQueue.length === 0) return null

  const currentIndex = Math.min(
    normalizeFiniteNumber(raw.currentIndex),
    Math.max(0, activeQueue.length - 1),
  )

  const rawItemStates = isObject(raw.itemStates) ? raw.itemStates : {}
  const itemStates = Object.fromEntries(
    selectedWordIds.map((wordId) => {
      const state = rawItemStates[wordId]
      const normalizedState: SmartReviewSessionItemState = isObject(state)
        ? {
            wordId,
            attempts: normalizeFiniteNumber(state.attempts),
            wrongCount: normalizeFiniteNumber(state.wrongCount),
            answeredCorrectly: Boolean(state.answeredCorrectly),
          }
        : {
            wordId,
            attempts: 0,
            wrongCount: 0,
            answeredCorrectly: false,
          }

      return [wordId, normalizedState]
    }),
  )

  return {
    status: 'active',
    setId:
      raw.setId === 'all' || raw.setId === 'favorites' || typeof raw.setId === 'string'
        ? raw.setId
        : 'all',
    setName: typeof raw.setName === 'string' && raw.setName.trim().length > 0 ? raw.setName : '스마트 복습',
    selectedWordIds,
    activeQueue,
    retryQueue,
    currentIndex,
    currentWordId:
      typeof raw.currentWordId === 'string' && raw.currentWordId.length > 0
        ? raw.currentWordId
        : activeQueue[currentIndex] ?? null,
    round: Math.max(1, normalizeFiniteNumber(raw.round, 1)),
    itemStates,
    isAnswerRevealed: Boolean(raw.isAnswerRevealed),
    revealedIsCorrect:
      raw.revealedIsCorrect === true ? true : raw.revealedIsCorrect === false ? false : null,
    revealedAnswer: typeof raw.revealedAnswer === 'string' ? raw.revealedAnswer : '',
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  }
}

export function buildSmartReviewSummary(words: VocabularyWord[], profileMap: SmartReviewProfileMap, now = new Date()): SmartReviewSetupSummary {
  let dueCount = 0
  let newCount = 0
  let learningCount = 0
  let masteredCount = 0

  for (const word of words) {
    if (!hasSmartReviewPrompt(word)) {
      continue
    }

    const profile = profileMap[word.id]
    if (!profile) {
      newCount += 1
      continue
    }

    if (!profile.dueAt) {
      masteredCount += 1
      continue
    }

    learningCount += 1

    if (new Date(profile.dueAt).getTime() <= now.getTime()) {
      dueCount += 1
    }
  }

  return { dueCount, newCount, learningCount, masteredCount }
}

export function selectSmartReviewWords(payload: StartSmartReviewPayload, profileMap: SmartReviewProfileMap, now = new Date()) {
  const requestedWordCount = normalizeRequestedWordCount(payload.wordCount)
  const dueWords: VocabularyWord[] = []
  const newWords: VocabularyWord[] = []
  const learningWords: VocabularyWord[] = []

  for (const word of payload.words) {
    if (!hasSmartReviewPrompt(word)) {
      continue
    }

    const profile = profileMap[word.id]
    if (!profile) {
      newWords.push(word)
      continue
    }

    if (!profile.dueAt) {
      continue
    }

    if (new Date(profile.dueAt).getTime() <= now.getTime()) {
      dueWords.push(word)
      continue
    }

    learningWords.push(word)
  }

  dueWords.sort((left, right) => {
    const leftProfile = profileMap[left.id]
    const rightProfile = profileMap[right.id]
    const leftDue = leftProfile?.dueAt ? new Date(leftProfile.dueAt).getTime() : 0
    const rightDue = rightProfile?.dueAt ? new Date(rightProfile.dueAt).getTime() : 0
    if (leftDue !== rightDue) return leftDue - rightDue
    return (left.difficulty ?? 0) - (right.difficulty ?? 0)
  })

  learningWords.sort((left, right) => {
    const leftProfile = profileMap[left.id]
    const rightProfile = profileMap[right.id]
    const leftDue = leftProfile?.dueAt ? new Date(leftProfile.dueAt).getTime() : 0
    const rightDue = rightProfile?.dueAt ? new Date(rightProfile.dueAt).getTime() : 0
    if (leftDue !== rightDue) return leftDue - rightDue
    return (left.difficulty ?? 0) - (right.difficulty ?? 0)
  })

  const shuffledNewWords = shuffleArray(newWords, now.getTime())
  const selected = [...dueWords]

  for (const word of shuffledNewWords) {
    if (selected.length >= requestedWordCount) break
    selected.push(word)
  }

  if (selected.length === 0) {
    selected.push(...learningWords.slice(0, requestedWordCount))
  }

  const queueSeed = (now.getTime() ^ 0x9e3779b9) >>> 0
  return shuffleArray(selected.slice(0, requestedWordCount), queueSeed)
}

export function createSmartReviewSession(payload: StartSmartReviewPayload, profileMap: SmartReviewProfileMap, now = new Date()): SmartReviewSessionRecord | null {
  const selectedWords = selectSmartReviewWords(payload, profileMap, now)
  if (selectedWords.length === 0) return null

  const selectedWordIds = selectedWords.map((word) => word.id)
  const itemStates = Object.fromEntries(
    selectedWordIds.map((wordId) => [
      wordId,
      {
        wordId,
        attempts: 0,
        wrongCount: 0,
        answeredCorrectly: false,
      } satisfies SmartReviewSessionItemState,
    ]),
  )

  const timestamp = now.toISOString()

  return {
    status: 'active',
    setId: payload.setId,
    setName: payload.setName,
    selectedWordIds,
    activeQueue: [...selectedWordIds],
    retryQueue: [],
    currentIndex: 0,
    currentWordId: selectedWordIds[0] ?? null,
    round: 1,
    itemStates,
    isAnswerRevealed: false,
    revealedIsCorrect: null,
    revealedAnswer: '',
    startedAt: timestamp,
    updatedAt: timestamp,
  }
}

export function advanceSmartReviewSession(record: SmartReviewSessionRecord, now = new Date()) {
  if (record.currentIndex < record.activeQueue.length - 1) {
    const currentIndex = record.currentIndex + 1
    return {
      done: false as const,
      record: {
        ...record,
        currentIndex,
        currentWordId: record.activeQueue[currentIndex] ?? null,
        isAnswerRevealed: false,
        revealedIsCorrect: null,
        revealedAnswer: '',
        updatedAt: now.toISOString(),
      },
    }
  }

  if (record.retryQueue.length > 0) {
    return {
      done: false as const,
      record: {
        ...record,
        activeQueue: [...record.retryQueue],
        retryQueue: [],
        currentIndex: 0,
        currentWordId: record.retryQueue[0] ?? null,
        round: record.round + 1,
        isAnswerRevealed: false,
        revealedIsCorrect: null,
        revealedAnswer: '',
        updatedAt: now.toISOString(),
      },
    }
  }

  return {
    done: true as const,
    record,
  }
}

export function gradeSmartReviewAnswer(expectedAnswer: string, submittedAnswer: string) {
  return normalizeReviewAnswer(expectedAnswer) === normalizeReviewAnswer(submittedAnswer)
}

export function normalizeReviewAnswer(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').trim()
}

export function createStudyPrompt(word: VocabularyWord): SmartReviewStudyPrompt | null {
  if (!hasSmartReviewPrompt(word)) {
    return null
  }

  return word.smartReviewPrompt ?? null
}

export function applySmartReviewOutcome(profileMap: SmartReviewProfileMap, session: SmartReviewSessionRecord, now = new Date()) {
  const nextProfiles = { ...profileMap }
  let promotedCount = 0
  let resetCount = 0
  let masteredCount = 0
  const updatedAt = now.toISOString()

  for (const wordId of session.selectedWordIds) {
    const currentProfile = nextProfiles[wordId] ?? createEmptyProfile(wordId)
    const itemState = session.itemStates[wordId]
    if (!itemState) continue

    const hadMistake = itemState.wrongCount > 0

    if (hadMistake) {
      const intervalDays = REVIEW_INTERVALS_DAYS[0]
      nextProfiles[wordId] = {
        wordId,
        dueAt: addDays(now, intervalDays).toISOString(),
        intervalDays,
        updatedAt,
      }
      resetCount += 1
      continue
    }

    const nextIntervalDays = getNextIntervalDays(currentProfile.intervalDays)

    if (nextIntervalDays === null) {
      nextProfiles[wordId] = {
        wordId,
        dueAt: null,
        intervalDays: null,
        updatedAt,
      }
      masteredCount += 1
      continue
    }

    nextProfiles[wordId] = {
      wordId,
      dueAt: addDays(now, nextIntervalDays).toISOString(),
      intervalDays: nextIntervalDays,
      updatedAt,
    }
    promotedCount += 1
  }

  return {
    nextProfiles,
    promotedCount,
    resetCount,
    masteredCount,
  }
}

export function buildSmartReviewResult(
  session: SmartReviewSessionRecord,
  nextProfiles: Record<string, SmartReviewScheduleRecord>,
  now = new Date(),
): SmartReviewSessionResult {
  const itemStates = Object.values(session.itemStates)
  const wrongWordIds = itemStates.filter((item) => item.wrongCount > 0).map((item) => item.wordId)

  return {
    setId: session.setId,
    setName: session.setName,
    totalWords: session.selectedWordIds.length,
    reviewCount: wrongWordIds.length,
    wrongWordIds,
    reviewedItems: session.selectedWordIds.map((wordId) => ({
      wordId,
      dueAt: nextProfiles[wordId]?.dueAt ?? null,
      nextReviewInDays: nextProfiles[wordId]?.intervalDays ?? null,
      wasWrong: (session.itemStates[wordId]?.wrongCount ?? 0) > 0,
    })),
    completedAt: now.toISOString(),
  }
}
