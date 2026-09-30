import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { VocabularySetMenu } from '@/features/list/VocabularySetMenu'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { allSelectableWordbooks, allSets } from '@/features/vocab/model/selectors'

const defaultLearnDefaults = {
  frontMode: 'japanese' as const,
  favoritesOnly: false,
  wordCount: 10,
  rangeEnabled: false,
  rangeStart: 1,
  rangeEnd: 10,
  requiredRangesEnabled: false,
  requiredRanges: [],
}

const originalUpdatedAtValues = allSelectableWordbooks.map((wordbook) => wordbook.updatedAt)

describe('VocabularySetMenu', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T10:15:00.000Z'))
    localStorage.clear()


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

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    allSelectableWordbooks.forEach((wordbook, index) => {
      wordbook.updatedAt = originalUpdatedAtValues[index]
    })
    localStorage.clear()
  })

  it('omits the all-vocabulary entry from the list menu', () => {
    render(
      <MemoryRouter>
        <VocabularySetMenu />
      </MemoryRouter>,
    )

    expect(screen.queryByText('전체 단어장')).toBeNull()
    expect(screen.getByText('즐겨찾기 단어장')).toBeInTheDocument()
    expect(screen.getByText(allSets[0].name)).toBeInTheDocument()
  })

  it('renders a muted updated date under the wordbook name when it exists', () => {
    allSelectableWordbooks[0].updatedAt = '2026-04-22T10:15:00.000Z'

    render(
      <MemoryRouter>
        <VocabularySetMenu />
      </MemoryRouter>,
    )

    const wordbookItem = screen.getByText(allSelectableWordbooks[0].name).closest('button')

    expect(wordbookItem).not.toBeNull()
    expect(within(wordbookItem!).getByText('2026.04.22')).toBeInTheDocument()
  })

  it('never shows dates for synthetic app-generated wordbooks', () => {
    render(
      <MemoryRouter>
        <VocabularySetMenu />
      </MemoryRouter>,
    )

    const favoritesItem = screen.getByText('즐겨찾기 단어장').closest('button')

    expect(favoritesItem).not.toBeNull()
    expect(within(favoritesItem!).queryByText('2026.04.22')).toBeNull()
  })
})
