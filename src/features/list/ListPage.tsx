import { memo, startTransition, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BookOpen, Heart, Search, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import { useExamStore } from '@/features/exam/examStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { allSets, getSetName, getStudyItemById, getStudyItemFavoriteWordIds, getStudyItemPartLabel, getStudyItemSearchText, getStudyItemsForSet, hasStudyItemTopic } from '@/features/vocab/model/selectors'
import type { StudyItem } from '@/features/vocab/model/types'
import styles from '@/features/list/list.module.css'

const TOOLBAR_INTERACTION_LOCK_MS = 640
const EMPTY_FAVORITE_IDS: string[] = []

let cachedFavoriteIds: string[] | null = null
let cachedFavoriteIdSet = new Set<string>()

type RenderEntry =
  | { type: 'topic'; id: string; label: string }
  | { type: 'item'; item: StudyItem; displayNumber: number }

function resolveListSetId(setId: string | 'all') {
  if (setId === 'all') {
    return allSets[0]?.id ?? 'favorites'
  }

  return setId
}

function subscribeToFavoriteIds(onStoreChange: () => void) {
  return useFavoritesStore.subscribe((state, previousState) => {
    if (state.favoriteIds !== previousState.favoriteIds) {
      onStoreChange()
    }
  })
}

function getFavoriteIdSetSnapshot() {
  const favoriteIds = useFavoritesStore.getState().favoriteIds

  if (favoriteIds !== cachedFavoriteIds) {
    cachedFavoriteIds = favoriteIds
    cachedFavoriteIdSet = new Set(favoriteIds)
  }

  return cachedFavoriteIdSet
}

function useFavoriteIdsForListFilter(enabled: boolean) {
  return useSyncExternalStore(
    subscribeToFavoriteIds,
    () => (enabled ? useFavoritesStore.getState().favoriteIds : EMPTY_FAVORITE_IDS),
    () => EMPTY_FAVORITE_IDS,
  )
}

function useIsFavoriteWord(wordId: string) {
  return useSyncExternalStore(
    subscribeToFavoriteIds,
    () => getFavoriteIdSetSnapshot().has(wordId),
    () => false,
  )
}

function isStudyItemFavoriteInSet(item: StudyItem, favoriteIdSet: Set<string>) {
  return item.favoriteWordIds.some((wordId) => favoriteIdSet.has(wordId))
}

function SlashGlyphIcon({
  glyph,
  glyphFontFamily,
  size = 24,
  strokeWidth = 1.9,
  ...rest
}: LucideProps & {
  glyph: string
  glyphFontFamily: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden="true"
      {...rest}
    >
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="20"
        fontWeight="700"
        fontFamily={glyphFontFamily}
        fill="currentColor"
        stroke="none"
      >
        {glyph}
      </text>
      <path d="M4.5 4.5L19.5 19.5" />
    </svg>
  )
}

function JapaneseHiddenIcon(props: LucideProps) {
  return <SlashGlyphIcon {...props} glyph="日" glyphFontFamily="var(--font-jp), 'Noto Sans JP', sans-serif" />
}

function MeaningHiddenIcon(props: LucideProps) {
  return <SlashGlyphIcon {...props} glyph="가" glyphFontFamily="var(--font-ui), 'Noto Sans KR', sans-serif" />
}

function getCardRootState(cardSurface: HTMLElement) {
  const root = cardSurface.closest<HTMLElement>('[data-hide-japanese][data-hide-meaning]')

  return {
    hideJapanese: root?.dataset.hideJapanese === 'true',
    hideMeaning: root?.dataset.hideMeaning === 'true',
  }
}

function hasHiddenCardContent(cardSurface: HTMLElement) {
  const { hideJapanese, hideMeaning } = getCardRootState(cardSurface)

  return (hideJapanese && cardSurface.dataset.revealJapanese !== 'true') || (hideMeaning && cardSurface.dataset.revealMeaning !== 'true')
}

function getSharedComparisonDescription(leftDescription: string, rightDescription: string) {
  const normalizedLeft = leftDescription.trim()
  const normalizedRight = rightDescription.trim()

  if (!normalizedLeft) return normalizedRight
  if (!normalizedRight) return normalizedLeft
  if (normalizedLeft === normalizedRight) return normalizedLeft

  return `${normalizedLeft}\n\n${normalizedRight}`
}

type RevealedCardState = {
  japanese: boolean
  meaning: boolean
}

type HideTarget = keyof RevealedCardState
type ScheduledAfterPaintTask = {
  cancel: () => void
}
type PendingHidePreferenceCommit = ScheduledAfterPaintTask & {
  next: boolean
}
type PendingFontScalePreferenceCommit = ScheduledAfterPaintTask & {
  next: number
}
type FontScaleDirection = 'decrease' | 'increase'

const HIDE_TARGETS: HideTarget[] = ['japanese', 'meaning']
const TOUCH_CLICK_SUPPRESSION_MS = 420
const TAP_MOVE_THRESHOLD_PX = 8
const MIN_LIST_FONT_SCALE = 0
const MAX_LIST_FONT_SCALE = 6
const LIST_FONT_SCALE_PRESETS = [
  { jp: '1.02rem', reading: '0.76rem', meaning: '0.82rem' },
  { jp: '1.12rem', reading: '0.82rem', meaning: '0.88rem' },
  { jp: '1.22rem', reading: '0.88rem', meaning: '0.94rem' },
  { jp: '1.32rem', reading: '0.94rem', meaning: '1rem' },
  { jp: '1.44rem', reading: '1rem', meaning: '1.08rem' },
  { jp: '1.56rem', reading: '1.08rem', meaning: '1.16rem' },
  { jp: '1.7rem', reading: '1.16rem', meaning: '1.24rem' },
] as const

function clampListFontScale(next: number) {
  const normalized = Number.isFinite(next) ? Math.trunc(next) : 3

  return Math.max(MIN_LIST_FONT_SCALE, Math.min(MAX_LIST_FONT_SCALE, normalized))
}

function getListFontScalePreset(fontScale: number) {
  return LIST_FONT_SCALE_PRESETS[clampListFontScale(fontScale)] ?? LIST_FONT_SCALE_PRESETS[3]
}

function getListFontScaleStyle(fontScale: number): CSSProperties {
  const preset = getListFontScalePreset(fontScale)

  return {
    '--list-jp-size': preset.jp,
    '--list-reading-size': preset.reading,
    '--list-meaning-size': preset.meaning,
  } as CSSProperties
}

function applyListFontScaleStyle(root: HTMLElement | null, fontScale: number) {
  if (!root) {
    return
  }

  const nextFontScale = clampListFontScale(fontScale)
  const preset = getListFontScalePreset(nextFontScale)

  root.dataset.listFontScale = String(nextFontScale)
  root.style.setProperty('--list-jp-size', preset.jp)
  root.style.setProperty('--list-reading-size', preset.reading)
  root.style.setProperty('--list-meaning-size', preset.meaning)
}

function scheduleAfterNextPaint(callback: () => void): ScheduledAfterPaintTask {
  if (typeof window === 'undefined') {
    callback()
    return { cancel: () => undefined }
  }

  let frameId: number | undefined
  let timeoutId: number | undefined
  let canceled = false

  const run = () => {
    if (canceled) {
      return
    }

    timeoutId = window.setTimeout(() => {
      if (!canceled) {
        callback()
      }
    }, 0)
  }

  if (typeof window.requestAnimationFrame === 'function') {
    frameId = window.requestAnimationFrame(run)
  } else {
    timeoutId = window.setTimeout(() => {
      if (!canceled) {
        callback()
      }
    }, 0)
  }

  return {
    cancel: () => {
      canceled = true
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId)
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    },
  }
}

