import { resetContextStorage } from '@/test/contextStorage'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LearnSetupPage } from '@/features/learn/LearnSetupPage'
import styles from '@/features/learn/learn.module.css'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { useContextStore } from './contextStore'
import { contextSenses } from './contextContent'
import { allWords } from '@/features/vocab/model/selectors'
import { addDays, localDay, profileKey, reviewProfile } from './contextEngine'

vi.mock('./contextContent', async () => {
  const { testSense } = await import('./contextTestFixtures')
  const { allWords } = await import('@/features/vocab/model/selectors')
  const words = allWords.slice(0, 20)
  const senses = words.map((word) => testSense(word.id))
  return { contextSenses: senses, contextAliasGroups: [], contextAliasCatalog: { resolveWordId: (id: string) => id }, contextSenseMap: new Map(senses.map((s) => [s.id, s])), contextContentReady: true, contextCoverage: words.length, contextWords: words }
})

const initialPreferencesState = usePreferencesStore.getState()
const initialFavoritesState = useFavoritesStore.getState()

describe('LearnSetupPage', () => {
  beforeEach(async () => {
    await resetContextStorage()
    useContextStore.setState({ snapshot: null, ready: false, busy: false, lastResult: null, error: null })
    await useContextStore.getState().hydrate()
    usePreferencesStore.setState({
      ...initialPreferencesState,
      lastSelectedSetId: 'all',
      learnDefaults: {

        favoritesOnly: false,
        wordCount: 20,
        rangeEnabled: false,
        rangeStart: 1,
        rangeEnd: 10,
        requiredRangesEnabled: false,
        requiredRanges: [],
      },
    })
    useFavoritesStore.setState({
      ...initialFavoritesState,
      favoriteIds: [],
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
    usePreferencesStore.setState(initialPreferencesState)
    useFavoritesStore.setState(initialFavoritesState)
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

  it('shows due words near the count controls and follows the selected range, required ranges and favorites', async () => {
    const today = localDay()
    const profiles = Object.fromEntries(contextSenses.slice(0, 6).map(sense => [profileKey(sense), reviewProfile(undefined, sense, sense.examples[0], true, false, addDays(today, -3))]))
    profiles[profileKey(contextSenses[5])].due = addDays(today, 1)
    useContextStore.setState({ data: { ...useContextStore.getState().data, profiles } })
    usePreferencesStore.setState({ learnDefaults: { ...usePreferencesStore.getState().learnDefaults, rangeEnabled: true, rangeStart: 2, rangeEnd: 3 } })
    render(<MemoryRouter><LearnSetupPage /></MemoryRouter>)
    const message = screen.getByText('오늘 복습해야 하는 2개의 단어가 있어요')
    expect(message.parentElement).toContainElement(screen.getByRole('spinbutton', { name: '학습 항목 수' }))
    await act(async () => { usePreferencesStore.getState().updateLearnDefaults({ requiredRangesEnabled: true, requiredRanges: [{ start: 1, end: 2 }] }) })
    expect(screen.getByText('오늘 복습해야 하는 3개의 단어가 있어요')).toBeVisible()
    await act(async () => {
      useFavoritesStore.setState({ favoriteIds: [contextSenses[1].wordId] })
      usePreferencesStore.getState().updateLearnDefaults({ favoritesOnly: true, rangeEnabled: false, requiredRangesEnabled: false })
    })
    expect(screen.getByText('오늘 복습해야 하는 1개의 단어가 있어요')).toBeVisible()
    await act(async () => { useFavoritesStore.setState({ favoriteIds: [contextSenses[5].wordId] }) })
    expect(screen.queryByText(/오늘 복습해야 하는/)).not.toBeInTheDocument()
  })

  it.each(['theme-core', 'ComparingWords'])('falls back to all for removed wordbook %s', (setId) => {
    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      lastSelectedSetId: setId,
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

        favoritesOnly: false,
        wordCount: 3,
        rangeEnabled: false,
        rangeStart: 1,
        rangeEnd: 10,
        requiredRangesEnabled: false,
        requiredRanges: [],
      },
    })

    const { container } = render(
      <MemoryRouter>
        <LearnSetupPage />
      </MemoryRouter>,
    )

    const startButton = container.querySelector('.page-header__right button') as HTMLButtonElement

    await user.click(startButton)
    await waitFor(() => expect(useContextStore.getState().busy).toBe(false))
    const firstQueue = useContextStore.getState().data.session?.tieOrder

    await act(async () => {
      await useContextStore.getState().discard()
    })

    await user.click(startButton)
    await waitFor(() => expect(useContextStore.getState().busy).toBe(false))
    const secondQueue = useContextStore.getState().data.session?.tieOrder

    expect(firstQueue).toHaveLength(favoriteIds.length)
    expect(secondQueue).toHaveLength(favoriteIds.length)
    expect(secondQueue).not.toEqual(firstQueue)
  })

  it('lets range inputs stay empty while editing and restores the previous value on blur', async () => {
    const user = userEvent.setup()

    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      learnDefaults: {

        favoritesOnly: false,
        wordCount: 20,
        rangeEnabled: true,
        rangeStart: 12,
        rangeEnd: 30,
        requiredRangesEnabled: false,
        requiredRanges: [],
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

        favoritesOnly: false,
        wordCount: 20,
        rangeEnabled: true,
        rangeStart: 12,
        rangeEnd: 30,
        requiredRangesEnabled: false,
        requiredRanges: [],
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

  it('toggles a required-range list and adds consecutive rows', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <LearnSetupPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '반드시 포함할 범위' }))

    expect(screen.getByRole('spinbutton', { name: '1. 시작' })).toHaveValue(1)
    expect(screen.getByRole('spinbutton', { name: '끝' })).toHaveValue(10)

    await user.click(screen.getByRole('button', { name: '필수 범위 추가' }))

    expect(screen.getByRole('spinbutton', { name: '2. 시작' })).toHaveValue(11)
    expect(screen.getAllByRole('spinbutton', { name: '끝' })[1]).toHaveValue(20)
    expect(usePreferencesStore.getState().learnDefaults.requiredRanges).toEqual([
      { start: 1, end: 10 },
      { start: 11, end: 20 },
    ])
  })

  it('raises the total count to the number of required words', async () => {
    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      learnDefaults: {
        ...usePreferencesStore.getState().learnDefaults,
        wordCount: 2,
        requiredRangesEnabled: true,
        requiredRanges: [
          { start: 1, end: 3 },
          { start: 8, end: 10 },
        ],
      },
    })

    render(
      <MemoryRouter>
        <LearnSetupPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(usePreferencesStore.getState().learnDefaults.wordCount).toBe(6)
    })
    expect(screen.getByRole('spinbutton', { name: '학습 항목 수' })).toHaveAttribute('min', '6')
  })

  it('includes every required range and fills the remaining session count from the selected range', async () => {
    const user = userEvent.setup()
    const requiredWords = [...allWords.slice(0, 2), ...allWords.slice(4, 6)]

    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      learnDefaults: {
        ...usePreferencesStore.getState().learnDefaults,
        wordCount: 6,
        rangeEnabled: true,
        rangeStart: 7,
        rangeEnd: 12,
        requiredRangesEnabled: true,
        requiredRanges: [
          { start: 1, end: 2 },
          { start: 5, end: 6 },
        ],
      },
    })

    const { container } = render(
      <MemoryRouter>
        <LearnSetupPage />
      </MemoryRouter>,
    )

    await user.click(container.querySelector('.page-header__right button') as HTMLButtonElement)

    const record = useContextStore.getState().data.session
    expect(record?.targetCount).toBe(6)
    expect(record?.requiredWordIds).toEqual(expect.arrayContaining(requiredWords.map((word) => word.id)))
    for (let i = 0; i < 5; i++) await act(async () => { await useContextStore.getState().answer(true) })
    const selected = useContextStore.getState().data.session?.cards.map((card) => contextSenses.find((sense) => sense.id === card.senseId)!.wordId)
    expect(selected).toHaveLength(6)
    expect(selected).toEqual(expect.arrayContaining(requiredWords.map((word) => word.id)))
  })
})

vi.mock('./contextBrowserPersistence', async () => {
  const fixture = await import('@/test/contextStorage')
  return { browserContextPersistence: fixture.persistence, getBrowserBackupCoordinator: fixture.getTestCoordinator }
})
