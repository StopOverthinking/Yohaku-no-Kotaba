import { create } from 'zustand'
import { contextSenses, contextSenseMap } from './contextContent'
import {
  answerContext,
  emptyContextState,
  localDay,
  startContext,
  undoContext,
  type StartContextOptions,
} from './contextEngine'
import type { ContextState } from './contextTypes'
import type { LearnResult } from '@/features/session/sessionTypes'

import { CONTEXT_STORAGE_KEY, parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
export { CONTEXT_STORAGE_KEY, parseContextState } from './contextPersistence'

type Store = {
  data: ContextState
  lastResult: LearnResult | null
  error: string | null
  loadedRaw: string | null
  hydrate: () => void
  start: (options: StartContextOptions) => boolean
  answer: (known: boolean, expectedCard?: string) => boolean
  reveal: () => void
  toggleHint: () => void
  undo: () => boolean
  discard: () => boolean
  clearResult: () => void
}

export const useContextStore = create<Store>((set, get) => {
  function commit(data: ContextState, extra: Partial<Store> = {}): boolean {
    try {
      // A stale tab must never overwrite a newer review or an imported backup.
      if (localStorage.getItem(CONTEXT_STORAGE_KEY) !== get().loadedRaw)
        throw new Error('다른 화면에서 학습 기록이 바뀌었습니다. 새로고침해 주세요.')
      const next = { ...data, revision: get().data.revision + 1 }
      const raw = serializeContextState(next)
      localStorage.setItem(CONTEXT_STORAGE_KEY, raw)
      set({ data: next, loadedRaw: raw, error: null, ...extra })
      return true
    } catch (error) {
      set({
        error:
          error instanceof Error && error.message.startsWith('다른 화면')
            ? error.message
            : '저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.',
      })
      return false
    }
  }
  return {
    data: emptyContextState(contextSenses),
    lastResult: null,
    error: null,
    loadedRaw: null,
    hydrate: () => {
      try {
        const raw = localStorage.getItem(CONTEXT_STORAGE_KEY)
        const data = raw ? parseContextState(raw) : emptyContextState(contextSenses)
        const cards = data.session
          ? [...data.session.cards, ...data.session.queue, ...data.session.retry]
          : []
        const changed = cards.some(
          (card) =>
            contextSenseMap.get(card.senseId)?.version !== card.senseVersion ||
            !contextSenseMap
              .get(card.senseId)
              ?.examples.some(
                (e) =>
                  e.id === card.exampleId && e.version === card.exampleVersion && e.status === 'reviewed',
              ),
        )
        set({
          data,
          loadedRaw: raw,
          error: changed
            ? '진행 중인 예문이 변경되었습니다. 학습 기록은 보존됩니다. 세션을 닫고 다시 시작해 주세요.'
            : null,
        })
      } catch {
        // Preserve the blob, including on a subsequent start attempt (CAS check).
        set({ error: '저장된 학습을 읽지 못했습니다. 원본 기록은 보존했습니다.' })
      }
    },
    start: (options) => {
      try {
        if (get().data.session) throw new Error('진행 중인 학습을 이어가거나 닫아 주세요.')
        return commit(startContext(get().data, options, contextSenses, localDay()), { lastResult: null })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '학습을 시작하지 못했습니다.' })
        return false
      }
    },
    answer: (known, expectedCard) => {
      const state = get().data
      const session = state.session
      if (!session || (expectedCard && expectedCard !== `${session.id}:${session.decisions}`)) return false
      try {
        const next = answerContext(state, known, contextSenses, localDay())
        if (next.session) return commit(next)
        const result: LearnResult = {
          setId: session.setId,
          setName: session.setName,
          totalTargetCount: session.cards.length,
          rounds: session.round,
          revisitedCount: session.unknownWordIds.length,
          favoriteCount: 0,
          completedAt: new Date().toISOString(),
        }
        return commit({ ...next, history: [] }, { lastResult: result })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '학습을 저장하지 못했습니다.' })
        return false
      }
    },
    reveal: () => {
      const data = get().data
      if (data.session && !data.session.revealed)
        commit({ ...data, session: { ...data.session, revealed: true } })
    },
    toggleHint: () => {
      const data = get().data
      if (data.session)
        commit({ ...data, session: { ...data.session, hintShown: !data.session.hintShown, hintUsed: true } })
    },
    undo: () => commit(undoContext(get().data)),
    discard: () => commit({ ...get().data, session: null, history: [] }),
    clearResult: () => set({ lastResult: null }),
  }
})
