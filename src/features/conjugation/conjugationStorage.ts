import type { ConjugationResult, ConjugationSessionRecord } from '@/features/conjugation/conjugationTypes'

const conjugationSessionKey = 'jsp-react:conjugation-session'
const conjugationResultKey = 'jsp-react:conjugation-result'

export function loadConjugationSessionRecord(): ConjugationSessionRecord | null {
  const raw = localStorage.getItem(conjugationSessionKey)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as ConjugationSessionRecord
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0 || !Array.isArray(parsed.attempts)) {
      localStorage.removeItem(conjugationSessionKey)
      return null
    }

    return {
      ...parsed,
      draftAnswer: typeof parsed.draftAnswer === 'string' ? parsed.draftAnswer : '',
    }
  } catch {
    localStorage.removeItem(conjugationSessionKey)
    return null
  }
}

export function saveConjugationSessionRecord(record: ConjugationSessionRecord) {
  localStorage.setItem(conjugationSessionKey, JSON.stringify(record))
}

export function clearConjugationSessionRecord() {
  localStorage.removeItem(conjugationSessionKey)
}

export function loadConjugationResult(): ConjugationResult | null {
  const raw = localStorage.getItem(conjugationResultKey)
  if (!raw) return null

  try {
    return JSON.parse(raw) as ConjugationResult
  } catch {
    localStorage.removeItem(conjugationResultKey)
    return null
  }
}

export function saveConjugationResult(result: ConjugationResult) {
  localStorage.setItem(conjugationResultKey, JSON.stringify(result))
}

export function clearConjugationResult() {
  localStorage.removeItem(conjugationResultKey)
}
