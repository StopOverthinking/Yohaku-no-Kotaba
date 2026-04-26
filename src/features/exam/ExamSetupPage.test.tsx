import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ExamSetupPage } from '@/features/exam/ExamSetupPage'
import { useExamStore } from '@/features/exam/examStore'
import { allWords } from '@/features/vocab/model/selectors'

const initialState = useExamStore.getState()

describe('ExamSetupPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useExamStore.setState({
      ...initialState,
      status: 'idle',
      session: null,
      lastResult: null,
      wrongAnswerIds: [],
    })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    useExamStore.setState(initialState)
  })

  it('does not render comparison wordbooks in the exam selection grid', () => {
    render(
      <MemoryRouter>
        <ExamSetupPage />
      </MemoryRouter>,
    )

    expect(screen.queryByText('비슷한 단어들')).not.toBeInTheDocument()
  })

  it('hides wrong-answer shortcuts when only comparison words were persisted', () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      wrongAnswerIds: ['ComparingWords_1'],
    })

    render(
      <MemoryRouter>
        <ExamSetupPage />
      </MemoryRouter>,
    )

    expect(screen.queryByText('시험 오답 세트')).not.toBeInTheDocument()
  })

  it('clears only the recent exam result banner', async () => {
    const user = userEvent.setup()
    const wrongAnswerIds = [allWords[0].id]

    useExamStore.setState({
      ...useExamStore.getState(),
      status: 'complete',
      lastResult: {
        setId: 'set-a',
        setName: '최근 시험',
        gradingMode: 'manual',
        questionIds: [allWords[0].id],
        correctCount: 0,
        totalQuestions: 1,
        wrongItems: [{ itemId: allWords[0].id }],
        completedAt: new Date().toISOString(),
      },
      wrongAnswerIds,
    })

    render(
      <MemoryRouter>
        <ExamSetupPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '시험 기록 삭제' }))

    expect(useExamStore.getState().lastResult).toBeNull()
    expect(useExamStore.getState().wrongAnswerIds).toEqual(wrongAnswerIds)
    expect(screen.queryByText('최근 시험 시험 결과가 남아 있습니다.')).not.toBeInTheDocument()
  })
})
