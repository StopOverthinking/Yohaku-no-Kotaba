import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ExamResultPage } from '@/features/exam/ExamResultPage'
import { useExamStore } from '@/features/exam/examStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { allWords } from '@/features/vocab/model/selectors'

const sampleWord = allWords[0]

describe('ExamResultPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useExamStore.setState({
      status: 'complete',
      session: null,
      lastResult: {
        setId: 'wrong_answers',
        setName: '시험 오답 세트',
        gradingMode: 'manual',
        questionIds: [sampleWord.id],
        correctCount: 0,
        totalQuestions: 1,
        wrongItems: [{ itemId: sampleWord.id }],
        completedAt: new Date().toISOString(),
      },
      wrongAnswerIds: [sampleWord.id],
    })
    useFavoritesStore.setState({ favoriteIds: [] })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    useFavoritesStore.setState({ favoriteIds: [] })
    useExamStore.setState({
      status: 'idle',
      session: null,
      lastResult: null,
      wrongAnswerIds: [],
    })
  })

  it('toggles favorites on the original word id from wrong-answer results', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <ExamResultPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '즐겨찾기 추가' }))

    expect(useFavoritesStore.getState().favoriteIds).toEqual([sampleWord.id])
  })

  it('keeps only home and delete actions on the result page', () => {
    render(
      <MemoryRouter>
        <ExamResultPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: '홈으로 가기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '시험 기록 삭제' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '시험 설정으로 이동' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다른 시험 보기' })).not.toBeInTheDocument()
  })

  it('clears only the recent result from the result page delete action', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <ExamResultPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '시험 기록 삭제' }))

    expect(useExamStore.getState().lastResult).toBeNull()
    expect(useExamStore.getState().wrongAnswerIds).toEqual([sampleWord.id])
  })

  it('does not show a perfect result when stored wrong items no longer resolve', () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      lastResult: {
        setId: 'set-a',
        setName: '오래된 시험',
        gradingMode: 'manual',
        questionIds: ['missing-word'],
        correctCount: 0,
        totalQuestions: 1,
        wrongItems: [{ itemId: 'missing-word' }],
        completedAt: new Date().toISOString(),
      },
      wrongAnswerIds: ['missing-word'],
    })

    render(
      <MemoryRouter>
        <ExamResultPage />
      </MemoryRouter>,
    )

    expect(screen.queryByText('완벽합니다. 모든 문제를 맞혔습니다.')).not.toBeInTheDocument()
    expect(screen.getByText('현재 단어장과 연결되지 않은 오답 1개')).toBeInTheDocument()
  })
})
