import { useEffect, useMemo, useState } from 'react'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { getFilteredWords, getWordsInRanges } from '@/features/study/wordSelection'
import { getSetName, getStudySelectableWordbooks, isComparisonWordbook, normalizeSelectableSetId } from '@/features/vocab/model/selectors'
import { useContextStore } from '@/features/learn/contextStore'
import { contextAliasCatalog, contextContentReady, contextSenseMap, contextSenses } from '@/features/learn/contextContent'
import { eligibleStudyWords } from '@/features/learn/contextEligibility'
import { scopedReviews } from '@/features/learn/contextPresentation'
import { localDay } from '@/features/learn/contextReviewPolicy'

/**
 * Same selection rules as v1 LearnSetupPage, exposed as one hook so the v2
 * "today" screen can start a session in one tap. Only existing pure functions
 * and stores are called; no scheduling logic lives here.
 */
export function useLearnPlan() {
  const learnDefaults = usePreferencesStore((state) => state.learnDefaults)
  const updateLearnDefaults = usePreferencesStore((state) => state.updateLearnDefaults)
  const lastSelectedSetId = usePreferencesStore((state) => state.lastSelectedSetId)
  const setLastSelectedSetId = usePreferencesStore((state) => state.setLastSelectedSetId)
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds)
  const data = useContextStore((state) => state.data)
  const busy = useContextStore((state) => state.busy)
  const ready = useContextStore((state) => state.ready)
  const start = useContextStore((state) => state.start)
  const [error, setError] = useState<string | null>(null)

  const selectedSetId = isComparisonWordbook(lastSelectedSetId) ? 'all' : normalizeSelectableSetId(lastSelectedSetId)
  const setName = selectedSetId === 'all' ? '자동 추천' : getSetName(selectedSetId)

  useEffect(() => {
    if (selectedSetId !== lastSelectedSetId) setLastSelectedSetId(selectedSetId)
  }, [lastSelectedSetId, selectedSetId, setLastSelectedSetId])

  const wordbooks = useMemo(() => getStudySelectableWordbooks(), [])

  const baseWords = useMemo(
    () => getFilteredWords({ setId: selectedSetId, favoritesOnly: learnDefaults.favoritesOnly, favoriteIds, rangeEnabled: false, rangeStart: 1, rangeEnd: 1 }),
    [favoriteIds, learnDefaults.favoritesOnly, selectedSetId],
  )
  const availableWords = useMemo(
    () =>
      getFilteredWords({
        setId: selectedSetId,
        favoritesOnly: learnDefaults.favoritesOnly,
        favoriteIds,
        rangeEnabled: learnDefaults.rangeEnabled,
        rangeStart: learnDefaults.rangeStart,
        rangeEnd: learnDefaults.rangeEnd,
      }),
    [favoriteIds, selectedSetId, learnDefaults.favoritesOnly, learnDefaults.rangeEnabled, learnDefaults.rangeEnd, learnDefaults.rangeStart],
  )
  const requiredWords = useMemo(
    () => (learnDefaults.requiredRangesEnabled ? getWordsInRanges(baseWords, learnDefaults.requiredRanges) : []),
    [baseWords, learnDefaults.requiredRanges, learnDefaults.requiredRangesEnabled],
  )

  const today = localDay()
  const scopeIds = useMemo(
    () => new Set([...availableWords, ...requiredWords].map((word) => contextAliasCatalog.resolveWordId(word.id))),
    [availableWords, requiredWords],
  )
  const eligibleIds = useMemo(() => eligibleStudyWords(data, contextSenses, today), [data, today])
  const maxAvailable = useMemo(() => [...scopeIds].filter((id) => eligibleIds.has(id)).length, [scopeIds, eligibleIds])
  const { dueCount, nextDue } = useMemo(
    () => scopedReviews(data.profiles, contextSenseMap, scopeIds, contextAliasCatalog.resolveWordId, today, data.excludedWordIds),
    [data.profiles, data.excludedWordIds, scopeIds, today],
  )
  const requiredCount = useMemo(
    () => new Set(requiredWords.map((word) => contextAliasCatalog.resolveWordId(word.id)).filter((id) => eligibleIds.has(id))).size,
    [requiredWords, eligibleIds],
  )
  const minimumCount = Math.max(1, requiredCount)

  useEffect(() => {
    if (learnDefaults.requiredRangesEnabled && learnDefaults.wordCount < minimumCount) updateLearnDefaults({ wordCount: minimumCount })
  }, [learnDefaults.requiredRangesEnabled, learnDefaults.wordCount, minimumCount, updateLearnDefaults])

  async function startSession() {
    if (learnDefaults.rangeEnabled && learnDefaults.rangeStart > learnDefaults.rangeEnd) {
      setError('범위 시작값이 끝값보다 클 수 없습니다.')
      return false
    }
    if (learnDefaults.requiredRangesEnabled) {
      const invalid = learnDefaults.requiredRanges.findIndex((range) => range.start > range.end)
      if (invalid >= 0) {
        setError(`필수 범위 ${invalid + 1}의 시작값이 끝값보다 클 수 없습니다.`)
        return false
      }
      if (learnDefaults.wordCount < requiredCount) {
        setError(`학습 수는 필수 단어 ${requiredCount}개 이상이어야 합니다.`)
        return false
      }
    }
    if (!contextContentReady) {
      setError('학습 예문을 확인하지 못했습니다. 다시 불러와 주세요.')
      return false
    }
    if (data.session) {
      setError('진행 중인 학습을 이어가거나 닫아 주세요.')
      return false
    }
    if (maxAvailable === 0) {
      setError(nextDue ? `지금 학습할 단어가 없습니다. 다음 복습일은 ${nextDue}입니다.` : '시작할 단어가 없습니다. 단어장과 조건을 확인해 주세요.')
      return false
    }
    setError(null)
    return start({
      setId: selectedSetId,
      setName,
      candidateWordIds: availableWords.map((word) => word.id),
      requiredWordIds: requiredWords.map((word) => word.id),
      wordCount: learnDefaults.wordCount,
      allowEarly: false,
    })
  }

  return {
    learnDefaults,
    updateLearnDefaults,
    selectedSetId,
    setSelectedSetId: setLastSelectedSetId,
    setName,
    wordbooks,
    baseCount: baseWords.length,
    maxAvailable,
    dueCount,
    nextDue,
    requiredCount,
    minimumCount,
    busy,
    ready,
    error,
    clearError: () => setError(null),
    startSession,
  }
}
