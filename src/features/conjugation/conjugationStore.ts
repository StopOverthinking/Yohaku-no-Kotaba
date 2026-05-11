import { create } from 'zustand'
import { gradeConjugationAnswer } from '@/features/conjugation/conjugationGrading'
import { buildConjugationResult, createConjugationSessionRecord } from '@/features/conjugation/conjugationEngine'
import {
  clearConjugationResult,
  clearConjugationSessionRecord,
  loadConjugationResult,
  loadConjugationSessionRecord,
  saveConjugationResult,
  saveConjugationSessionRecord,
} from '@/features/conjugation/conjugationStorage'
import type { ConjugationResult, ConjugationSessionRecord, StartConjugationSessionPayload } from '@/features/conjugation/conjugationTypes'

type SubmitOutcome = 'idle' | 'revealed'
type AdvanceOutcome = 'idle' | 'advanced' | 'completed'

type ConjugationState = {
  status: 'idle' | 'active' | 'complete'
  session: ConjugationSessionRecord | null
  lastResult: ConjugationResult | null
  hydrate: () => void
  startSession: (payload: StartConjugationSessionPayload) => boolean
  submitAnswer: (answer: string) => SubmitOutcome
  saveDraftAnswer: (answer: string) => void
  advanceAfterReveal: () => AdvanceOutcome
  restartWrongQuestions: () => boolean
  clearSession: () => void
  clearResult: () => void
}

function completeSession(record: ConjugationSessionRecord) {
  const result = buildConjugationResult(record)
  clearConjugationSessionRecord()
  saveConjugationResult(result)
  return result
}

export const useConjugationStore = create<ConjugationState>((set, get) => ({
  status: 'idle',
  session: null,
  lastResult: null,
  hydrate: () => {
    const session = loadConjugationSessionRecord()
    const lastResult = loadConjugationResult()

    set({
      status: session ? 'active' : lastResult ? 'complete' : 'idle',
      session,
      lastResult,
    })
  },
  startSession: (payload) => {
    const session = createConjugationSessionRecord(payload)
    if (session.questions.length === 0) {
      return false
    }

    saveConjugationSessionRecord(session)
    clearConjugationResult()

    set({
      status: 'active',
      session,
      lastResult: null,
    })

    return true
  },
  submitAnswer: (answer) => {
    const session = get().session
    if (!session || session.isAnswerRevealed) return 'idle'

    const currentQuestion = session.questions[session.currentIndex]
    if (!currentQuestion) return 'idle'

    const attempt = gradeConjugationAnswer(currentQuestion, answer)
    const nextRecord: ConjugationSessionRecord = {
      ...session,
      attempts: session.attempts.map((value, index) => (index === session.currentIndex ? attempt : value)),
      isAnswerRevealed: true,
      draftAnswer: '',
      updatedAt: new Date().toISOString(),
    }

    saveConjugationSessionRecord(nextRecord)
    set({
      status: 'active',
      session: nextRecord,
    })

    return 'revealed'
  },
  saveDraftAnswer: (answer) => {
    const session = get().session
    if (!session || session.isAnswerRevealed || session.draftAnswer === answer) return

    const nextRecord: ConjugationSessionRecord = {
      ...session,
      draftAnswer: answer,
      updatedAt: new Date().toISOString(),
    }

    saveConjugationSessionRecord(nextRecord)
    set({
      status: 'active',
      session: nextRecord,
    })
  },
  advanceAfterReveal: () => {
    const session = get().session
    if (!session || !session.isAnswerRevealed) return 'idle'

    if (session.currentIndex < session.questions.length - 1) {
      const nextRecord: ConjugationSessionRecord = {
        ...session,
        currentIndex: session.currentIndex + 1,
        isAnswerRevealed: false,
        draftAnswer: '',
        updatedAt: new Date().toISOString(),
      }

      saveConjugationSessionRecord(nextRecord)
      set({
        status: 'active',
        session: nextRecord,
      })
      return 'advanced'
    }

    const result = completeSession(session)
    set({
      status: 'complete',
      session: null,
      lastResult: result,
    })
    return 'completed'
  },
  restartWrongQuestions: () => {
    const lastResult = get().lastResult
    if (!lastResult || lastResult.wrongItems.length === 0) {
      return false
    }

    const session: ConjugationSessionRecord = {
      status: 'active',
      setId: lastResult.setId,
      setName: `${lastResult.setName} 오답 복습`,
      promptMode: lastResult.promptMode,
      selectedForms: lastResult.selectedForms,
      questions: lastResult.wrongItems.map((item) => item.question),
      attempts: new Array(lastResult.wrongItems.length).fill(null),
      currentIndex: 0,
      isAnswerRevealed: false,
      draftAnswer: '',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    saveConjugationSessionRecord(session)
    set({
      status: 'active',
      session,
    })
    return true
  },
  clearSession: () => {
    clearConjugationSessionRecord()
    set((state) => ({
      status: state.lastResult ? 'complete' : 'idle',
      session: null,
    }))
  },
  clearResult: () => {
    clearConjugationResult()
    set((state) => ({
      status: state.session ? 'active' : 'idle',
      lastResult: null,
    }))
  },
}))
