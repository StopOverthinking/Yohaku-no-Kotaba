import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { SmartReviewSetupPage } from '@/features/smart-review/SmartReviewSetupPage'
import { useSmartReviewStore } from '@/features/smart-review/smartReviewStore'

const initialState = useSmartReviewStore.getState()
const initialPreferencesState = usePreferencesStore.getState()

describe('SmartReviewSetupPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
    useSmartReviewStore.setState(initialState)
    usePreferencesStore.setState(initialPreferencesState)
  })

  it('starts a smart review session with the chosen daily count', async () => {
    const user = userEvent.setup()
    const startSession = vi.fn().mockResolvedValue(true)

    useSmartReviewStore.setState({
      ...initialState,
      status: 'idle',
      isHydrated: true,
      profiles: {},
      session: null,
      lastResult: null,
      startSession,
    })

    const { container } = render(
      <MemoryRouter>
        <SmartReviewSetupPage />
      </MemoryRouter>,
    )

    expect(container.querySelector('.page-header')).toHaveClass('page-header--inline-action')

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } })
    await user.click(screen.getAllByRole('button', { name: '스마트 복습 시작' })[0]!)

    const payload = startSession.mock.calls[0]?.[0]
    expect(payload?.setId).toBe('all')
    expect(payload?.setName).toBe('기본 · 주제형')
    expect(payload?.wordCount).toBe(7)
    expect(payload?.words.every((word: { setId: string }) => word.setId !== 'ComparingWords')).toBe(true)
  })

  it('uses 20 as the default count and stores the last chosen count', async () => {
    const user = userEvent.setup()

    useSmartReviewStore.setState({
      ...initialState,
      status: 'idle',
      isHydrated: true,
      profiles: {},
      session: null,
      lastResult: null,
    })

    usePreferencesStore.setState({
      ...initialPreferencesState,
      smartReviewWordCount: 20,
    })

    render(
      <MemoryRouter>
        <SmartReviewSetupPage />
      </MemoryRouter>,
    )

    const input = screen.getByRole('spinbutton')
    expect(input).toHaveValue(20)

    await user.click(screen.getByRole('button', { name: '5개 늘리기' }))

    expect(input).toHaveValue(25)
    expect(usePreferencesStore.getState().smartReviewWordCount).toBe(25)
  })
})
