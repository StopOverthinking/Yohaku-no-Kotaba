import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { createGameSession } from '@/features/game/gameEngine'
import { GameSessionPage } from '@/features/game/GameSessionPage'
import { useGameStore } from '@/features/game/gameStore'
import { createTapMatchRushSession } from '@/features/game/tapMatchRushEngine'
import type { SpeedQuizSetupPayload, TapMatchRushSetupPayload } from '@/features/game/gameTypes'
import { allWords } from '@/features/vocab/model/selectors'

const initialState = useGameStore.getState()

const speedPayload: SpeedQuizSetupPayload = {
  gameKind: 'speed_quiz',
  setId: 'all',
  setName: '전체 세트',
  mode: 'single',
  quizType: 'objective',
  playerName: '플레이어',
  sourceWords: allWords.slice(0, 5),
}

const tapMatchPayload: TapMatchRushSetupPayload = {
  gameKind: 'tap_match_rush',
  setId: 'all',
  setName: '전체 세트',
  playerName: '플레이어',
  pairCount: 6,
  sourceWords: allWords.slice(0, 8),
}

describe('GameSessionPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useGameStore.setState({
      session: createGameSession(speedPayload, [], () => 0.4),
      lastResult: null,
      lastSetup: speedPayload,
    })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    useGameStore.setState(initialState)
  })

  it('shows speed quiz in the session hud and countdown', () => {
    render(
      <MemoryRouter>
        <GameSessionPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '스피드 퀴즈 · 전체 세트' })).toBeInTheDocument()
    expect(screen.getAllByText('스피드 퀴즈').length).toBeGreaterThan(0)
    expect(screen.getByText('스피드 퀴즈 시작')).toBeInTheDocument()
  })

  it('renders tap match rush session when the new mode is active', () => {
    useGameStore.setState({
      session: createTapMatchRushSession(tapMatchPayload, () => 0.4),
      lastResult: null,
      lastSetup: tapMatchPayload,
    })

    render(
      <MemoryRouter>
        <GameSessionPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '탭 매치 러시 · 전체 세트' })).toBeInTheDocument()
    expect(screen.getByText('남은 짝')).toBeInTheDocument()
    expect(screen.getAllByRole('button').length).toBeGreaterThan(2)
  })
})
