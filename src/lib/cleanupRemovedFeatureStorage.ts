import { preferencesStorageKey } from '@/features/preferences/preferencesStore'

const obsoleteLocalStorageKeys = [
  'jsp-react:smart-review-profiles',
  'jsp-react:smart-review-session',
  'jsp-react:smart-review-result',
  'jsp-react:smart-review-storage',
  'jsp-react:debug-date',
] as const

const obsoleteIndexedDbNames = ['japanese-study'] as const

function removeObsoletePreferenceFields(storage: Storage) {
  const raw = storage.getItem(preferencesStorageKey)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown>; version?: unknown }
    if (!parsed.state || !('smartReviewWordCount' in parsed.state)) {
      return
    }

    delete parsed.state.smartReviewWordCount
    storage.setItem(preferencesStorageKey, JSON.stringify(parsed))
  } catch {
    // Keep unreadable preference blobs untouched; normal app parsing will fall back as before.
  }
}

export function cleanupRemovedFeatureStorage() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    obsoleteLocalStorageKeys.forEach((key) => window.localStorage.removeItem(key))
    removeObsoletePreferenceFields(window.localStorage)
  } catch {
    // Storage cleanup is best-effort and must never block app startup.
  }

  if (!window.indexedDB) {
    return
  }

  obsoleteIndexedDbNames.forEach((name) => {
    try {
      window.indexedDB.deleteDatabase(name)
    } catch {
      // Some browsers can reject deletion while an old tab still holds the DB open.
    }
  })
}
