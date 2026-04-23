import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Minus, Play, Plus, RotateCcw, Undo2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { useDebugDateStore } from '@/features/debug/debugDateStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { Tooltip } from '@/components/Tooltip'
import { buildSmartReviewSummary } from '@/features/smart-review/smartReviewEngine'
import styles from '@/features/smart-review/smartReview.module.css'
import { useSmartReviewStore } from '@/features/smart-review/smartReviewStore'
import { allNonComparisonWords } from '@/features/vocab/model/selectors'

const MIN_WORD_COUNT = 1
const COUNT_STEP = 5
const SMART_REVIEW_SET_NAME = '기본 · 주제형'

function normalizeWordCount(wordCount: number, maxWordCount: number) {
  if (maxWordCount <= 0) {
    return 0
  }

  return Math.min(maxWordCount, Math.max(MIN_WORD_COUNT, Math.floor(wordCount) || MIN_WORD_COUNT))
}

export function SmartReviewSetupPage() {
  const navigate = useNavigate()
  const isHydrated = useSmartReviewStore((state) => state.isHydrated)
  const profiles = useSmartReviewStore((state) => state.profiles)
  const session = useSmartReviewStore((state) => state.session)
  const startSession = useSmartReviewStore((state) => state.startSession)
  const clearSession = useSmartReviewStore((state) => state.clearSession)
  const savedWordCount = usePreferencesStore((state) => state.smartReviewWordCount)
  const setSavedWordCount = usePreferencesStore((state) => state.setSmartReviewWordCount)
  const debugDayOffset = useDebugDateStore((state) => state.dayOffset)
  const [error, setError] = useState<string | null>(null)
  const [wordCount, setWordCount] = useState(savedWordCount)

  const words = useMemo(() => allNonComparisonWords, [])
  const summaryNow = useMemo(() => {
    const now = new Date()
    now.setDate(now.getDate() + debugDayOffset)
    return now
  }, [debugDayOffset])
  const summary = useMemo(() => buildSmartReviewSummary(words, profiles, summaryNow), [profiles, summaryNow, words])
  const eligibleWordCount = summary.dueCount + summary.newCount
  const availableWordCount = eligibleWordCount > 0 ? eligibleWordCount : summary.learningCount
  const effectiveWordCount = normalizeWordCount(wordCount, availableWordCount)

  useEffect(() => {
    setWordCount((current) => normalizeWordCount(current, availableWordCount))
  }, [availableWordCount])

  useEffect(() => {
    setWordCount(savedWordCount)
  }, [savedWordCount])

  useEffect(() => {
    if (effectiveWordCount > 0 && effectiveWordCount !== savedWordCount) {
      setSavedWordCount(effectiveWordCount)
    }
  }, [effectiveWordCount, savedWordCount, setSavedWordCount])

  const handleCountAdjust = (delta: number) => {
    setWordCount((current) => normalizeWordCount(current + delta, availableWordCount))
  }

  const handleCountChange = (event: ChangeEvent<HTMLInputElement>) => {
    setWordCount(normalizeWordCount(Number(event.target.value), availableWordCount))
  }

  const handleStart = async () => {
    if (availableWordCount === 0) {
      setError('시작할 단어가 없어요.')
      return
    }

    const didStart = await startSession({
      setId: 'all',
      setName: SMART_REVIEW_SET_NAME,
      words,
      wordCount: effectiveWordCount,
    })

    if (!didStart) {
      setError('시작할 단어가 없어요.')
      return
    }

    setError(null)
    navigate('/smart-review/session')
  }

  const handleDiscard = () => {
    if (!window.confirm('진행 중인 스마트 복습을 종료할까요?')) {
      return
    }

    clearSession()
  }

  return (
    <div className={styles.root}>
      <div className="page-header page-header--inline-action">
        <div className="page-header__left">
          <Tooltip label="뒤로">
            <span>
              <IconButton icon={Undo2} label="뒤로" onClick={() => navigate('/')} />
            </span>
          </Tooltip>
          <div className="page-header__meta">
            <p className="page-header__caption">문장 복습</p>
            <h1 className="page-header__title">스마트 복습</h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Tooltip label="스마트 복습 시작">
            <span>
              <IconButton
                icon={Play}
                label="스마트 복습 시작"
                size="lg"
                onClick={() => void handleStart()}
                disabled={!isHydrated || availableWordCount === 0}
              />
            </span>
          </Tooltip>
        </div>
      </div>

      {session ? (
        <GlassPanel className={styles.resumeBanner} variant="floating">
          <div>
            <p className="section-kicker">이어하기</p>
            <h2 className="page-header__title">{session.setName} 스마트 복습이 진행 중이에요.</h2>
            <p className="page-header__caption">
              {session.round}회차 {session.currentIndex + 1}/{session.activeQueue.length}
            </p>
          </div>
          <div className={styles.resumeActions}>
            <Tooltip label="이어서 보기">
              <span>
                <IconButton icon={RotateCcw} label="이어서 보기" size="lg" onClick={() => navigate('/smart-review/session')} />
              </span>
            </Tooltip>
            <Tooltip label="종료">
              <span>
                <IconButton icon={X} label="종료" tone="danger" size="lg" onClick={handleDiscard} />
              </span>
            </Tooltip>
          </div>
        </GlassPanel>
      ) : null}

      <GlassPanel className={styles.setupCard} padding="lg" variant="strong">
        <div>
          <p className="section-kicker">방식</p>
          <h2 className="page-header__title">오늘 분량</h2>
          <p className="page-header__caption">
            {isHydrated ? `${effectiveWordCount}개 시작` : '복습 일정을 불러오는 중이에요.'}
          </p>
        </div>

        <div className={styles.countPanel}>
          <Tooltip label="1개 줄이기">
            <span>
              <IconButton
                icon={Minus}
                label="5개 줄이기"
                onClick={() => handleCountAdjust(-COUNT_STEP)}
                disabled={!isHydrated || effectiveWordCount <= MIN_WORD_COUNT}
              />
            </span>
          </Tooltip>
          <label className={styles.countField} htmlFor="smart-review-count">
            <input
              id="smart-review-count"
              type="number"
              min={availableWordCount > 0 ? MIN_WORD_COUNT : 0}
              max={availableWordCount}
              className={`glass-input ${styles.countInput}`}
              value={effectiveWordCount}
              onChange={handleCountChange}
              disabled={!isHydrated || availableWordCount === 0}
            />
            <span className={styles.countMeta}>MAX {availableWordCount}</span>
          </label>
          <Tooltip label="5개 늘리기">
            <span>
              <IconButton
                icon={Plus}
                label="5개 늘리기"
                onClick={() => handleCountAdjust(COUNT_STEP)}
                disabled={!isHydrated || effectiveWordCount >= availableWordCount}
              />
            </span>
          </Tooltip>
        </div>

        <div className={styles.statsGrid}>
          <GlassPanel className={styles.metaCard} padding="sm">
            <p className={styles.metaLabel}>복습</p>
            <p className={styles.metaValue}>{summary.dueCount}</p>
          </GlassPanel>
          <GlassPanel className={styles.metaCard} padding="sm">
            <p className={styles.metaLabel}>신규</p>
            <p className={styles.metaValue}>{summary.newCount}</p>
          </GlassPanel>
          <GlassPanel className={styles.metaCard} padding="sm">
            <p className={styles.metaLabel}>학습 중</p>
            <p className={styles.metaValue}>{summary.learningCount}</p>
          </GlassPanel>
          <GlassPanel className={styles.metaCard} padding="sm">
            <p className={styles.metaLabel}>완료</p>
            <p className={styles.metaValue}>{summary.masteredCount}</p>
          </GlassPanel>
        </div>

        {error ? <p className="page-header__caption" style={{ color: 'var(--accent-coral)' }}>{error}</p> : null}
      </GlassPanel>
    </div>
  )
}
