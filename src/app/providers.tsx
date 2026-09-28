import { useEffect, useState } from 'react'
import { useConjugationStore } from '@/features/conjugation/conjugationStore'
import { useExamStore } from '@/features/exam/examStore'
import { useGameStore } from '@/features/game/gameStore'
import { applyThemeMode, usePreferencesStore } from '@/features/preferences/preferencesStore'
import { useLearnSessionStore } from '@/features/session/learnSessionStore'
import { cleanupRemovedFeatureStorage } from '@/lib/cleanupRemovedFeatureStorage'
import { useContextStore } from '@/features/learn/contextStore'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    useConjugationStore.getState().hydrate()
    useExamStore.getState().hydrate()
    useGameStore.getState().hydrate()
    useLearnSessionStore.getState().hydrate()
    useContextStore.getState().hydrate()
    cleanupRemovedFeatureStorage()
    setHydrated(true)
  }, [])

  useEffect(() => {
    applyThemeMode(themeMode)
  }, [themeMode])

  return hydrated ? <>{children}</> : null
}
