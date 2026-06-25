import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { useExamStore } from '@/features/exam/examStore'
import { LearnSetupPage } from '@/features/learn/LearnSetupPage'
import styles from '@/features/learn/learn.module.css'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { useLearnSessionStore } from '@/features/session/learnSessionStore'
import { allWords } from '@/features/vocab/model/selectors'

const initialPreferencesState = usePreferencesStore.getState()
const initialFavoritesState = useFavoritesStore.getState()
const initialLearnSessionState = useLearnSessionStore.getState()
const initialExamState = useExamStore.getState()
const sampleWords = allWords.slice(0, 2)

describe('LearnSetupPage', () => {
  beforeEach(() => {
    localStorage.clear()
    usePreferencesStore.setState({
      ...initialPreferencesState,
      lastSelectedSetId: 'all',
      learnDefaults: {
        frontMode: 'japanese',
        favoritesOnly: false,
        wordCount: 20,
        rangeEnabled: false,
        rangeStart: 1,
        rangeEnd: 10,
      },
    })
    useFavoritesStore.setState({
      ...initialFavoritesState,
      favoriteIds: [],
    })
    useExamStore.setState({
      ...initialExamState,
      status: 'idle',
      session: null,
      lastResult: null,
      wrongAnswerIds: [],
    })
    useLearnSessionStore.setState({
      ...initialLearnSessionState,
      status: 'idle',
      record: null,
      lastResult: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
    usePreferencesStore.setState(initialPreferencesState)
    useFavoritesStore.setState(initialFavoritesState)
    useExamStore.setState(initialExamState)
    useLearnSessionStore.setState(initialLearnSessionState)
  })

  it('keeps the start action inline and balances word-count controls into mirrored columns', () => {
    const { container } = render(
      <MemoryRouter>
        <LearnSetupPage />
      </MemoryRouter>,
    )

    expect(container.querySelector('.page-header')).toHaveClass('page-header--inline-action')

    const columns = container.querySelectorAll(`.${styles.countStepColumn}`)
    expect(columns).toHaveLength(2)
    expect(within(columns[0] as HTMLElement).getByRole('button', { name: '-10' })).toBeInTheDocument()
    expect(within(columns[0] as HTMLElement).getByRole('button', { name: '-5' })).toBeInTheDocument()
    expect(within(columns[1] as HTMLElement).getByRole('button', { name: '+5' })).toBeInTheDocument()
    expect(within(columns[1] as HTMLElement).getByRole('button', { name: '+10' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '학습 항목 수' })).toBeInTheDocument()
  })

  it('allows starting a learn session from exam wrong answers', async () => {
    const user = userEvent.setup()

    useExamStore.setState({
      ...useExamStore.getState(),
      wrongAnswerIds: sampleWords.map((word) => word.id),
    })
    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      lastSelectedSetId: 'wrong_answers',
      learnDefaults: {
        frontMode: 'japanese',
        favoritesOnly: false,
        wordCount: 2,
        rangeEnabled: false,
        rangeStart: 1,
        rangeEnd: 10,
      },
    })

    const { container } = render(
      <MemoryRouter>
        <LearnSetupPage />
      </MemoryRouter>,
    )

    expect(container.querySelector('option[value="wrong_answers"]')).toBeInTheDocument()

    await user.click(container.querySelector('.page-header__right button') as HTMLButtonElement)

    const record = useLearnSessionStore.getState().record
    expect(record?.setId).toBe('wrong_answers')
    expect(record?.setName).toBe('오답 노트')
    expect(record?.activeQueue).toHaveLength(sampleWords.length)
    expect(record?.activeQueue).toEqual(expect.arrayContaining(sampleWords.map((word) => word.id)))
  })

  it('falls back to all when the last selected set was a comparison wordbook', () => {
    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      lastSelectedSetId: 'ComparingWords',
    })

    render(
      <MemoryRouter>
        <LearnSetupPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('combobox', { name: '학습 단어장' })).toHaveValue('all')
    expect(screen.queryByRole('option', { name: '비슷한 단어들' })).not.toBeInTheDocument()
  })

  it('reshuffles favorite candidates every time a learn session starts', async () => {
    const user = userEvent.setup()
    const favoriteIds = allWords.slice(0, 8).map((word) => word.id)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.8)

    useFavoritesStore.setState({
      ...useFavoritesStore.getState(),
      favoriteIds,
    })
    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      lastSelectedSetId: 'favorites',
      learnDefaults: {
        frontMode: 'japanese',
        favoritesOnly: false,
        wordCount: 3,
        rangeEnabled: false,
        rangeStart: 1,
        rangeEnd: 10,
      },
    })

    const { container } = render(
      <MemoryRouter>
        <LearnSetupPage />
      </MemoryRouter>,
    )

    const startButton = container.querySelector('.page-header__right button') as HTMLButtonElement

    await user.click(startButton)
    const firstQueue = useLearnSessionStore.getState().record?.activeQueue

    act(() => {
      useLearnSessionStore.getState().discardSession()
    })

    await user.click(startButton)
    const secondQueue = useLearnSessionStore.getState().record?.activeQueue

    expect(firstQueue).toHaveLength(3)
    expect(secondQueue).toHaveLength(3)
    expect(secondQueue).not.toEqual(firstQueue)
  })

  it('lets range inputs stay empty while editing and restores the previous value on blur', async () => {
    const user = userEvent.setup()

    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      learnDefaults: {
        frontMode: 'japanese',
        favoritesOnly: false,
        wordCount: 20,
        rangeEnabled: true,
        rangeStart: 12,
        rangeEnd: 30,
      },
    })

    render(
      <MemoryRouter>
        <LearnSetupPage />
      </MemoryRouter>,
    )

    const rangeStartInput = screen.getByRole('spinbutton', { name: '시작' }) as HTMLInputElement
    await user.click(rangeStartInput)
    await user.clear(rangeStartInput)

    expect(rangeStartInput.value).toBe('')
    expect(usePreferencesStore.getState().learnDefaults.rangeStart).toBe(12)

    await user.tab()

    expect(rangeStartInput.value).toBe('12')
    expect(usePreferencesStore.getState().learnDefaults.rangeStart).toBe(12)
  })

  it('accepts a new range value after the input is cleared', async () => {
    const user = userEvent.setup()

    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      learnDefaults: {
        frontMode: 'japanese',
        favoritesOnly: false,
        wordCount: 20,
        rangeEnabled: true,
        rangeStart: 12,
        rangeEnd: 30,
      },
    })

    render(
      <MemoryRouter>
        <LearnSetupPage />
      </MemoryRouter>,
    )

    const rangeEndInput = screen.getByRole('spinbutton', { name: '끝' }) as HTMLInputElement
    await user.click(rangeEndInput)
    await user.clear(rangeEndInput)
    await user.type(rangeEndInput, '45')
    await user.tab()

    expect(rangeEndInput.value).toBe('45')
    expect(usePreferencesStore.getState().learnDefaults.rangeEnd).toBe(45)
  })
})
