import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { GameSetupPage } from '@/features/game/GameSetupPage'
import { useGameStore } from '@/features/game/gameStore'

const initialState = useGameStore.getState()

describe('GameSetupPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useGameStore.setState({
      session: null,
      lastResult: null,
      lastSetup: null,
    })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    useGameStore.setState(initialState)
  })

  it('shows speed quiz as the default setup', () => {
    render(
      <MemoryRouter>
        <GameSetupPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '게임 설정' })).toBeInTheDocument()
    expect(screen.getByText('스피드 퀴즈 · 싱글플레이 · 객관식')).toBeInTheDocument()
  })

  it('switches to tap match rush setup', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <GameSetupPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '탭 매치 러시 짝을 맞추고 시간을 줄입니다. 기록형' }))

    expect(screen.getByText('탭 매치 러시 · 8쌍')).toBeInTheDocument()
    expect(screen.getByText('탭 매치 기록')).toBeInTheDocument()
  })

  it('starts with comparison words removed from the game source pool', async () => {
    const user = userEvent.setup()
    const startGame = vi.fn()

    useGameStore.setState({
      ...initialState,
      session: null,
      lastResult: null,
      lastSetup: null,
      startGame,
    })

    render(
      <MemoryRouter>
        <GameSetupPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '게임 시작' }))

    const payload = startGame.mock.calls[0]?.[0]
    expect(payload?.setName).toBe('기본 · 주제형')
    expect(payload?.sourceWords.every((word: { setId: string }) => word.setId !== 'ComparingWords')).toBe(true)
  })
})
