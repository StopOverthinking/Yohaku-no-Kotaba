import { create } from 'zustand'
import { buildExamResult, createExamSession } from '@/features/exam/examEngine'
import {
  clearExamResult,
  clearExamSessionRecord,
  loadExamResult,
  loadExamSessionRecord,
  loadExamWrongAnswerIds,
  saveExamResult,
  saveExamSessionRecord,
  saveExamWrongAnswerIds,
} from '@/features/exam/examStorage'
import { EXAM_MANUAL_UNDO_LIMIT, type ExamManualUndoSnapshot, type ExamResult, type ExamSessionRecord, type StartExamPayload } from '@/features/exam/examTypes'
import { filterNonComparisonWordIds, getStudyItemAnswerText, getStudyItemById, getStudyItemWrongAnswerWordIds } from '@/features/vocab/model/selectors'

type SubmitAnswerOutcome = 'idle' | 'advanced' | 'revealed' | 'completed'

type ExamState = {
  status: 'idle' | 'active' | 'complete'
  session: ExamSessionRecord | null
  lastResult: ExamResult | null
  wrongAnswerIds: string[]
  hydrate: () => void
  startExam: (payload: StartExamPayload) => void
  submitAnswer: (answer: string) => SubmitAnswerOutcome
  revealManualAnswer: () => SubmitAnswerOutcome
  markManualGrade: (isCorrect: boolean) => SubmitAnswerOutcome
  goToPreviousManualQuestion: () => void
  saveDraftAnswer: (answer: string) => void
  clearSession: () => void
  clearResult: () => void
}

function createManualUndoSnapshot(session: ExamSessionRecord): ExamManualUndoSnapshot {
  return {
    currentIndex: session.currentIndex,
    manualGrades: [...session.manualGrades],
    isAnswerRevealed: session.isAnswerRevealed,
  }
}

function pushManualUndoSnapshot(history: ExamManualUndoSnapshot[], snapshot: ExamManualUndoSnapshot) {
  return [...history, snapshot].slice(-EXAM_MANUAL_UNDO_LIMIT)
}

function normalizeWrongAnswerIds(wordIds: string[]) {
  return [...new Set(filterNonComparisonWordIds(wordIds))]
}

function resolveWrongAnswerIds(result: ExamResult, previousWrongAnswerIds: string[]) {
  const nextWrongAnswerIds = normalizeWrongAnswerIds(
    result.wrongItems.flatMap((item) => {
      const resolvedWordIds = getStudyItemWrongAnswerWordIds(item.itemId)
      return resolvedWordIds.length > 0 ? resolvedWordIds : [item.itemId]
    }),
  )

  return nextWrongAnswerIds.length > 0 ? nextWrongAnswerIds : normalizeWrongAnswerIds(previousWrongAnswerIds)
}

function completeExam(record: ExamSessionRecord, previousWrongAnswerIds: string[]) {
  const result = buildExamResult(record, (itemId) => {
    const item = getStudyItemById(itemId)

    if (!item) {
      return undefined
    }

    return {
      id: item.id,
      kind: item.kind,
      expectedAnswer: getStudyItemAnswerText(item),
    }
  })
  const wrongAnswerIds = resolveWrongAnswerIds(result, previousWrongAnswerIds)

  clearExamSessionRecord()
  saveExamResult(result)
  saveExamWrongAnswerIds(wrongAnswerIds)

  return { result, wrongAnswerIds }
}

