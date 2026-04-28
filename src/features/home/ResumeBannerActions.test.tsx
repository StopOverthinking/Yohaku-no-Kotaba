import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { createExamSession } from '@/features/exam/examEngine'
import { ExamSetupPage } from '@/features/exam/ExamSetupPage'
import { useExamStore } from '@/features/exam/examStore'
import { HomePage } from '@/features/home/HomePage'
import { LearnSetupPage } from '@/features/learn/LearnSetupPage'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { createSessionRecord } from '@/features/session/sessionEngine'
import { useLearnSessionStore } from '@/features/session/learnSessionStore'
import { allWords } from '@/features/vocab/model/selectors'

const sampleWords = allWords.slice(0, 3)
const originalMatchMedia = window.matchMedia
const defaultLearnDefaults = {
  frontMode: 'japanese' as const,
  favoritesOnly: false,
  wordCount: 10,
  rangeEnabled: false,
  rangeStart: 1,
  rangeEnd: 10,
}

function renderWithRouter(element: ReactNode) {
  return render(<MemoryRouter>{element}</MemoryRouter>)
}

function mockMatchMedia({ compact = false, coarsePointer = false } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      query === '(max-width: 720px)'
        ? compact
        : query === '(hover: none) and (pointer: coarse)'
          ? coarsePointer
          : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('Resume banner discard actions', () => {
  beforeEach(() => {
    localStorage.clear()
    mockMatchMedia()

    usePreferencesStore.setState({
      themeMode: 'dark',
      lastSelectedSetId: 'all',
      learnDefaults: defaultLearnDefaults,
    })

    useLearnSessionStore.setState({
      status: 'active',
      record: createSessionRecord({
        setId: 'all',
        setName: '테스트 학습',
        frontMode: 'japanese',
        words: sampleWords,
      }),
      previousSnapshot: null,
      snapshotHistory: [],
      lastResult: null,
    })

    useExamStore.setState({
      status: 'active',
      session: createExamSession({
        setId: 'set-a',
        setName: '테스트 시험',
        gradingMode: 'auto',
        words: sampleWords,
      }, 42),
      lastResult: null,
      wrongAnswerIds: [],
    })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
    window.matchMedia = originalMatchMedia

    useLearnSessionStore.setState({
      status: 'idle',
      record: null,
      previousSnapshot: null,
      snapshotHistory: [],
      lastResult: null,
    })

    useExamStore.setState({
      status: 'idle',
      session: null,
      lastResult: null,
      wrongAnswerIds: [],
    })
  })

  it('discards a learn session from the learn setup banner after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderWithRouter(<LearnSetupPage />)

    await user.click(screen.getByRole('button', { name: '학습 파기' }))

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(useLearnSessionStore.getState().record).toBeNull()
    expect(useLearnSessionStore.getState().status).toBe('idle')
  })

  it('keeps the learn session when discard confirmation is cancelled', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderWithRouter(<LearnSetupPage />)

    await user.click(screen.getByRole('button', { name: '학습 파기' }))

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(useLearnSessionStore.getState().record).not.toBeNull()
    expect(useLearnSessionStore.getState().status).toBe('active')
  })

  it('discards an exam session from the exam setup banner after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderWithRouter(<ExamSetupPage />)

    await user.click(screen.getByRole('button', { name: '시험 파기' }))

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(useExamStore.getState().session).toBeNull()
    expect(useExamStore.getState().status).toBe('idle')
  })

  it('shows discard buttons on the top menu resume banners and clears both sessions when confirmed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderWithRouter(<HomePage />)

    await user.click(screen.getByRole('button', { name: '학습 파기' }))
    await user.click(screen.getByRole('button', { name: '시험 파기' }))

    expect(window.confirm).toHaveBeenCalledTimes(2)
    expect(useLearnSessionStore.getState().record).toBeNull()
    expect(useExamStore.getState().session).toBeNull()
  })

  it('clears only the recent exam result from the top menu banner', async () => {
    const user = userEvent.setup()
    const wrongAnswerIds = [sampleWords[0].id]

    useExamStore.setState({
      status: 'complete',
      session: null,
      lastResult: {
        setId: 'set-a',
        setName: '완료한 시험',
        gradingMode: 'auto',
        questionIds: sampleWords.map((word) => word.id),
        correctCount: 2,
        totalQuestions: 3,
        wrongItems: [{ itemId: sampleWords[0].id }],
        completedAt: '2026-04-28T00:00:00.000Z',
      },
      wrongAnswerIds,
    })

    renderWithRouter(<HomePage />)

    await user.click(screen.getByRole('button', { name: '시험 기록 삭제' }))

    expect(useExamStore.getState().lastResult).toBeNull()
    expect(useExamStore.getState().wrongAnswerIds).toEqual(wrongAnswerIds)
    expect(screen.queryByText('완료한 시험 시험 결과를 다시 볼 수 있어요.')).not.toBeInTheDocument()
  })

  it('renders the opened submenu immediately after the selected top menu card on compact layout', async () => {
    const user = userEvent.setup()
    mockMatchMedia({ compact: true })

    const { container } = renderWithRouter(<HomePage />)

    await user.click(screen.getByRole('button', { name: '목록' }))

    const vocabularyCard = container.querySelector('[data-menu="vocabulary"]')
    const learnCard = container.querySelector('[data-menu="learn"]')
    const vocabularySubmenu = container.querySelector('[data-submenu-for="vocabulary"]')
    const heroActions = vocabularyCard?.parentElement

    expect(heroActions).not.toBeNull()
    expect(vocabularyCard?.nextElementSibling).toBe(vocabularySubmenu)
    expect(vocabularySubmenu?.nextElementSibling).toBe(learnCard)
  })
})
