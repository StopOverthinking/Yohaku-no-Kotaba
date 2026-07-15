import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useExamStore } from '@/features/exam/examStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { ListPage } from '@/features/list/ListPage'
import styles from '@/features/list/list.module.css'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { allSets, allWords } from '@/features/vocab/model/selectors'
import { listScrollPositionsStorageKey } from '@/features/list/listScrollPositionStorage'

const sampleWords = allWords.slice(0, 2)
const defaultLearnDefaults = {
  frontMode: 'japanese' as const,
  favoritesOnly: false,
  wordCount: 10,
  rangeEnabled: false,
  rangeStart: 1,
  rangeEnd: 10,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ListPage />
    </MemoryRouter>,
  )
}

function renderPageWithRoutes() {
  return render(
    <MemoryRouter initialEntries={['/list']}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/list" element={<ListPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value,
  })
}

function mockScrollTo() {
  const scrollTo = vi.fn((optionsOrX?: ScrollToOptions | number, y?: number) => {
    const top = typeof optionsOrX === 'number' ? y : optionsOrX?.top
    setScrollY(top ?? 0)
  })

  vi.stubGlobal('scrollTo', scrollTo)
  return scrollTo
}

describe('ListPage', () => {
  beforeEach(() => {
    localStorage.clear()
    setScrollY(0)
    mockScrollTo()

    useExamStore.setState({
      status: 'idle',
      session: null,
      lastResult: null,
      wrongAnswerIds: sampleWords.map((word) => word.id),
    })

    useFavoritesStore.setState({
      favoriteIds: [],
    })

    usePreferencesStore.setState({
      themeMode: 'dark',
      hideJapaneseInList: true,
      hideMeaningInList: true,
      listFontScale: 3,
      learnCardFontScale: 2,
      lastSelectedSetId: 'wrong_answers',
      learnDefaults: defaultLearnDefaults,
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    setScrollY(0)

    useExamStore.setState({
      status: 'idle',
      session: null,
      lastResult: null,
      wrongAnswerIds: [],
    })

    useFavoritesStore.setState({
      favoriteIds: [],
    })

    usePreferencesStore.setState({
      themeMode: 'dark',
      hideJapaneseInList: false,
      hideMeaningInList: false,
      listFontScale: 3,
      learnCardFontScale: 2,
      lastSelectedSetId: 'all',
      learnDefaults: defaultLearnDefaults,
    })
  })

  it('reveals hidden japanese text and meaning when the card surface is tapped', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()

    const cardSurface = container.querySelector('[data-revealable="true"]')

    expect(cardSurface).not.toBeNull()
    expect(cardSurface).not.toHaveAttribute('data-reveal-japanese')
    expect(cardSurface).not.toHaveAttribute('data-reveal-meaning')

    await user.click(cardSurface as HTMLElement)

    expect(cardSurface).toHaveAttribute('data-reveal-japanese', 'true')
    expect(cardSurface).toHaveAttribute('data-reveal-meaning', 'true')
  })

  it('reveals hidden card content on touch pointer up before the click fallback', () => {
    const { container } = renderPage()
    const cardSurface = container.querySelector<HTMLElement>('[data-revealable="true"]')

    expect(cardSurface).not.toBeNull()

    fireEvent.pointerDown(cardSurface as HTMLElement, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 24,
      clientY: 24,
    })
    fireEvent.pointerUp(cardSurface as HTMLElement, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 26,
      clientY: 25,
    })

    expect(cardSurface).toHaveAttribute('data-reveal-japanese', 'true')
    expect(cardSurface).toHaveAttribute('data-reveal-meaning', 'true')
  })

  it('keeps revealed cards open after toggling favorites', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()

    const cardSurfaces = container.querySelectorAll<HTMLElement>('[data-card-surface="true"]')
    const firstCardSurface = cardSurfaces[0]
    const firstFavoriteButton = container.querySelectorAll<HTMLButtonElement>(`.${styles.cardFavoriteButton}`)[0]

    await user.click(firstCardSurface)

    expect(firstCardSurface).toHaveAttribute('data-reveal-japanese', 'true')
    expect(firstCardSurface).toHaveAttribute('data-reveal-meaning', 'true')

    await user.click(firstFavoriteButton)

    expect(firstCardSurface).toHaveAttribute('data-reveal-japanese', 'true')
    expect(firstCardSurface).toHaveAttribute('data-reveal-meaning', 'true')
  })

  it('toggles favorites on touch pointer down without double toggling on click fallback', () => {
    const { container } = renderPage()
    const firstFavoriteButton = container.querySelectorAll<HTMLButtonElement>(`.${styles.cardFavoriteButton}`)[0]

    expect(firstFavoriteButton).not.toBeUndefined()

    fireEvent.pointerDown(firstFavoriteButton, {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
    })

    expect(useFavoritesStore.getState().favoriteIds).toEqual([sampleWords[0].id])
    expect(firstFavoriteButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(firstFavoriteButton)

    expect(useFavoritesStore.getState().favoriteIds).toEqual([sampleWords[0].id])
  })

  it('updates hide state without replacing card surfaces', async () => {
    usePreferencesStore.setState({
      themeMode: 'dark',
      hideJapaneseInList: false,
      hideMeaningInList: false,
      listFontScale: 3,
      learnCardFontScale: 2,
      lastSelectedSetId: 'wrong_answers',
      learnDefaults: defaultLearnDefaults,
    })

    const { container } = renderPage()
    const root = container.querySelector<HTMLElement>(`.${styles.root}`)
    const firstCardSurface = container.querySelector<HTMLElement>('[data-card-surface="true"]')

    expect(root).not.toBeNull()
    expect(firstCardSurface).not.toBeNull()
    expect(root).toHaveAttribute('data-hide-japanese', 'false')
    expect(root).toHaveAttribute('data-hide-meaning', 'false')
    expect(firstCardSurface).not.toHaveAttribute('data-revealable')

    fireEvent.click(screen.getByRole('button', { name: '일본어 가리기' }))

    expect(root).toHaveAttribute('data-hide-japanese', 'true')
    expect(container.querySelector('[data-card-surface="true"]')).toBe(firstCardSurface)
    await waitFor(() => {
      expect(firstCardSurface).toHaveAttribute('data-revealable', 'true')
      expect(firstCardSurface).toHaveAttribute('role', 'button')
      expect(firstCardSurface).toHaveAttribute('tabindex', '0')
      expect(usePreferencesStore.getState().hideJapaneseInList).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: '뜻 가리기' }))

    expect(root).toHaveAttribute('data-hide-meaning', 'true')
    expect(container.querySelector('[data-card-surface="true"]')).toBe(firstCardSurface)
    await waitFor(() => {
      expect(usePreferencesStore.getState().hideMeaningInList).toBe(true)
    })
  })

  it('applies list hide state during touch pointer down before the stored preference commit', async () => {
    usePreferencesStore.setState({
      themeMode: 'dark',
      hideJapaneseInList: false,
      hideMeaningInList: false,
      listFontScale: 3,
      learnCardFontScale: 2,
      lastSelectedSetId: 'wrong_answers',
      learnDefaults: defaultLearnDefaults,
    })

    const { container } = renderPage()
    const root = container.querySelector<HTMLElement>(`.${styles.root}`)
    const firstCardSurface = container.querySelector<HTMLElement>('[data-card-surface="true"]')
    const japaneseHideButton = screen.getByRole('button', { name: '일본어 가리기' })

    expect(root).not.toBeNull()
    expect(firstCardSurface).not.toBeNull()
    expect(root).toHaveAttribute('data-hide-japanese', 'false')
    expect(usePreferencesStore.getState().hideJapaneseInList).toBe(false)

    fireEvent.pointerDown(japaneseHideButton, {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 12,
      clientY: 12,
    })

    expect(root).toHaveAttribute('data-hide-japanese', 'true')
    expect(japaneseHideButton).toHaveAttribute('data-active', 'true')
    expect(usePreferencesStore.getState().hideJapaneseInList).toBe(false)

    await waitFor(() => {
      expect(firstCardSurface).toHaveAttribute('data-revealable', 'true')
      expect(usePreferencesStore.getState().hideJapaneseInList).toBe(true)
    })
  })

  it('replaces the legacy all-set selection with the first vocabulary set', async () => {
    const firstSet = allSets[0]

    usePreferencesStore.setState({
      themeMode: 'dark',
      hideJapaneseInList: false,
      hideMeaningInList: false,
      listFontScale: 3,
      learnCardFontScale: 2,
      lastSelectedSetId: 'all',
      learnDefaults: defaultLearnDefaults,
    })

    renderPage()

    expect(screen.getByText(firstSet.name)).toBeInTheDocument()
    await waitFor(() => {
      expect(usePreferencesStore.getState().lastSelectedSetId).toBe(firstSet.id)
    })
  })

  it('restores the saved scroll position for the selected vocabulary set', async () => {
    localStorage.setItem(
      listScrollPositionsStorageKey,
      JSON.stringify({ wrong_answers: 420, another_set: 120 }),
    )

    renderPage()

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 420, left: 0, behavior: 'auto' })
      expect(window.scrollY).toBe(420)
    })
  })

  it('saves the current scroll position when leaving the vocabulary set', async () => {
    const { unmount } = renderPage()

    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled())
    setScrollY(735)
    fireEvent.scroll(window)
    fireEvent.popState(window)
    setScrollY(0)
    fireEvent.scroll(window)
    unmount()

    expect(JSON.parse(localStorage.getItem(listScrollPositionsStorageKey) ?? '{}')).toMatchObject({
      wrong_answers: 735,
    })
  })

  it('keeps the toolbar visible immediately after changing font size', async () => {
    const { container } = renderPage()
    const toolbarDock = container.querySelector(`.${styles.toolbarDock}`)

    expect(toolbarDock).not.toBeNull()

    setScrollY(100)
    fireEvent.click(screen.getByRole('button', { name: '글자 크게' }))

    expect(toolbarDock).toHaveClass(styles.toolbarVisible)

    setScrollY(148)
    fireEvent.scroll(window)

    expect(toolbarDock).toHaveClass(styles.toolbarVisible)
    expect(toolbarDock).not.toHaveClass(styles.toolbarHidden)
  })

  it('applies list font scale during touch pointer down before the stored preference commit', async () => {
    const { container } = renderPage()
    const root = container.querySelector<HTMLElement>(`.${styles.root}`)
    const firstCardSurface = container.querySelector<HTMLElement>('[data-card-surface="true"]')
    const fontScaleUpButton = screen.getByRole('button', { name: '글자 크게' })

    expect(root).not.toBeNull()
    expect(firstCardSurface).not.toBeNull()
    expect(root?.style.getPropertyValue('--list-jp-size')).toBe('1.32rem')
    expect(usePreferencesStore.getState().listFontScale).toBe(3)

    fireEvent.pointerDown(fontScaleUpButton, {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 12,
      clientY: 12,
    })

    expect(root).toHaveAttribute('data-list-font-scale', '4')
    expect(root?.style.getPropertyValue('--list-jp-size')).toBe('1.44rem')
    expect(container.querySelector('[data-card-surface="true"]')).toBe(firstCardSurface)
    expect(usePreferencesStore.getState().listFontScale).toBe(3)

    fireEvent.click(fontScaleUpButton)

    expect(root).toHaveAttribute('data-list-font-scale', '4')
    expect(root?.style.getPropertyValue('--list-jp-size')).toBe('1.44rem')

    await waitFor(() => {
      expect(usePreferencesStore.getState().listFontScale).toBe(4)
    })
  })

  it('navigates home from the toolbar back button', async () => {
    const user = userEvent.setup()
    const { container } = renderPageWithRoutes()
    const toolbarBackButton = container.querySelector<HTMLButtonElement>(`.${styles.toolbarLead} button`)

    expect(toolbarBackButton).not.toBeNull()

    await user.click(toolbarBackButton as HTMLButtonElement)

    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('renders a single shared description block for comparison cards', () => {
    usePreferencesStore.setState({
      themeMode: 'dark',
      hideJapaneseInList: false,
      hideMeaningInList: false,
      listFontScale: 3,
      learnCardFontScale: 2,
      lastSelectedSetId: 'ComparingWords',
      learnDefaults: defaultLearnDefaults,
    })

    const { container } = renderPage()
    const comparisonCards = container.querySelectorAll(`.${styles.compareCardStack}`)
    const descriptionBlocks = container.querySelectorAll(`.${styles.compareDescriptionLine}`)

    expect(comparisonCards.length).toBeGreaterThan(0)
    expect(descriptionBlocks).toHaveLength(comparisonCards.length)
    expect(screen.getAllByText(/仕上がる: 마지막까지 손질되어서 완성되었다/, { exact: false })).toHaveLength(1)
  })
})