function syncCardSurfaceRevealability(cardSurface: HTMLElement) {
  if (hasHiddenCardContent(cardSurface)) {
    cardSurface.dataset.revealable = 'true'
    cardSurface.tabIndex = 0
    cardSurface.setAttribute('role', 'button')
    return
  }

  delete cardSurface.dataset.revealable
  cardSurface.removeAttribute('tabindex')
  cardSurface.removeAttribute('role')
}

function syncCardSurfaces(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-card-surface="true"]').forEach(syncCardSurfaceRevealability)
}

function setCardSurfaceRevealState(cardSurface: HTMLElement, revealedState?: RevealedCardState) {
  if (revealedState?.japanese) {
    cardSurface.dataset.revealJapanese = 'true'
  } else {
    delete cardSurface.dataset.revealJapanese
  }

  if (revealedState?.meaning) {
    cardSurface.dataset.revealMeaning = 'true'
  } else {
    delete cardSurface.dataset.revealMeaning
  }

  syncCardSurfaceRevealability(cardSurface)
}

function clearCardSurfaceRevealState(root: HTMLElement, target: HideTarget) {
  const selector = target === 'japanese'
    ? '[data-card-surface="true"][data-reveal-japanese="true"]'
    : '[data-card-surface="true"][data-reveal-meaning="true"]'

  root.querySelectorAll<HTMLElement>(selector).forEach((cardSurface) => {
    if (target === 'japanese') {
      delete cardSurface.dataset.revealJapanese
    } else {
      delete cardSurface.dataset.revealMeaning
    }
  })
}

function scheduleCardSurfacesSync(root: HTMLElement, sync: () => void) {
  scheduleAfterNextPaint(() => {
    if (root.isConnected) {
      sync()
    }
  })
}

function getListHideDataset(root: HTMLElement | null, target: HideTarget, fallback: boolean) {
  if (!root) {
    return fallback
  }

  return target === 'japanese'
    ? root.dataset.hideJapanese === 'true'
    : root.dataset.hideMeaning === 'true'
}

