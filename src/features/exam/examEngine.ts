import { shuffleArray } from '@/lib/random'
import type { StudyItem } from '@/features/vocab/model/types'
import {
  EXAM_MANUAL_UNDO_LIMIT,
  type ExamGradingMode,
  type ExamManualGrade,
  type ExamManualUndoSnapshot,
  type ExamResult,
  type ExamSessionRecord,
  type StartExamPayload,
} from '@/features/exam/examTypes'

type ResolvedItem = Pick<StudyItem, 'kind'> & {
  id: string
  expectedAnswer: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readLegacyWrongItemId(value: Record<string, unknown>) {
  const nestedWord = isObject(value.word) ? readString(value.word.id) ?? readString(value.word.wordId) : null
  const nestedStudyItem = isObject(value.studyItem) ? readString(value.studyItem.id) : null

  return readString(value.itemId)
    ?? readString(value.wordId)
    ?? readString(value.id)
    ?? nestedWord
    ?? nestedStudyItem
}

export function normalizeExamGradingMode(mode: unknown): ExamGradingMode {
  return mode === 'manual' ? 'manual' : 'auto'
}

export function normalizeManualGrades(savedGrades: unknown, expectedLength: number): ExamManualGrade[] {
  const normalized = Array.isArray(savedGrades) ? savedGrades.slice(0, expectedLength) : []

  while (normalized.length < expectedLength) {
    normalized.push(null)
  }

  return normalized.map((value) => {
    if (value === true) return true
    if (value === false) return false
    return null
  })
}

function normalizeManualUndoSnapshots(savedSnapshots: unknown, expectedLength: number): ExamManualUndoSnapshot[] {
  if (!Array.isArray(savedSnapshots)) return []

  return savedSnapshots
    .slice(-EXAM_MANUAL_UNDO_LIMIT)
    .flatMap((value) => {
      if (!isObject(value)) return []

      const parsedIndex = typeof value.currentIndex === 'number'
        ? value.currentIndex
        : Number.parseInt(String(value.currentIndex ?? 0), 10)

      const currentIndex = Number.isFinite(parsedIndex)
        ? Math.min(Math.max(Math.trunc(parsedIndex), 0), Math.max(expectedLength - 1, 0))
        : 0

      return [{
        currentIndex,
        manualGrades: normalizeManualGrades(value.manualGrades, expectedLength),
        isAnswerRevealed: Boolean(value.isAnswerRevealed),
      }]
    })
}

export function createExamSession(payload: StartExamPayload, seed = Date.now()): ExamSessionRecord {
  const questionIds = shuffleArray((payload.items ?? payload.words?.map((word) => ({ id: word.id })) ?? []).map((item) => item.id), seed)
  const now = new Date().toISOString()

  return {
    status: 'active',
    setId: payload.setId,
    setName: payload.setName,
    gradingMode: normalizeExamGradingMode(payload.gradingMode),
    questionIds,
    userAnswers: new Array(questionIds.length).fill(''),
    manualGrades: new Array(questionIds.length).fill(null),
    manualUndoHistory: [],
    manualUndoUsedCount: 0,
    currentIndex: 0,
    isAnswerRevealed: false,
    startedAt: now,
    updatedAt: now,
  }
}

export function normalizeExamSessionRecord(raw: unknown): ExamSessionRecord | null {
  if (!isObject(raw)) return null
  if (!Array.isArray(raw.questionIds) || raw.questionIds.length === 0) return null

  const questionIds = raw.questionIds.filter((value): value is string => typeof value === 'string')
  if (questionIds.length === 0) return null

  const userAnswers = Array.isArray(raw.userAnswers)
    ? raw.userAnswers.slice(0, questionIds.length).map((value) => (typeof value === 'string' ? value : ''))
    : []

  while (userAnswers.length < questionIds.length) {
    userAnswers.push('')
  }

  const manualGrades = normalizeManualGrades(raw.manualGrades, questionIds.length)
  const manualUndoHistory = normalizeManualUndoSnapshots(raw.manualUndoHistory, questionIds.length)
  const parsedUndoCount = typeof raw.manualUndoUsedCount === 'number'
    ? raw.manualUndoUsedCount
    : Number.parseInt(String(raw.manualUndoUsedCount ?? 0), 10)
  const manualUndoUsedCount = Number.isFinite(parsedUndoCount)
    ? Math.min(Math.max(Math.trunc(parsedUndoCount), 0), EXAM_MANUAL_UNDO_LIMIT)
    : 0
  const parsedIndex = typeof raw.currentIndex === 'number' ? raw.currentIndex : Number.parseInt(String(raw.currentIndex ?? 0), 10)
  const currentIndex = Number.isFinite(parsedIndex)
    ? Math.min(Math.max(Math.trunc(parsedIndex), 0), questionIds.length - 1)
    : 0

  return {
    status: 'active',
    setId: typeof raw.setId === 'string' ? raw.setId : 'wrong_answers',
    setName: typeof raw.setName === 'string' && raw.setName.trim().length > 0 ? raw.setName : '시험',
    gradingMode: normalizeExamGradingMode(raw.gradingMode),
    questionIds,
    userAnswers,
    manualGrades,
    manualUndoHistory,
    manualUndoUsedCount,
    currentIndex,
    isAnswerRevealed: Boolean(raw.isAnswerRevealed) && normalizeExamGradingMode(raw.gradingMode) === 'manual',
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  }
}

export function normalizeExamResult(raw: unknown): ExamResult | null {
  if (!isObject(raw)) return null

  const questionIds = Array.isArray(raw.questionIds)
    ? raw.questionIds.filter((value): value is string => typeof value === 'string')
    : []
  const wrongItems = Array.isArray(raw.wrongItems)
    ? raw.wrongItems.flatMap((value) => {
        if (typeof value === 'string' && value.trim().length > 0) {
          return [{ itemId: value }]
        }
        if (!isObject(value)) return []

        const itemId = readLegacyWrongItemId(value)
        if (!itemId) return []

        const userAnswer = typeof value.userAnswer === 'string'
          ? value.userAnswer
          : typeof value.answer === 'string'
            ? value.answer
            : undefined

        return userAnswer === undefined ? [{ itemId }] : [{ itemId, userAnswer }]
      })
    : []

  if (questionIds.length === 0 && wrongItems.length === 0) return null

  const parsedTotalQuestions = typeof raw.totalQuestions === 'number'
    ? raw.totalQuestions
    : Number.parseInt(String(raw.totalQuestions ?? questionIds.length), 10)
  const totalQuestions = Number.isFinite(parsedTotalQuestions)
    ? Math.max(Math.trunc(parsedTotalQuestions), questionIds.length, wrongItems.length)
    : Math.max(questionIds.length, wrongItems.length)
  const parsedCorrectCount = typeof raw.correctCount === 'number'
    ? raw.correctCount
    : Number.parseInt(String(raw.correctCount ?? totalQuestions - wrongItems.length), 10)
  const correctCount = Number.isFinite(parsedCorrectCount)
    ? Math.min(Math.max(Math.trunc(parsedCorrectCount), 0), totalQuestions)
    : Math.max(0, totalQuestions - wrongItems.length)

  return {
    setId: typeof raw.setId === 'string' ? raw.setId : 'wrong_answers',
    setName: typeof raw.setName === 'string' && raw.setName.trim().length > 0 ? raw.setName : '시험',
    gradingMode: normalizeExamGradingMode(raw.gradingMode),
    questionIds,
    correctCount,
    totalQuestions,
    wrongItems,
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : new Date().toISOString(),
  }
}

export function buildExamResult(
  record: ExamSessionRecord,
  resolveItem: (itemId: string) => ResolvedItem | undefined,
): ExamResult {
  const wrongItems = record.questionIds.flatMap((itemId, index) => {
    const item = resolveItem(itemId)
    const userAnswer = record.userAnswers[index] ?? ''
    const isCorrect = record.gradingMode === 'manual'
      ? record.manualGrades[index] === true
      : item !== undefined && userAnswer === item.expectedAnswer

    if (isCorrect) {
      return []
    }

    return record.gradingMode === 'manual'
      ? [{ itemId }]
      : [{ itemId, userAnswer }]
  })

  return {
    setId: record.setId,
    setName: record.setName,
    gradingMode: record.gradingMode,
    questionIds: [...record.questionIds],
    correctCount: Math.max(0, record.questionIds.length - wrongItems.length),
    totalQuestions: record.questionIds.length,
    wrongItems,
    completedAt: new Date().toISOString(),
  }
}
