import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FrontMode } from '@/features/vocab/model/types'

export type ThemeMode = 'dark' | 'light'

export type RequiredLearnRange = {
  start: number
  end: number
}

export type LearnDefaults = {
  frontMode: FrontMode
  favoritesOnly: boolean
  wordCount: number
  rangeEnabled: boolean
  rangeStart: number
  rangeEnd: number
  requiredRangesEnabled: boolean
  requiredRanges: RequiredLearnRange[]
}

type PersistedPreferencesState = {
  state?: {
    themeMode?: unknown
  }
}

type PreferencesState = {
  themeMode: ThemeMode
  hideJapaneseInList: boolean
  hideMeaningInList: boolean
  listFontScale: number
  learnCardFontScale: number
  lastSelectedSetId: string | 'all'
  learnDefaults: LearnDefaults
  setThemeMode: (next: ThemeMode) => void
  toggleThemeMode: () => void
  setHideJapaneseInList: (next: boolean) => void
  setHideMeaningInList: (next: boolean) => void
  setListFontScale: (next: number) => void
  setLearnCardFontScale: (next: number) => void
  setLastSelectedSetId: (next: string | 'all') => void
  updateLearnDefaults: (partial: Partial<LearnDefaults>) => void
}

export const preferencesStorageKey = 'jsp-react:preferences'

const defaultLearnDefaults: LearnDefaults = {
  frontMode: 'japanese',
  favoritesOnly: false,
  wordCount: 10,
  rangeEnabled: false,
  rangeStart: 1,
  rangeEnd: 10,
  requiredRangesEnabled: false,
  requiredRanges: [],
}

const defaultThemeMode: ThemeMode = 'dark'

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light'
}

export function readStoredThemeMode(storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage) {
  const raw = storage?.getItem(preferencesStorageKey)

  if (!raw) {
    return defaultThemeMode
  }

  try {
    const parsed = JSON.parse(raw) as PersistedPreferencesState
    return isThemeMode(parsed.state?.themeMode) ? parsed.state.themeMode : defaultThemeMode
  } catch {
    return defaultThemeMode
  }
}

export function applyThemeMode(themeMode: ThemeMode, root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement) {
  if (!root) {
    return
  }

  root.dataset.theme = themeMode
  root.style.colorScheme = themeMode
}

function normalizeRequiredRanges(value: unknown): RequiredLearnRange[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((range) => {
    if (!range || typeof range !== 'object') return []

    const start = Math.floor(Number((range as Partial<RequiredLearnRange>).start))
    const end = Math.floor(Number((range as Partial<RequiredLearnRange>).end))
    if (!Number.isFinite(start) || !Number.isFinite(end)) return []

    return [{ start: Math.max(1, start), end: Math.max(1, end) }]
  })
}

export function mergePreferencesState(persistedState: unknown, currentState: PreferencesState): PreferencesState {
  const persisted = persistedState && typeof persistedState === 'object'
    ? persistedState as Partial<PreferencesState>
    : {}
  const persistedLearnDefaults = persisted.learnDefaults && typeof persisted.learnDefaults === 'object'
    ? persisted.learnDefaults as Partial<LearnDefaults>
    : {}

  return {
    ...currentState,
    ...persisted,
    learnDefaults: {
      ...currentState.learnDefaults,
      ...persistedLearnDefaults,
      requiredRangesEnabled: persistedLearnDefaults.requiredRangesEnabled === true,
      requiredRanges: normalizeRequiredRanges(persistedLearnDefaults.requiredRanges),
    },
  }
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      themeMode: defaultThemeMode,
      hideJapaneseInList: false,
      hideMeaningInList: false,
      listFontScale: 3,
      learnCardFontScale: 2,
      lastSelectedSetId: 'all',
      learnDefaults: defaultLearnDefaults,
      setThemeMode: (next) => set({ themeMode: next }),
      toggleThemeMode: () =>
        set((state) => ({
          themeMode: state.themeMode === 'dark' ? 'light' : 'dark',
        })),
      setHideJapaneseInList: (next) => set({ hideJapaneseInList: next }),
      setHideMeaningInList: (next) => set({ hideMeaningInList: next }),
      setListFontScale: (next) => set({ listFontScale: Math.max(0, Math.min(6, next)) }),
      setLearnCardFontScale: (next) => set({ learnCardFontScale: Math.max(1, Math.min(4, Math.floor(next) || 2)) }),
      setLastSelectedSetId: (next) => set({ lastSelectedSetId: next }),
      updateLearnDefaults: (partial) =>
        set((state) => ({
          learnDefaults: { ...state.learnDefaults, ...partial },
        })),
    }),
    {
      name: preferencesStorageKey,
      merge: mergePreferencesState,
    },
  ),
)