function setListHideDataset(root: HTMLElement | null, target: HideTarget, next: boolean, deferSync = false) {
  if (!root) {
    return
  }

  if (target === 'japanese') {
    root.dataset.hideJapanese = String(next)
  } else {
    root.dataset.hideMeaning = String(next)
  }

  const sync = () => {
    if (!next) {
      clearCardSurfaceRevealState(root, target)
    }

    syncCardSurfaces(root)
  }

  if (deferSync) {
    scheduleCardSurfacesSync(root, sync)
  } else {
    sync()
  }
}

const FavoriteCardButton = memo(function FavoriteCardButton({ wordId }: { wordId: string }) {
  const isFavorite = useIsFavoriteWord(wordId)
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite)
  const suppressNextClickRef = useRef(false)

  const handleToggle = useCallback(() => {
    toggleFavorite(wordId)
  }, [toggleFavorite, wordId])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' || event.button > 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    suppressNextClickRef.current = true
    window.setTimeout(() => {
      suppressNextClickRef.current = false
    }, TOUCH_CLICK_SUPPRESSION_MS)
    handleToggle()
  }, [handleToggle])

  const handleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }

    handleToggle()
  }, [handleToggle])

  return (
    <Tooltip label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}>
      <button
        type="button"
        aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        aria-pressed={isFavorite}
        className={styles.cardFavoriteButton}
        data-active={isFavorite}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        <Heart size={18} strokeWidth={1.9} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
    </Tooltip>
  )
})

const VocabCard = memo(function VocabCard({
  item,
  displayNumber,
  revealedState,
  onReveal,
}: {
  item: StudyItem
  displayNumber: number
  revealedState?: RevealedCardState
  onReveal: (wordId: string, cardSurface: HTMLElement) => void
}) {
  const cardSurfaceRef = useRef<HTMLDivElement>(null)
  const pendingTapRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const suppressNextClickRef = useRef(false)
  const sharedComparisonDescription =
    item.kind === 'comparison'
      ? getSharedComparisonDescription(item.pair.leftDescription, item.pair.rightDescription)
      : ''

  useLayoutEffect(() => {
    const cardSurface = cardSurfaceRef.current

    if (!cardSurface) {
      return
    }

    setCardSurfaceRevealState(cardSurface, revealedState)
  }, [revealedState])

  const revealCardSurface = (cardSurface: HTMLElement) => {
    if (!hasHiddenCardContent(cardSurface)) {
      return
    }

    onReveal(item.id, cardSurface)
  }

  const handleCardPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') {
      return
    }

    pendingTapRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
  }

  const handleCardPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pendingTapRef.current?.pointerId === event.pointerId) {
      pendingTapRef.current = null
    }
  }

  const handleCardPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pendingTap = pendingTapRef.current

    if (event.pointerType === 'mouse' || !pendingTap || pendingTap.pointerId !== event.pointerId) {
      return
    }

    pendingTapRef.current = null

    const movedX = Math.abs(event.clientX - pendingTap.x)
    const movedY = Math.abs(event.clientY - pendingTap.y)

    if (movedX > TAP_MOVE_THRESHOLD_PX || movedY > TAP_MOVE_THRESHOLD_PX) {
      return
    }

    suppressNextClickRef.current = true
    window.setTimeout(() => {
      suppressNextClickRef.current = false
    }, TOUCH_CLICK_SUPPRESSION_MS)
    revealCardSurface(event.currentTarget)
  }

  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }

    if (!hasHiddenCardContent(event.currentTarget)) {
      return
    }

    revealCardSurface(event.currentTarget)
  }

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasHiddenCardContent(event.currentTarget)) {
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onReveal(item.id, event.currentTarget)
    }
  }

  return (
    <article className={styles.card}>
      <div
        ref={cardSurfaceRef}
        className={styles.cardSurface}
        data-card-surface="true"
        onPointerDown={handleCardPointerDown}
        onPointerCancel={handleCardPointerCancel}
        onPointerUp={handleCardPointerUp}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
      >
        <div className={styles.cardTop}>
          <div className={styles.chipRow}>
            <span className={styles.orderBadge}>{displayNumber}번</span>
            {item.kind === 'word' ? <span className={styles.partBadge}>{getStudyItemPartLabel(item)}</span> : null}
          </div>
          {item.kind === 'word' ? (
            <FavoriteCardButton wordId={getStudyItemFavoriteWordIds(item)[0] ?? item.word.id} />
          ) : null}
        </div>

        {item.kind === 'word' ? (
          <div className={styles.cardBody}>
            <div className={styles.wordColumn}>
              <span className={`${styles.jp} ${styles.concealable} ${styles.jpConcealable}`} lang="ja-JP" translate="no">
                {item.word.japanese}
              </span>
              <span className={`${styles.reading} ${styles.concealable} ${styles.readingConcealable}`} lang="ja-JP" translate="no">
                {item.word.reading}
              </span>
            </div>

            <div className={styles.meaningColumn}>
              <span className={`${styles.meaning} ${styles.concealable} ${styles.meaningConcealable}`}>{item.word.meaning}</span>
            </div>
          </div>
        ) : (
          <div className={styles.compareCardStack}>
            <div className={styles.compareCardBody}>
              <div className={styles.compareWordColumn}>
                <span className={`${styles.jp} ${styles.concealable} ${styles.jpConcealable}`} lang="ja-JP" translate="no">
                  {item.leftWord.japanese}
                </span>
                <span className={`${styles.reading} ${styles.concealable} ${styles.readingConcealable}`} lang="ja-JP" translate="no">
                  {item.leftWord.reading}
                </span>
                <span className={`${styles.meaning} ${styles.concealable} ${styles.meaningConcealable}`}>{item.leftWord.meaning}</span>
              </div>
              <div className={styles.compareWordColumn}>
                <span className={`${styles.jp} ${styles.concealable} ${styles.jpConcealable}`} lang="ja-JP" translate="no">
                  {item.rightWord.japanese}
                </span>
                <span className={`${styles.reading} ${styles.concealable} ${styles.readingConcealable}`} lang="ja-JP" translate="no">
                  {item.rightWord.reading}
                </span>
                <span className={`${styles.meaning} ${styles.concealable} ${styles.meaningConcealable}`}>{item.rightWord.meaning}</span>
              </div>
            </div>
            {sharedComparisonDescription ? <p className={styles.compareDescriptionLine}>{sharedComparisonDescription}</p> : null}
          </div>
        )}
      </div>
    </article>
  )
})

