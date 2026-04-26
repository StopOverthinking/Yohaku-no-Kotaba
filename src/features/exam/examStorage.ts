import { normalizeExamResult, normalizeExamSessionRecord } from '@/features/exam/examEngine'
import type { ExamResult, ExamSessionRecord } from '@/features/exam/examTypes'

const examSessionKey = 'jsp-react:exam-session'
const examResultKey = 'jsp-react:exam-result'
const examWrongAnswerIdsKey = 'jsp-react:exam-wrong-answer-ids'

export function loadExamSessionRecord(): ExamSessionRecord | null {
  const raw = localStorage.getItem(examSessionKey)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    const normalized = normalizeExamSessionRecord(parsed)
    if (!normalized) {
      localStorage.removeItem(examSessionKey)
    }
    return normalized
  } catch {
    localStorage.removeItem(examSessionKey)
    return null
  }
}

export function saveExamSessionRecord(record: ExamSessionRecord) {
  localStorage.setItem(examSessionKey, JSON.stringify(record))
}

export function clearExamSessionRecord() {
  localStorage.removeItem(examSessionKey)
}

export function loadExamResult(): ExamResult | null {
  const raw = localStorage.getItem(examResultKey)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    const normalized = normalizeExamResult(parsed)
    if (!normalized) {
      localStorage.removeItem(examResultKey)
      return null
    }
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      saveExamResult(normalized)
    }
    return normalized
  } catch {
    localStorage.removeItem(examResultKey)
    return null
  }
}

export function saveExamResult(result: ExamResult) {
  localStorage.setItem(examResultKey, JSON.stringify(result))
}

export function clearExamResult() {
  localStorage.removeItem(examResultKey)
}

export function loadExamWrongAnswerIds() {
  const raw = localStorage.getItem(examWrongAnswerIdsKey)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    localStorage.removeItem(examWrongAnswerIdsKey)
    return []
  }
}

export function saveExamWrongAnswerIds(wordIds: string[]) {
  localStorage.setItem(examWrongAnswerIdsKey, JSON.stringify(wordIds))
}
