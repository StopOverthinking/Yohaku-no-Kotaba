import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { emptyContextState } from '@/features/learn/contextEngine'
import { useContextStore } from '@/features/learn/contextStore'
import { ResultScreen } from './ResultScreen'
import { TodayScreen } from './TodayScreen'

const assessedWords = (count: number) => Array.from({ length: count }, (_, index) => `word-${index}`)
const setLevel = (value: number, assessed: number, estimate = value) =>
  useContextStore.setState({ data: { ...emptyContextState(), level: { value, assessedWordIds: assessedWords(assessed) },
    jlptEstimate: { policyVersion: 1, value: assessed >= 20 ? estimate : null } } })

afterEach(() => {
  cleanup()
  useContextStore.setState({ data: emptyContextState(), lastResult: null })
})

describe('JLPT grade next to the learning score', () => {
  it('replaces the calibration cell with the grade cell, keeping the change inside the score cell', () => {
    setLevel(21.25, 19)
    useContextStore.setState({ data: { ...useContextStore.getState().data, lastScoreChange: { before: 20, after: 21.25, completedAt: '2026-10-26' } } })
    const { unmount } = render(<MemoryRouter><TodayScreen /></MemoryRouter>)
    expect(screen.queryByTitle('JLPT 어휘 환산')).not.toBeInTheDocument()
    expect(screen.getByText('수준 측정')).toBeInTheDocument()
    unmount()

    setLevel(21.25, 20, 30)
    useContextStore.setState({ data: { ...useContextStore.getState().data, lastScoreChange: { before: 20, after: 21.25, completedAt: '2026-10-26' } } })
    render(<MemoryRouter><TodayScreen /></MemoryRouter>)
    const grade = screen.getByTitle('JLPT 어휘 환산')
    expect(grade).toHaveTextContent(/^N3\.5$/)
    expect(screen.queryByText('수준 측정')).not.toBeInTheDocument()
    const scoreCell = screen.getByText('점수').closest('.stat')!
    expect(scoreCell).toHaveTextContent('21.3+1.3')
    expect(scoreCell).not.toContainElement(grade)
  })

  it('shows the result grade change, or the single grade when it did not move', () => {
    setLevel(26.5, 20)
    useContextStore.setState({ lastResult: { setId: 'jlpt-level-n4', setName: 'N4', totalTargetCount: 5, rounds: 1,
      revisitedCount: 0, favoriteCount: 0, completedAt: '2026-10-26', score: { before: 25, after: 26.5, completedAt: '2026-10-26',
        jlpt: { policyVersion: 1, before: 26.4, after: 26.5 } } } })
    const { unmount } = render(<MemoryRouter><ResultScreen /></MemoryRouter>)
    expect(screen.getByTitle('JLPT 어휘 환산')).toHaveTextContent('N4.1→N4.0')
    unmount()

    useContextStore.setState({ lastResult: { ...useContextStore.getState().lastResult!, score: { before: 26.5, after: 27.6, completedAt: '2026-10-26',
      jlpt: { policyVersion: 1, before: 26.5, after: 26.6 } } } })
    render(<MemoryRouter><ResultScreen /></MemoryRouter>)
    expect(screen.getByTitle('JLPT 어휘 환산')).toHaveTextContent(/^N4\.0$/)
  })

  it('keeps the result grade hidden while calibration is unfinished', () => {
    setLevel(18, 12)
    useContextStore.setState({ lastResult: { setId: 'jlpt-level-n5', setName: 'N5', totalTargetCount: 5, rounds: 1,
      revisitedCount: 0, favoriteCount: 0, completedAt: '2026-10-26', score: { before: 16, after: 18, completedAt: '2026-10-26' } } })
    render(<MemoryRouter><ResultScreen /></MemoryRouter>)
    expect(screen.queryByTitle('JLPT 어휘 환산')).not.toBeInTheDocument()
  })

  it.each([undefined, { policyVersion: 1 as const, before: null, after: 30 }])('shows one grade without inventing a pre-calibration or legacy result', jlpt => {
    setLevel(42, 20, 30)
    useContextStore.setState({ lastResult: { setId: 'all', setName: 'test', totalTargetCount: 1, rounds: 1,
      revisitedCount: 0, favoriteCount: 0, completedAt: '2026-11-06',
      score: { before: 10, after: 42, completedAt: '2026-11-06', ...(jlpt ? { jlpt } : {}) } } })
    render(<MemoryRouter><ResultScreen /></MemoryRouter>)
    expect(screen.getByTitle('JLPT 어휘 환산')).toHaveTextContent(/^N3\.5$/)
  })

  it('keeps an initialized grade visible after calibration IDs are deduplicated', () => {
    setLevel(42, 20, 30)
    useContextStore.setState({ data: { ...useContextStore.getState().data,
      level: { value: 42, assessedWordIds: assessedWords(19) } } })
    render(<MemoryRouter><TodayScreen /></MemoryRouter>)
    expect(screen.getByTitle('JLPT 어휘 환산')).toHaveTextContent('N3.5')
    expect(screen.queryByText('수준 측정')).not.toBeInTheDocument()
  })
})
