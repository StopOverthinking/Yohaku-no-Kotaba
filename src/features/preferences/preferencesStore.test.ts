import { afterEach, describe, expect, it } from 'vitest'
import {
  applyThemeMode,
  mergePreferencesState,
  preferencesStorageKey,
  readStoredThemeMode,
  usePreferencesStore,
} from '@/features/preferences/preferencesStore'

describe('preferences theme helpers', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  it('defaults to dark mode when no stored preference exists', () => {
    expect(readStoredThemeMode()).toBe('dark')
  })

  it('reads a stored light theme from persisted preferences', () => {
    localStorage.setItem(
      preferencesStorageKey,
      JSON.stringify({
        state: {
          themeMode: 'light',
        },
      }),
    )

    expect(readStoredThemeMode()).toBe('light')
  })

  it('applies theme attributes to the document root', () => {
    applyThemeMode('light')

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('fills new required-range defaults when loading older learn preferences', () => {
    const currentState = usePreferencesStore.getState()
    const merged = mergePreferencesState(
      {
        learnDefaults: {
          frontMode: 'meaning',
          favoritesOnly: true,
          wordCount: 25,
          rangeEnabled: true,
          rangeStart: 5,
          rangeEnd: 30,
        },
      },
      currentState,
    )

    expect(merged.learnDefaults).toMatchObject({
      frontMode: 'meaning',
      wordCount: 25,
      requiredRangesEnabled: false,
      requiredRanges: [],
    })
  })
})
