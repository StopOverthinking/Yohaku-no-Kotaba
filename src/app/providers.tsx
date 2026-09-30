import { useEffect, useState } from 'react'
import { applyThemeMode, usePreferencesStore } from '@/features/preferences/preferencesStore'
import { cleanupRemovedFeatureStorage } from '@/lib/cleanupRemovedFeatureStorage'
import { useContextStore } from '@/features/learn/contextStore'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let mounted = true
    void useContextStore.getState().hydrate().then(() => { if (mounted) setHydrated(true) })
    cleanupRemovedFeatureStorage()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    applyThemeMode(themeMode)
  }, [themeMode])

  return hydrated ? <>{children}</> : null
}
