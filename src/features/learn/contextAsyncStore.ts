import { localDay } from './contextReviewPolicy'
import { create } from 'zustand'
import { answerContext, emptyContextState, reconcileStudySession, startContext, undoContext, type StartContextOptions } from './contextEngine'
import { ContextConflictError, type ContextSnapshot } from './contextDatabase'
import type { ContextAliasGroup, ContextResult, ContextState, LearnSenseIndex } from './contextTypes'
import { createAliasCatalog, migrateContextAliases } from './contextAliases'
import { reconcileRetiredExamples, type ExampleRetirement } from './contextExampleRetirements'

export type ContextPersistence = {
  load: (empty: ContextState) => Promise<ContextSnapshot>
  save: (previous: ContextSnapshot, data: ContextState) => Promise<ContextSnapshot>
}
type Change = { data: ContextState; lastResult?: ContextResult | null }
export type AsyncContextStore = {
  data: ContextState
  snapshot: ContextSnapshot | null
  lastResult: ContextResult | null
  error: string | null
  ready: boolean
  busy: boolean
  hydrate: () => Promise<void>
  start: (options: StartContextOptions) => Promise<boolean>
  answer: (known: boolean, expectedCard?: string) => Promise<boolean>
  reveal: () => Promise<boolean>
  toggleHint: () => Promise<boolean>
  undo: () => Promise<boolean>
  discard: () => Promise<boolean>
  removeReviewWord: (wordId: string) => Promise<boolean>
  clearResult: () => void
}

/** All visible learning state advances only after a durable repository commit.
 * Content is injected so loading it can later be split from home/list startup.
 */
export function createAsyncContextStore(
  senses: LearnSenseIndex[],
  getRepository: () => ContextPersistence,
  day: () => string = localDay,
  aliasGroups: ContextAliasGroup[] = [],
  retirements: ExampleRetirement[] = [],
) {
  const aliases = createAliasCatalog(senses, aliasGroups)
  const senseMap = new Map(senses.map((sense) => [sense.id, sense]))
  return create<AsyncContextStore>((set, get) => {
    let hydration: Promise<void> | null = null
    let pendingWrite: Promise<boolean> | null = null

    function mutate(make: (data: ContextState) => Change | null): Promise<boolean> {
      const current = get()
      if (!current.ready || current.busy || !current.snapshot) return Promise.resolve(false)
      // Lock before any await, so two inputs from one event burst cannot both run.
      set({ busy: true })
      pendingWrite = Promise.resolve().then(async () => {
        let saving = false
        try {
          const change = make(current.data)
          if (!change) return false
          const data = { ...reconcileStudySession(change.data, senses, day()), revision: current.data.revision + 1 }
          saving = true
          const saved = await getRepository().save(current.snapshot!, data)
          set({ data: saved.data, snapshot: saved, error: null,
            ...('lastResult' in change ? { lastResult: change.lastResult } : {}) })
          return true
        } catch (error) {
          const conflict = error instanceof ContextConflictError
          set({
            error: conflict || (!saving && error instanceof Error)
              ? (error as Error).message
              : '저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.',
            ...(conflict ? { ready: false } : {}),
          })
          return false
        }
      }).finally(() => { pendingWrite = null; set({ busy: false }) })
      return pendingWrite
    }

    function hydrate(): Promise<void> {
      if (hydration) return hydration
      const priorWrite = pendingWrite
      // Immediately block new input while a reload waits for an outstanding save.
      set({ ready: false })
      hydration = Promise.resolve().then(async () => {
        if (priorWrite) await priorWrite
        set({ busy: true })
        try {
          let snapshot = await getRepository().load(emptyContextState())
          const migrated = migrateContextAliases(reconcileStudySession(reconcileRetiredExamples(snapshot.data, senses, retirements), senses, day()), aliases, day())
          if (migrated !== snapshot.data || snapshot.needsScheduleMigration)
            snapshot = await getRepository().save(snapshot, { ...migrated, revision: snapshot.data.revision + 1 })
          const session = snapshot.data.session
          const cards = session ? [session.current, ...session.cards, ...session.queue, ...session.retry] : []
          const changed = cards.some((card) => {
            const sense = senseMap.get(card.senseId)
            return sense?.version !== card.senseVersion || !sense.examples.some((example) =>
              example.id === card.exampleId && example.version === card.exampleVersion && example.status === 'reviewed')
          })
          set({ data: snapshot.data, snapshot, ready: true, lastResult: null,
            error: changed
              ? '진행 중인 예문이 변경되었습니다. 학습 기록은 보존됩니다. 세션을 닫고 다시 시작해 주세요.'
              : null })
        } catch (error) {
          set({ ready: false, error: error instanceof Error ? error.message : '저장된 학습을 읽지 못했습니다. 원본 기록은 보존했습니다.' })
        }
      }).finally(() => { hydration = null; set({ busy: false }) })
      return hydration
    }

    return {
      data: emptyContextState(), snapshot: null, lastResult: null,
      error: null, ready: false, busy: false, hydrate,
      start: (options) => mutate((state) => {
        if (state.session) throw new Error('진행 중인 학습을 이어가거나 닫아 주세요.')
        const migrated = migrateContextAliases({ ...state, history: [] }, aliases, day())
        const canonicalOptions = { ...options,
          candidateWordIds: options.candidateWordIds.map(aliases.resolveWordId),
          requiredWordIds: options.requiredWordIds.map(aliases.resolveWordId),
        }
        return { data: startContext(migrated, canonicalOptions, senses, day()), lastResult: null }
      }),
      answer: (known, expectedCard) => mutate((state) => {
        const reconciled = reconcileStudySession(state, senses, day())
        if (reconciled !== state) return { data: reconciled }
        const session = state.session
        if (!session || (expectedCard && expectedCard !== `${session.id}:${session.decisions}`)) return null
        const next = answerContext(state, known, senses, day())
        if (next.session) return { data: next }
        const completedAt = new Date().toISOString()
        const score = { before: state.history[0]?.level.value ?? state.level.value, after: next.level.value, completedAt }
        return { data: migrateContextAliases({ ...next, history: [], lastScoreChange: score }, aliases, day()), lastResult: {
          score, setId: session.setId, setName: session.setName, totalTargetCount: session.cards.length,
          rounds: session.round, revisitedCount: session.unknownWordIds.length, favoriteCount: 0, completedAt,
        } }
      }),
      reveal: () => mutate((state) => state.session && !state.session.revealed
        ? { data: { ...state, session: { ...state.session, revealed: true } } } : null),
      toggleHint: () => mutate((state) => state.session ? { data: { ...state,
        session: { ...state.session, hintShown: !state.session.hintShown, hintUsed: true },
      } } : null),
      undo: () => mutate((state) => state.history.length ? { data: undoContext(state) } : null),
      discard: () => mutate((state) => ({ data: migrateContextAliases({ ...state, session: null, history: [] }, aliases, day()) })),
      removeReviewWord: (wordId) => mutate((state) => {
        const canonical = aliases.resolveWordId(wordId)
        if (!senses.some(sense => sense.wordId === canonical) || state.excludedWordIds?.includes(canonical)) return null
        const members = [...aliases.groups.values()].find(group => group.representativeWordId === canonical)?.members.map(member => member.wordId) ?? []
        return { data: { ...state, excludedWordIds: [...new Set([...(state.excludedWordIds ?? []), canonical, ...members])] } }
      }),
      clearResult: () => set({ lastResult: null }),
    }
  })
}
