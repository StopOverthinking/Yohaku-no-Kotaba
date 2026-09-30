import { useEffect, useState } from 'react'
import { loadContextSense } from './contextContent'
import type { LearnSense } from './contextTypes'
import { ContentLoadError } from './contentLoader'

export function useContextSense(id: string | undefined) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ id: string; attempt: number; sense?: LearnSense; error?: string; reload?: boolean }>()
  useEffect(() => {
    if (!id) return
    let active = true
    loadContextSense(id).then(
      (sense) => { if (active) setResult({ id, attempt, sense }) },
      (error: unknown) => {
        if (active) setResult({ id, attempt, error: error instanceof Error ? error.message : '예문을 불러오지 못했습니다.', reload: error instanceof ContentLoadError })
      },
    )
    return () => { active = false }
  }, [id, attempt])
  const current = result && result.id === id && result.attempt === attempt ? result : undefined
  return { sense: current?.sense, error: current?.error, retry: () => {
    // Browsers retain a rejected dynamic import. Reload resets that module cache;
    // the session is already saved in IndexedDB before selecting this card.
    if (current?.reload) window.location.reload()
    else setAttempt((value) => value + 1)
  } }
}
