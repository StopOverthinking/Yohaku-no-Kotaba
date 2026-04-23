import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { GameResultPage } from '@/features/game/GameResultPage'
import { useGameStore } from '@/features/game/gameStore'
import type { SpeedQuizSetupPayload } from '@/features/game/gameTypes'
import { allWords } from '@/features/vocab/model/selectors'

const initialGameState = useGameStore.getState()
const initialFavoritesState = useFavoritesStore.getState()

const speedPayload: SpeedQuizSetupPayload = {
  gameKind: 'speed_quiz',
  setId: 'all',
  setName: '전체 세트',
  mode: 'single',
  quizType: 'objective',
  playerName: '플레이어',
  sourceWords: allWords.slice(0, 5),
}

function renderResultPage(initialEntry = '/game/result') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/game" element={<div>game setup</div>} />
        <Route path="/game/session" element={<div>game session</div>} />
        <Route path="/game/result" element={<GameResultPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('GameResultPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useFavoritesStore.setState(initialFavoritesState)
    useGameStore.setState({
      ...initialGameState,
      session: null,
      lastSetup: speedPayload,
      lastResult: {
        gameKind: 'speed_quiz',
        setId: 'all',
        setName: '전체 세트',
        mode: 'single',
        quizType: 'objective',
        playerName: '플레이어',
        playerScore: 120,
        playerCorrectCount: 4,
        totalQuestions: 5,
        averageTime: 2.5,
        wrongWordIds: [allWords[0]!.id],
        completedAt: '2026-04-23T00:00:00.000Z',
        singleRecords: [
          { score: 120, time: 2.5, date: '2026. 4. 23.' },
        ],
        bot: null,
      },
    })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    useGameStore.setState(initialGameState)
    useFavoritesStore.setState(initialFavoritesState)
  })

  it('moves to the setup page and clears the result when the setup button is clicked', async () => {
    const user = userEvent.setup()

    renderResultPage()

    await user.click(screen.getByRole('button', { name: '게임 설정으로 이동' }))

    expect(screen.getByText('game setup')).toBeInTheDocument()
    expect(useGameStore.getState().lastResult).toBeNull()
  })

  it('restarts the same game and moves to the session page when replay is clicked', async () => {
    const user = userEvent.setup()

    renderResultPage()

    await user.click(screen.getByRole('button', { name: '같은 조건으로 다시 하기' }))

    expect(screen.getByText('game session')).toBeInTheDocument()
    expect(useGameStore.getState().session?.gameKind).toBe('speed_quiz')
    expect(useGameStore.getState().lastResult).toBeNull()
  })
})
