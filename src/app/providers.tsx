import { useEffect } from 'react'
import { useConjugationStore } from '@/features/conjugation/conjugationStore'
import { useExamStore } from '@/features/exam/examStore'
import { useGameStore } from '@/features/game/gameStore'
import { applyThemeMode, usePreferencesStore } from '@/features/preferences/preferencesStore'
import { useLearnSessionStore } from '@/features/session/learnSessionStore'
import { cleanupRemovedFeatureStorage } from '@/lib/cleanupRemovedFeatureStorage'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const themeMode = usePreferencesStore((state) => state.themeMode)

  useEffect(() => {
    useConjugationStore.getState().hydrate()
    useExamStore.getState().hydrate()
    useGameStore.getState().hydrate()
    useLearnSessionStore.getState().hydrate()
    cleanupRemovedFeatureStorage()
  }, [])

  useEffect(() => {
    applyThemeMode(themeMode)
  }, [themeMode])

  return <>{children}</>
}