export const useExamStore = create<ExamState>((set, get) => ({
  status: 'idle',
  session: null,
  lastResult: null,
  wrongAnswerIds: [],
  hydrate: () => {
    const session = loadExamSessionRecord()
    const lastResult = loadExamResult()
    const loadedWrongAnswerIds = loadExamWrongAnswerIds()
    const storedWrongAnswerIds = normalizeWrongAnswerIds(loadedWrongAnswerIds)
    const resultWrongAnswerIds = lastResult ? resolveWrongAnswerIds(lastResult, []) : []
    const wrongAnswerIds = storedWrongAnswerIds.length > 0 ? storedWrongAnswerIds : resultWrongAnswerIds

    if (
      wrongAnswerIds.length !== loadedWrongAnswerIds.length
      || wrongAnswerIds.some((wordId, index) => wordId !== loadedWrongAnswerIds[index])
    ) {
      saveExamWrongAnswerIds(wrongAnswerIds)
    }

    set({
      status: session ? 'active' : lastResult ? 'complete' : 'idle',
      session,
      lastResult,
      wrongAnswerIds,
    })
  },
  startExam: (payload) => {
    const session = createExamSession(payload)
    saveExamSessionRecord(session)
    clearExamResult()

    set({
      status: 'active',
      session,
      lastResult: null,
    })
  },
  submitAnswer: (answer) => {
    const session = get().session
    if (!session) return 'idle'
    if (session.gradingMode === 'manual') return 'idle'

    const nextRecord: ExamSessionRecord = {
      ...session,
      userAnswers: session.userAnswers.map((value, index) => index === session.currentIndex ? answer : value),
      updatedAt: new Date().toISOString(),
    }

    if (session.currentIndex < session.questionIds.length - 1) {
      const advancedRecord: ExamSessionRecord = {
        ...nextRecord,
        currentIndex: session.currentIndex + 1,
      }

      saveExamSessionRecord(advancedRecord)
      set({
        status: 'active',
        session: advancedRecord,
      })
      return 'advanced'
    }

    const { result, wrongAnswerIds } = completeExam(nextRecord, get().wrongAnswerIds)
    set({
      status: 'complete',
      session: null,
      lastResult: result,
      wrongAnswerIds,
    })
    return 'completed'
  },
  revealManualAnswer: () => {
    const session = get().session
    if (!session || session.gradingMode !== 'manual' || session.isAnswerRevealed) return 'idle'

    const revealedRecord: ExamSessionRecord = {
      ...session,
      isAnswerRevealed: true,
      updatedAt: new Date().toISOString(),
    }

    saveExamSessionRecord(revealedRecord)
    set({
      status: 'active',
      session: revealedRecord,
    })
    return 'revealed'
  },
  markManualGrade: (isCorrect) => {
    const session = get().session
    if (!session || session.gradingMode !== 'manual' || !session.isAnswerRevealed) return 'idle'
    const manualUndoHistory = pushManualUndoSnapshot(session.manualUndoHistory, createManualUndoSnapshot(session))

    const nextRecord: ExamSessionRecord = {
      ...session,
      manualGrades: session.manualGrades.map((value, index) => index === session.currentIndex ? isCorrect : value),
      manualUndoHistory,
      updatedAt: new Date().toISOString(),
    }

    if (session.currentIndex < session.questionIds.length - 1) {
      const advancedRecord: ExamSessionRecord = {
        ...nextRecord,
        currentIndex: session.currentIndex + 1,
        isAnswerRevealed: false,
      }

      saveExamSessionRecord(advancedRecord)
      set({
        status: 'active',
        session: advancedRecord,
      })
      return 'advanced'
    }

    const { result, wrongAnswerIds } = completeExam(nextRecord, get().wrongAnswerIds)
    set({
      status: 'complete',
      session: null,
      lastResult: result,
      wrongAnswerIds,
    })
    return 'completed'
  },
  goToPreviousManualQuestion: () => {
    const session = get().session
    if (!session || session.gradingMode !== 'manual') return
    if (session.manualUndoHistory.length === 0 || session.manualUndoUsedCount >= EXAM_MANUAL_UNDO_LIMIT) return

    const restoredSnapshot = session.manualUndoHistory[session.manualUndoHistory.length - 1]
    const restoredRecord: ExamSessionRecord = {
      ...session,
      ...restoredSnapshot,
      manualUndoHistory: session.manualUndoHistory.slice(0, -1),
      manualUndoUsedCount: session.manualUndoUsedCount + 1,
      updatedAt: new Date().toISOString(),
    }

    saveExamSessionRecord(restoredRecord)
    set({
      status: 'active',
      session: restoredRecord,
    })
  },
  saveDraftAnswer: (answer) => {
    const session = get().session
    if (!session || session.gradingMode === 'manual') return
    if (session.userAnswers[session.currentIndex] === answer) return

    const draftRecord: ExamSessionRecord = {
      ...session,
      userAnswers: session.userAnswers.map((value, index) => index === session.currentIndex ? answer : value),
      updatedAt: new Date().toISOString(),
    }

    saveExamSessionRecord(draftRecord)
    set({
      status: 'active',
      session: draftRecord,
    })
  },
  clearSession: () => {
    clearExamSessionRecord()
    set((state) => ({
      status: state.lastResult ? 'complete' : 'idle',
      session: null,
    }))
  },
  clearResult: () => {
    clearExamResult()
    set((state) => ({
      status: state.session ? 'active' : 'idle',
      lastResult: null,
    }))
  },
}))
