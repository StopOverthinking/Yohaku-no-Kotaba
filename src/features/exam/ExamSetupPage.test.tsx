import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ExamSetupPage } from '@/features/exam/ExamSetupPage'
import { useExamStore } from '@/features/exam/examStore'

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
})
