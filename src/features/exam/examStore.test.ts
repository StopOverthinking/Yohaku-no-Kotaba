import { beforeEach, describe, expect, it } from 'vitest'
import { useExamStore } from '@/features/exam/examStore'
import { EXAM_MANUAL_UNDO_LIMIT } from '@/features/exam/examTypes'
import { loadExamWrongAnswerIds, saveExamWrongAnswerIds } from '@/features/exam/examStorage'
import { allWords } from '@/features/vocab/model/selectors'

const firstWord = allWords[0]
const secondWord = allWords[1]
const thirdWord = allWords[2]

describe('examStore wrong answer persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    useExamStore.setState({
      status: 'idle',
      session: null,
      lastResult: null,
      wrongAnswerIds: [],
    })
  })

  it('overwrites the last exam wrong-answer set instead of merging it', () => {
    const store = useExamStore.getState()

    store.startExam({
      setId: 'set-a',
      setName: '첫 시험',
      words: [firstWord],
      gradingMode: 'manual',
    })
    expect(useExamStore.getState().revealManualAnswer()).toBe('revealed')
    expect(useExamStore.getState().markManualGrade(false)).toBe('completed')
    expect(useExamStore.getState().wrongAnswerIds).toEqual([firstWord.id])

    useExamStore.getState().startExam({
      setId: 'set-b',
      setName: '둘째 시험',
      words: [secondWord],
      gradingMode: 'manual',
    })
    expect(useExamStore.getState().revealManualAnswer()).toBe('revealed')
    expect(useExamStore.getState().markManualGrade(false)).toBe('completed')

    expect(useExamStore.getState().wrongAnswerIds).toEqual([secondWord.id])
    expect(loadExamWrongAnswerIds()).toEqual([secondWord.id])
  })

  it('restores the previous manual question and stops after 20 uses', () => {
    const store = useExamStore.getState()

    store.startExam({
      setId: 'set-a',
      setName: '첫 시험',
      words: [firstWord, secondWord, thirdWord],
      gradingMode: 'manual',
    })

    expect(useExamStore.getState().revealManualAnswer()).toBe('revealed')
    expect(useExamStore.getState().markManualGrade(false)).toBe('advanced')

    let session = useExamStore.getState().session
    expect(session?.currentIndex).toBe(1)
    expect(session?.manualUndoHistory).toHaveLength(1)

    useExamStore.getState().goToPreviousManualQuestion()

    session = useExamStore.getState().session
    expect(session?.currentIndex).toBe(0)
    expect(session?.isAnswerRevealed).toBe(true)
    expect(session?.manualGrades[0]).toBeNull()
    expect(session?.manualUndoHistory).toHaveLength(0)
    expect(session?.manualUndoUsedCount).toBe(1)

    useExamStore.setState((state) => ({
      session: state.session
        ? {
            ...state.session,
            currentIndex: 1,
            isAnswerRevealed: false,
            manualUndoHistory: [{
              currentIndex: 0,
              manualGrades: [null, null, null],
              isAnswerRevealed: true,
            }],
            manualUndoUsedCount: EXAM_MANUAL_UNDO_LIMIT,
          }
        : null,
    }))

    useExamStore.getState().goToPreviousManualQuestion()

    session = useExamStore.getState().session
    expect(session?.currentIndex).toBe(1)
    expect(session?.manualUndoHistory).toHaveLength(1)
    expect(session?.manualUndoUsedCount).toBe(EXAM_MANUAL_UNDO_LIMIT)
  })

  it('drops comparison wrong answers when hydrating stored data', () => {
    saveExamWrongAnswerIds(['ComparingWords_1', firstWord.id])

    useExamStore.getState().hydrate()

    expect(useExamStore.getState().wrongAnswerIds).toEqual([firstWord.id])
    expect(loadExamWrongAnswerIds()).toEqual([firstWord.id])
  })
})
