import type { SmartReviewPrompt, VocabularyWord } from '@/features/vocab/model/types'

export type SmartReviewScheduleRecord = {
  wordId: string
  dueAt: string | null
  intervalDays: number | null
  updatedAt: string
}

export type SmartReviewProfile = SmartReviewScheduleRecord

export type SmartReviewProfileMap = Record<string, SmartReviewScheduleRecord>

export type SmartReviewScheduleBackup = {
  schemaVersion: 'jsp-smart-review-schedule-v1'
  exportedAt: string
  recordCount: number
  data: SmartReviewScheduleRecord[]
}

export type SmartReviewSessionItemState = {
  wordId: string
  attempts: number
  wrongCount: number
  answeredCorrectly: boolean
}

export type SmartReviewSessionItemStateMap = Record<string, SmartReviewSessionItemState>

export type StartSmartReviewPayload = {
  setId: string | 'all' | 'favorites'
  setName: string
  words: VocabularyWord[]
  wordCount: number
}

export type SmartReviewSessionRecord = {
  status: 'active'
  setId: string | 'all' | 'favorites'
  setName: string
  selectedWordIds: string[]
  activeQueue: string[]
  retryQueue: string[]
  currentIndex: number
  currentWordId: string | null
  round: number
  itemStates: SmartReviewSessionItemStateMap
  isAnswerRevealed: boolean
  revealedIsCorrect: boolean | null
  revealedAnswer: string
  startedAt: string
  updatedAt: string
}

export type SmartReviewSessionResult = {
  setId: string | 'all' | 'favorites'
  setName: string
  totalWords: number
  reviewCount: number
  wrongWordIds: string[]
  reviewedItems: Array<{
    wordId: string
    dueAt: string | null
    nextReviewInDays: number | null
    wasWrong: boolean
  }>
  completedAt: string
}

export type SmartReviewSubmitOutcome = {
  kind: 'idle' | 'graded'
  wordId: string | null
  submittedAnswer: string
  expectedAnswer: string
  isCorrect: boolean
}

export type SmartReviewStudyPrompt = SmartReviewPrompt

export type SmartReviewSetupSummary = {
  dueCount: number
  newCount: number
  learningCount: number
  masteredCount: number
}