const ListGrid = memo(function ListGrid({
  renderEntries,
  revealedCards,
  onReveal,
}: {
  renderEntries: RenderEntry[]
  revealedCards: Record<string, RevealedCardState>
  onReveal: (wordId: string, cardSurface: HTMLElement) => void
}) {
  return (
    <div className={styles.grid}>
      {renderEntries.map((entry) => entry.type === 'topic' ? (
        <div key={entry.id} className={styles.topicHeader}>
          <span className={styles.topicHeaderChip}>{entry.label}</span>
        </div>
      ) : (
        <VocabCard
          key={entry.item.id}
          item={entry.item}
          displayNumber={entry.displayNumber}
          revealedState={revealedCards[entry.item.id]}
          onReveal={onReveal}
        />
      ))}
    </div>
  )
})

export function ListPage() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const wrongAnswerIds = useExamStore((state) => state.wrongAnswerIds)
  const hideJapaneseInList = usePreferencesStore((state) => state.hideJapaneseInList)
  const hideMeaningInList = usePreferencesStore((state) => state.hideMeaningInList)
  const listFontScale = usePreferencesStore((state) => state.listFontScale)
  const lastSelectedSetId = usePreferencesStore((state) => state.lastSelectedSetId)
  const setLastSelectedSetId = usePreferencesStore((state) => state.setLastSelectedSetId)
  const setHideJapaneseInList = usePreferencesStore((state) => state.setHideJapaneseInList)
  const setHideMeaningInList = usePreferencesStore((state) => state.setHideMeaningInList)
  const setListFontScale = usePreferencesStore((state) => state.setListFontScale)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [optimisticHideState, setOptimisticHideState] = useState<RevealedCardState>(() => ({
    japanese: hideJapaneseInList,
    meaning: hideMeaningInList,
  }))
  const [optimisticFontScale, setOptimisticFontScale] = useState(() => clampListFontScale(listFontScale))
  const [revealedCards, setRevealedCards] = useState<Record<string, RevealedCardState>>({})
  const deferredQuery = useDeferredValue(query)
  const [toolbarVisible, setToolbarVisible] = useState(true)
  const lastScrollYRef = useRef(0)
  const scrollDirectionRef = useRef<'up' | 'down' | null>(null)
  const scrollDistanceRef = useRef(0)
  const toolbarInteractionLockUntilRef = useRef(0)
  const fastSyncedHideTargetsRef = useRef<Record<HideTarget, boolean>>({ japanese: false, meaning: false })
  const previousHideStateRef = useRef<RevealedCardState | null>(null)
  const pendingHidePreferenceCommitsRef = useRef<Record<HideTarget, PendingHidePreferenceCommit | null>>({
    japanese: null,
    meaning: null,
  })
  const optimisticFontScaleRef = useRef(optimisticFontScale)
  const pendingFontScalePreferenceCommitRef = useRef<PendingFontScalePreferenceCommit | null>(null)
  const suppressHideClickRef = useRef<Record<HideTarget, boolean>>({ japanese: false, meaning: false })
  const suppressFontScaleClickRef = useRef<Record<FontScaleDirection, boolean>>({
    decrease: false,
    increase: false,
  })
  const effectiveHideJapaneseInList = optimisticHideState.japanese
  const effectiveHideMeaningInList = optimisticHideState.meaning
  const wrongAnswerWords = useMemo(
    () =>
      wrongAnswerIds
        .map((itemId) => getStudyItemById(itemId))
        .filter((item): item is StudyItem => item !== undefined),
    [wrongAnswerIds],
  )
  const resolvedSetId = resolveListSetId(lastSelectedSetId)
  const currentSetName = resolvedSetId === 'wrong_answers' ? '오답 노트' : getSetName(resolvedSetId)
  const needsFavoriteFilteredList = favoritesOnly || resolvedSetId === 'favorites'
  const favoriteIdsForFilter = useFavoriteIdsForListFilter(needsFavoriteFilteredList)
  const favoriteIdSetForFilter = useMemo(() => new Set(favoriteIdsForFilter), [favoriteIdsForFilter])

  useEffect(() => {
    if (resolvedSetId !== lastSelectedSetId) {
      setLastSelectedSetId(resolvedSetId)
    }
  }, [lastSelectedSetId, resolvedSetId, setLastSelectedSetId])

  useEffect(() => {
    setOptimisticHideState((current) => {
      const next = {
        japanese: pendingHidePreferenceCommitsRef.current.japanese ? current.japanese : hideJapaneseInList,
        meaning: pendingHidePreferenceCommitsRef.current.meaning ? current.meaning : hideMeaningInList,
      }

      return next.japanese === current.japanese && next.meaning === current.meaning ? current : next
    })
  }, [hideJapaneseInList, hideMeaningInList])

  useEffect(() => {
    if (pendingFontScalePreferenceCommitRef.current) {
      return
    }

    const nextFontScale = clampListFontScale(listFontScale)

    optimisticFontScaleRef.current = nextFontScale
    setOptimisticFontScale((current) => (current === nextFontScale ? current : nextFontScale))
  }, [listFontScale])

  const baseWords = useMemo(() => {
    if (resolvedSetId === 'wrong_answers') {
      return wrongAnswerWords
    }

    return getStudyItemsForSet(
      resolvedSetId,
      resolvedSetId === 'favorites' ? favoriteIdsForFilter : EMPTY_FAVORITE_IDS,
    )
  }, [favoriteIdsForFilter, resolvedSetId, wrongAnswerWords])

  const words = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase()

    return baseWords
      .filter((item) => (favoritesOnly ? isStudyItemFavoriteInSet(item, favoriteIdSetForFilter) : true))
      .filter((item) => getStudyItemSearchText(item).includes(normalizedQuery))
  }, [baseWords, deferredQuery, favoriteIdSetForFilter, favoritesOnly])

  const renderEntries = useMemo<RenderEntry[]>(() => {
    const entries: RenderEntry[] = []
    let displayNumber = 1
    let lastTopicKey: string | null = null

    for (const item of words) {
      const topicKey = item.kind === 'word' ? item.topicId ?? null : null
      const topicLabel = item.kind === 'word' ? item.topicName ?? null : null

      if (hasStudyItemTopic(item) && topicKey && topicLabel && lastTopicKey !== topicKey) {
        entries.push({
          type: 'topic',
          id: topicKey,
          label: topicLabel,
        })
        lastTopicKey = topicKey
      }

      entries.push({
        type: 'item',
        item,
        displayNumber,
      })
      displayNumber += 1
    }

    return entries
  }, [words])

  useEffect(() => {
    setRevealedCards((current) => {
      let changed = false
      const nextEntries = Object.entries(current).flatMap(([wordId, state]) => {
        const nextState: RevealedCardState = {
          japanese: effectiveHideJapaneseInList ? state.japanese : false,
          meaning: effectiveHideMeaningInList ? state.meaning : false,
        }

        if (nextState.japanese === state.japanese && nextState.meaning === state.meaning) {
          return [[wordId, state] as const]
        }

        changed = true
        if (!nextState.japanese && !nextState.meaning) {
          return []
        }

        return [[wordId, nextState] as const]
      })

      return changed ? Object.fromEntries(nextEntries) : current
    })
  }, [effectiveHideJapaneseInList, effectiveHideMeaningInList])

  useLayoutEffect(() => {
    const root = rootRef.current

    if (!root) {
      return
    }

    root.dataset.hideJapanese = String(effectiveHideJapaneseInList)
    root.dataset.hideMeaning = String(effectiveHideMeaningInList)

    const previousHideState = previousHideStateRef.current
    const nextHideState = {
      japanese: effectiveHideJapaneseInList,
      meaning: effectiveHideMeaningInList,
    }
    previousHideStateRef.current = nextHideState

    if (!previousHideState) {
      if (!effectiveHideJapaneseInList) {
        clearCardSurfaceRevealState(root, 'japanese')
      }
      if (!effectiveHideMeaningInList) {
        clearCardSurfaceRevealState(root, 'meaning')
      }
      syncCardSurfaces(root)
      return
    }

    let needsSurfaceSync = false

    for (const target of HIDE_TARGETS) {
      const changed = previousHideState[target] !== nextHideState[target]

      if (!changed) {
        continue
      }

      if (fastSyncedHideTargetsRef.current[target]) {
        fastSyncedHideTargetsRef.current[target] = false
        continue
      }

      if (!nextHideState[target]) {
        clearCardSurfaceRevealState(root, target)
      }
      needsSurfaceSync = true
    }

    if (needsSurfaceSync) {
      syncCardSurfaces(root)
    }
  }, [effectiveHideJapaneseInList, effectiveHideMeaningInList])

  const handleRevealWord = useCallback((wordId: string, cardSurface: HTMLElement) => {
    const { hideJapanese, hideMeaning } = getCardRootState(cardSurface)

    if (!hideJapanese && !hideMeaning) {
      syncCardSurfaceRevealability(cardSurface)
      return
    }

    if (hideJapanese) {
      cardSurface.dataset.revealJapanese = 'true'
    }

    if (hideMeaning) {
      cardSurface.dataset.revealMeaning = 'true'
    }

    syncCardSurfaceRevealability(cardSurface)

    setRevealedCards((current) => {
      const previous = current[wordId] ?? { japanese: false, meaning: false }
      const nextState: RevealedCardState = {
        japanese: previous.japanese || hideJapanese,
        meaning: previous.meaning || hideMeaning,
      }

      if (previous.japanese === nextState.japanese && previous.meaning === nextState.meaning) {
        return current
      }

      return {
        ...current,
        [wordId]: nextState,
      }
    })
  }, [])

  const fontScaleStyle = useMemo(() => getListFontScaleStyle(optimisticFontScale), [optimisticFontScale])

  useLayoutEffect(() => {
    applyListFontScaleStyle(rootRef.current, optimisticFontScale)
  }, [optimisticFontScale])

  const keepToolbarVisible = useCallback(() => {
    const now = typeof performance === 'undefined' ? Date.now() : performance.now()
    toolbarInteractionLockUntilRef.current = now + TOOLBAR_INTERACTION_LOCK_MS
    setToolbarVisible(true)
    scrollDirectionRef.current = null
    scrollDistanceRef.current = 0
  }, [])

  const commitHidePreference = useCallback((target: HideTarget, next: boolean) => {
    const preferences = usePreferencesStore.getState()

    if (target === 'japanese') {
      if (preferences.hideJapaneseInList !== next) {
        setHideJapaneseInList(next)
      }
      return
    }

    if (preferences.hideMeaningInList !== next) {
      setHideMeaningInList(next)
    }
  }, [setHideJapaneseInList, setHideMeaningInList])

  const flushPendingHidePreferenceCommits = useCallback(() => {
    for (const target of HIDE_TARGETS) {
      const pendingCommit = pendingHidePreferenceCommitsRef.current[target]

      if (!pendingCommit) {
        continue
      }

      pendingCommit.cancel()
      pendingHidePreferenceCommitsRef.current[target] = null
      commitHidePreference(target, pendingCommit.next)
    }
  }, [commitHidePreference])

  const commitFontScalePreference = useCallback((next: number) => {
    const nextFontScale = clampListFontScale(next)

    if (usePreferencesStore.getState().listFontScale !== nextFontScale) {
      setListFontScale(nextFontScale)
    }
  }, [setListFontScale])

  const flushPendingFontScalePreferenceCommit = useCallback(() => {
    const pendingCommit = pendingFontScalePreferenceCommitRef.current

    if (!pendingCommit) {
      return
    }

    pendingCommit.cancel()
    pendingFontScalePreferenceCommitRef.current = null
    commitFontScalePreference(pendingCommit.next)
  }, [commitFontScalePreference])

  const flushPendingPreferenceCommits = useCallback(() => {
    flushPendingHidePreferenceCommits()
    flushPendingFontScalePreferenceCommit()
  }, [flushPendingFontScalePreferenceCommit, flushPendingHidePreferenceCommits])

  useEffect(() => {
    return () => {
      flushPendingPreferenceCommits()
    }
  }, [flushPendingPreferenceCommits])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    window.addEventListener('pagehide', flushPendingPreferenceCommits)
    return () => window.removeEventListener('pagehide', flushPendingPreferenceCommits)
  }, [flushPendingPreferenceCommits])

  const scheduleHidePreferenceCommit = useCallback((target: HideTarget, next: boolean) => {
    pendingHidePreferenceCommitsRef.current[target]?.cancel()

    const pendingCommit: PendingHidePreferenceCommit = {
      next,
      cancel: () => undefined,
    }

    pendingHidePreferenceCommitsRef.current[target] = pendingCommit
    pendingCommit.cancel = scheduleAfterNextPaint(() => {
      if (pendingHidePreferenceCommitsRef.current[target] !== pendingCommit) {
        return
      }

      pendingHidePreferenceCommitsRef.current[target] = null
      startTransition(() => {
        commitHidePreference(target, next)
      })
    }).cancel
  }, [commitHidePreference])

  const scheduleFontScalePreferenceCommit = useCallback((next: number) => {
    pendingFontScalePreferenceCommitRef.current?.cancel()

    const nextFontScale = clampListFontScale(next)
    const pendingCommit: PendingFontScalePreferenceCommit = {
      next: nextFontScale,
      cancel: () => undefined,
    }

    pendingFontScalePreferenceCommitRef.current = pendingCommit
    pendingCommit.cancel = scheduleAfterNextPaint(() => {
      if (pendingFontScalePreferenceCommitRef.current !== pendingCommit) {
        return
      }

      pendingFontScalePreferenceCommitRef.current = null
      startTransition(() => {
        commitFontScalePreference(nextFontScale)
      })
    }).cancel
  }, [commitFontScalePreference])

  const applyImmediateHideToggle = useCallback((target: HideTarget, control?: HTMLElement) => {
    const current = getListHideDataset(rootRef.current, target, optimisticHideState[target])
    const next = !current

    keepToolbarVisible()
    fastSyncedHideTargetsRef.current[target] = true
    if (control) {
      control.dataset.active = String(next)
    }

    setListHideDataset(rootRef.current, target, next, true)
    setOptimisticHideState((currentState) => (
      currentState[target] === next ? currentState : { ...currentState, [target]: next }
    ))
    scheduleHidePreferenceCommit(target, next)
  }, [keepToolbarVisible, optimisticHideState, scheduleHidePreferenceCommit])

  const handleHideTogglePointerDown = useCallback((target: HideTarget, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' || event.button > 0) {
      return
    }

    event.preventDefault()
    suppressHideClickRef.current[target] = true
    window.setTimeout(() => {
      suppressHideClickRef.current[target] = false
    }, TOUCH_CLICK_SUPPRESSION_MS)
    applyImmediateHideToggle(target, event.currentTarget)
  }, [applyImmediateHideToggle])

  const handleHideToggleClick = useCallback((target: HideTarget, event: MouseEvent<HTMLButtonElement>) => {
    if (suppressHideClickRef.current[target]) {
      suppressHideClickRef.current[target] = false
      return
    }

    applyImmediateHideToggle(target, event.currentTarget)
  }, [applyImmediateHideToggle])

  const applyImmediateFontScaleDelta = useCallback((delta: number) => {
    const nextFontScale = clampListFontScale(optimisticFontScaleRef.current + delta)

    keepToolbarVisible()

    if (nextFontScale === optimisticFontScaleRef.current) {
      return
    }

    optimisticFontScaleRef.current = nextFontScale
    applyListFontScaleStyle(rootRef.current, nextFontScale)
    setOptimisticFontScale(nextFontScale)
    scheduleFontScalePreferenceCommit(nextFontScale)
  }, [keepToolbarVisible, scheduleFontScalePreferenceCommit])

  const handleFontScalePointerDown = useCallback((direction: FontScaleDirection, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' || event.button > 0) {
      return
    }

    event.preventDefault()
    suppressFontScaleClickRef.current[direction] = true
    window.setTimeout(() => {
      suppressFontScaleClickRef.current[direction] = false
    }, TOUCH_CLICK_SUPPRESSION_MS)
    applyImmediateFontScaleDelta(direction === 'increase' ? 1 : -1)
  }, [applyImmediateFontScaleDelta])

  const handleFontScaleClick = useCallback((direction: FontScaleDirection) => {
    if (suppressFontScaleClickRef.current[direction]) {
      suppressFontScaleClickRef.current[direction] = false
      return
    }

    applyImmediateFontScaleDelta(direction === 'increase' ? 1 : -1)
  }, [applyImmediateFontScaleDelta])

  useEffect(() => {
    lastScrollYRef.current = window.scrollY
    scrollDirectionRef.current = null
    scrollDistanceRef.current = 0

    const handleScroll = () => {
      const currentY = Math.max(window.scrollY, 0)
      const delta = currentY - lastScrollYRef.current
      lastScrollYRef.current = currentY
      const magnitude = Math.abs(delta)
      const now = typeof performance === 'undefined' ? Date.now() : performance.now()

      if (now < toolbarInteractionLockUntilRef.current) {
        setToolbarVisible(true)
        scrollDirectionRef.current = null
        scrollDistanceRef.current = 0
        return
      }

      if (magnitude < 2) {
        return
      }

      if (currentY <= 24) {
        setToolbarVisible(true)
        scrollDirectionRef.current = null
        scrollDistanceRef.current = 0
        return
      }

      const direction = delta > 0 ? 'down' : 'up'

      if (scrollDirectionRef.current !== direction) {
        scrollDirectionRef.current = direction
        scrollDistanceRef.current = 0
      }

      scrollDistanceRef.current += magnitude

      if (direction === 'up' && scrollDistanceRef.current >= 18) {
        setToolbarVisible(true)
        scrollDistanceRef.current = 0
        return
      }

      if (direction === 'down' && scrollDistanceRef.current >= 42) {
        setToolbarVisible(false)
        scrollDistanceRef.current = 0
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div
      ref={rootRef}
      className={styles.root}
      style={fontScaleStyle}
      data-hide-japanese={effectiveHideJapaneseInList}
      data-hide-meaning={effectiveHideMeaningInList}
      data-list-font-scale={optimisticFontScale}
    >
      <div className="page-header">
        <div className="page-header__left">
          <Tooltip label="홈으로 이동">
            <span>
              <IconButton icon={Undo2} label="홈으로 이동" onClick={() => navigate('/')} />
            </span>
          </Tooltip>
          <div className="page-header__meta">
            <p className="page-header__caption">{currentSetName}</p>
            <h1 className="page-header__title">목록 모드</h1>
          </div>
        </div>
        <div className="page-header__right">
          <span className="page-header__caption">{`${words.length}개 표시`}</span>
        </div>
      </div>

      <div className={`${styles.toolbarDock} ${toolbarVisible ? styles.toolbarVisible : styles.toolbarHidden}`}>
        <div className={styles.searchWrap}>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLead}>
              <Tooltip label="홈으로 이동">
                <span>
                  <IconButton
                    icon={Undo2}
                    label="홈으로 이동"
                    onClick={() => {
                      keepToolbarVisible()
                      navigate('/')
                    }}
                  />
                </span>
              </Tooltip>
            </div>
            <div className={styles.toolbarActions}>
              <Tooltip label="검색">
                <span>
                  <IconButton
                    icon={Search}
                    label="검색"
                    active={searchOpen}
                    onClick={() => {
                      keepToolbarVisible()
                      setSearchOpen((value) => !value)
                    }}
                  />
                </span>
              </Tooltip>
              <Tooltip label="일본어 가리기">
                <span>
                  <IconButton
                    icon={JapaneseHiddenIcon}
                    label="일본어 가리기"
                    active={effectiveHideJapaneseInList}
                    onPointerDown={(event) => handleHideTogglePointerDown('japanese', event)}
                    onClick={(event) => handleHideToggleClick('japanese', event)}
                  />
                </span>
              </Tooltip>
              <Tooltip label="뜻 가리기">
                <span>
                  <IconButton
                    icon={MeaningHiddenIcon}
                    label="뜻 가리기"
                    active={effectiveHideMeaningInList}
                    onPointerDown={(event) => handleHideTogglePointerDown('meaning', event)}
                    onClick={(event) => handleHideToggleClick('meaning', event)}
                  />
                </span>
              </Tooltip>
              <Tooltip label="즐겨찾기만 보기">
                <span>
                  <IconButton
                    icon={Heart}
                    label="즐겨찾기만 보기"
                    active={favoritesOnly}
                    onClick={() => {
                      keepToolbarVisible()
                      setFavoritesOnly((value) => !value)
                    }}
                  />
                </span>
              </Tooltip>
              <span className={styles.fontControlGroup}>
                <Tooltip label="글자 작게">
                  <span>
                    <IconButton
                      icon={ZoomOut}
                      label="글자 작게"
                      onPointerDown={(event) => handleFontScalePointerDown('decrease', event)}
                      onClick={() => handleFontScaleClick('decrease')}
                      disabled={optimisticFontScale <= MIN_LIST_FONT_SCALE}
                    />
                  </span>
                </Tooltip>
                <Tooltip label="글자 크게">
                  <span>
                    <IconButton
                      icon={ZoomIn}
                      label="글자 크게"
                      onPointerDown={(event) => handleFontScalePointerDown('increase', event)}
                      onClick={() => handleFontScaleClick('increase')}
                      disabled={optimisticFontScale >= MAX_LIST_FONT_SCALE}
                    />
                  </span>
                </Tooltip>
              </span>
            </div>
          </div>

          {searchOpen ? (
            <input
              className="glass-input"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value
                startTransition(() => {
                  setQuery(nextQuery)
                })
              }}
              placeholder="일본어, 읽기, 뜻으로 검색"
            />
          ) : null}
        </div>
      </div>

      {words.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="표시할 단어가 없습니다."
          description={
            favoritesOnly
              ? '즐겨찾기 필터나 검색어를 다시 조정해 주세요.'
              : '세트와 검색 조건을 다시 확인해 주세요.'
          }
        />
      ) : (
        <ListGrid
          renderEntries={renderEntries}
          revealedCards={revealedCards}
          onReveal={handleRevealWord}
        />
      )}
    </div>
  )
}
