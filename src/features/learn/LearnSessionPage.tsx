import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform } from 'motion/react'
import { BadgeCheck, ChevronLeft, CircleHelp, FlipHorizontal, Heart, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { ProgressRing } from '@/components/ProgressRing'
import { Tooltip } from '@/components/Tooltip'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { useLearnSessionStore } from '@/features/session/learnSessionStore'
import { getStudyItemById } from '@/features/vocab/model/selectors'
import type { FrontMode, StudyItem } from '@/features/vocab/model/types'
import styles from '@/features/learn/learn.module.css'

const SWIPE_TRIGGER_PX = 96
const SWIPE_VISUAL_LIMIT_PX = 132
const CARD_EXIT_MS = 220

type CardDecision = 'known' | 'unknown'
type LeavingCard = {
  id: string
  item: StudyItem
  frontMode: FrontMode
  flipped: boolean
  action: CardDecision
}

export function LearnSessionPage() {
  const navigate = useNavigate()
  const { status, record, previousSnapshot, markKnown, markUnknown, undo, abandonSession, discardSession } = useLearnSessionStore()
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite)
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds)
  const learnCardFontScale = usePreferencesStore((state) => state.learnCardFontScale)
  const setLearnCardFontScale = usePreferencesStore((state) => state.setLearnCardFontScale)
  const [flipped, setFlipped] = useState(false)
  const [leavingCard, setLeavingCard] = useState<LeavingCard | null>(null)
  const [transitionAction, setTransitionAction] = useState<CardDecision | null>(null)
  const exitTimerRef = useRef<number | null>(null)
  const pendingAdvanceRef = useRef<CardDecision | null>(null)
  const dragX = useMotionValue(0)
  const dragRotate = useTransform(dragX, [-SWIPE_VISUAL_LIMIT_PX, SWIPE_VISUAL_LIMIT_PX], [-9, 9])

  const item = useMemo(() => (record?.currentCardId ? getStudyItemById(record.currentCardId) ?? null : null), [record?.currentCardId])
  const cardFontScaleStyle = useMemo(() => {
    const presets = {
      1: {
        jp: 'clamp(1.8rem, 4.4vw, 2.7rem)',
        reading: 'clamp(1.02rem, 2.5vw, 1.35rem)',
        meaning: 'clamp(1.15rem, 2.7vw, 1.6rem)',
      },
      2: {
        jp: 'clamp(2rem, 5vw, 3rem)',
        reading: 'clamp(1.15rem, 2.9vw, 1.5rem)',
        meaning: 'clamp(1.3rem, 3vw, 1.8rem)',
      },
      3: {
        jp: 'clamp(2.2rem, 5.4vw, 3.3rem)',
        reading: 'clamp(1.28rem, 3.1vw, 1.7rem)',
        meaning: 'clamp(1.45rem, 3.2vw, 2rem)',
      },
      4: {
        jp: 'clamp(2.45rem, 5.8vw, 3.6rem)',
        reading: 'clamp(1.42rem, 3.4vw, 1.9rem)',
        meaning: 'clamp(1.6rem, 3.5vw, 2.2rem)',
      },
    } as const
    const preset = presets[learnCardFontScale as keyof typeof presets] ?? presets[2]
    return {
      ['--learn-jp-size' as string]: preset.jp,
      ['--learn-reading-size' as string]: preset.reading,
      ['--learn-meaning-size' as string]: preset.meaning,
    }
  }, [learnCardFontScale])

  useEffect(() => {
    setFlipped(false)
    dragX.set(0)
  }, [dragX, record?.currentCardId])

  useEffect(() => {
    if (status === 'idle' || (!record && status !== 'complete')) {
      navigate('/learn', { replace: true })
    }
  }, [navigate, record, status])

  useEffect(() => {
    if (status === 'active' && record && !item) {
      discardSession()
      navigate('/learn', { replace: true })
    }
  }, [discardSession, item, navigate, record, status])

  useEffect(() => {
    if (status === 'complete') {
      navigate('/learn/result', { replace: true })
    }
  }, [navigate, status])

  const commitAdvance = useCallback((action: CardDecision) => {
    if (action === 'known') {
      markKnown()
    } else {
      markUnknown()
    }
  }, [markKnown, markUnknown])

  const flushPendingAdvance = useCallback((resetVisualState = true) => {
    const pendingAction = pendingAdvanceRef.current
    if (!pendingAction) return

    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }

    pendingAdvanceRef.current = null
    commitAdvance(pendingAction)

    if (resetVisualState) {
      setLeavingCard(null)
      setTransitionAction(null)
    }
  }, [commitAdvance])

  useEffect(() => () => flushPendingAdvance(false), [flushPendingAdvance])

  useEffect(() => {
    function handlePageHide() {
      flushPendingAdvance()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushPendingAdvance()
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [flushPendingAdvance])

  function requestAdvance(action: CardDecision) {
    if (!record?.currentCardId || !item || transitionAction) return

    dragX.set(0)
    pendingAdvanceRef.current = action
    setTransitionAction(action)
    setLeavingCard({
      id: record.currentCardId,
      item,
      frontMode: record.frontMode,
      flipped,
      action,
    })

    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current)
    }

    exitTimerRef.current = window.setTimeout(() => {
      pendingAdvanceRef.current = null
      commitAdvance(action)
      setLeavingCard(null)
      setTransitionAction(null)
      exitTimerRef.current = null
    }, CARD_EXIT_MS)
  }

  useEffect(() => {
    if (status !== 'active' || !record?.currentCardId) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        requestAdvance('known')
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        requestAdvance('unknown')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [record?.currentCardId, status, transitionAction])

  if (!record || !item) return null

  const isWordCard = item.kind === 'word'
  const isFavorite = item.kind === 'word' && favoriteIds.includes(item.word.id)
  const revealAnswer = () => setFlipped((value) => !value)
  const isTransitioning = transitionAction !== null

  function renderComparisonSurface(cardItem: Extract<StudyItem, { kind: 'comparison' }>, mode: 'japanese' | 'meaning') {
    const leftPrimary = mode === 'japanese' ? cardItem.leftWord.japanese : cardItem.leftWord.meaning
    const leftSecondary = mode === 'japanese' ? cardItem.leftWord.reading : null
    const rightPrimary = mode === 'japanese' ? cardItem.rightWord.japanese : cardItem.rightWord.meaning
    const rightSecondary = mode === 'japanese' ? cardItem.rightWord.reading : null

    return (
      <div className={styles.compareFace}>
        <div className={styles.comparePairGrid}>
          <div className={styles.compareWordColumn}>
            <strong className={mode === 'japanese' ? styles.flashJapanese : styles.flashMeaning}>{leftPrimary}</strong>
            {leftSecondary ? <span className={styles.flashReading}>{leftSecondary}</span> : null}
            {cardItem.pair.leftDescription ? <p className={styles.compareDescriptionText}>{cardItem.pair.leftDescription}</p> : null}
          </div>
          <div className={styles.compareWordColumn}>
            <strong className={mode === 'japanese' ? styles.flashJapanese : styles.flashMeaning}>{rightPrimary}</strong>
            {rightSecondary ? <span className={styles.flashReading}>{rightSecondary}</span> : null}
            {cardItem.pair.rightDescription ? <p className={styles.compareDescriptionText}>{cardItem.pair.rightDescription}</p> : null}
          </div>
        </div>
      </div>
    )
  }

  function renderCardFaces(cardItem: StudyItem, frontMode: FrontMode) {
    return (
      <>
        <div className={`${styles.flashFace} ${styles.flashFront}`}>
          {cardItem.kind === 'word'
            ? frontMode === 'japanese'
              ? (
                  <>
                    <div className={styles.flashJapanese}>{cardItem.word.japanese}</div>
                    <div className={styles.flashReading}>{cardItem.word.reading}</div>
                  </>
                )
              : <div className={styles.flashMeaning}>{cardItem.word.meaning}</div>
            : renderComparisonSurface(cardItem, frontMode)}
        </div>
        <div className={`${styles.flashFace} ${styles.flashBack}`}>
          {cardItem.kind === 'word'
            ? frontMode === 'japanese'
              ? <div className={styles.flashMeaning}>{cardItem.word.meaning}</div>
              : (
                  <>
                    <div className={styles.flashJapanese}>{cardItem.word.japanese}</div>
                    <div className={styles.flashReading}>{cardItem.word.reading}</div>
                  </>
                )
            : renderComparisonSurface(cardItem, frontMode === 'japanese' ? 'meaning' : 'japanese')}
        </div>
      </>
    )
  }

  return (
    <div className={styles.root}>
      <GlassPanel className={styles.hud} variant="floating">
        <div className={styles.hudMeta}>
          <p className="section-kicker">Learning</p>
          <h1 className="page-header__title">{record.setName}</h1>
          <div className={styles.hudChips}>
            <span className="miniChip">라운드 {record.round}</span>
            <span className="miniChip">카드 {record.currentIndex + 1}/{record.activeQueue.length}</span>
            <span className="miniChip">총 {record.totalTargetCount}</span>
          </div>
        </div>
        <ProgressRing value={record.knownIds.length} total={record.totalTargetCount} />
      </GlassPanel>

      <GlassPanel className={styles.card} padding="lg" variant="strong">
        <div className={styles.cardShell}>
          <div className={styles.cardStage}>
            <button
              type="button"
              className={`${styles.edgeAction} ${styles.edgeActionKnown}`}
              data-feedback={transitionAction === 'known' ? 'active' : 'idle'}
              aria-label="왼쪽으로 넘기기 (앎)"
              onClick={() => requestAdvance('known')}
              disabled={isTransitioning}
            >
              <BadgeCheck size={22} strokeWidth={2} />
              <span>앎</span>
            </button>

            <div className={styles.cardViewport} style={cardFontScaleStyle}>
              {!isTransitioning ? (
                <motion.button
                  key={record.currentCardId}
                  className={styles.flashCard}
                  data-flipped={flipped}
                  data-result="idle"
                  type="button"
                  aria-label="학습 카드"
                  dragListener
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.16}
                  style={{ x: dragX, rotate: dragRotate }}
                  initial={{ opacity: 0, y: 22, scale: 0.96, filter: 'blur(8px)' }}
                  animate={{ x: 0, rotate: 0, y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  transition={{
                    duration: 0.24,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  whileDrag={{ scale: 1.01 }}
                  onClick={revealAnswer}
                  onDragEnd={(_, info) => {
                    dragX.set(0)

                    if (info.offset.x <= -SWIPE_TRIGGER_PX) {
                      requestAdvance('known')
                      return
                    }

                    if (info.offset.x >= SWIPE_TRIGGER_PX) {
                      requestAdvance('unknown')
                    }
                  }}
                >
                  <motion.div
                    className={styles.flashInner}
                    animate={{ rotateY: flipped ? 180 : 0 }}
                    transition={{ duration: 0.42, ease: 'easeInOut' }}
                  >
                    {renderCardFaces(item, record.frontMode)}
                  </motion.div>
                </motion.button>
              ) : null}

              {leavingCard ? (
                <motion.div
                  key={`${leavingCard.id}-${leavingCard.action}`}
                  className={`${styles.flashCard} ${styles.leavingCard}`}
                  data-flipped={leavingCard.flipped}
                  data-result={leavingCard.action}
                  aria-hidden="true"
                  initial={{ x: 0, rotate: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  animate={
                    leavingCard.action === 'known'
                      ? {
                          x: -184,
                          rotate: -14,
                          opacity: 0,
                          scale: 0.92,
                          filter: 'blur(8px)',
                        }
                      : {
                          x: 184,
                          rotate: 14,
                          opacity: 0,
                          scale: 0.92,
                          filter: 'blur(8px)',
                        }
                  }
                  transition={{
                    duration: CARD_EXIT_MS / 1000,
                    ease: [0.32, 0.72, 0, 1],
                  }}
                >
                  <motion.div
                    className={styles.flashInner}
                    animate={{ rotateY: leavingCard.flipped ? 180 : 0 }}
                    transition={{ duration: 0 }}
                  >
                    {renderCardFaces(leavingCard.item, leavingCard.frontMode)}
                  </motion.div>
                </motion.div>
              ) : null}
            </div>

            <button
              type="button"
              className={`${styles.edgeAction} ${styles.edgeActionUnknown}`}
              data-feedback={transitionAction === 'unknown' ? 'active' : 'idle'}
              aria-label="오른쪽으로 넘기기 (모름)"
              onClick={() => requestAdvance('unknown')}
              disabled={isTransitioning}
            >
              <CircleHelp size={22} strokeWidth={2} />
              <span>모름</span>
            </button>
          </div>

          <div className={styles.controls}>
            <div className={styles.fontScaleGroup} role="group" aria-label="카드 글자 크기">
              <Tooltip label="글자 작게">
                <span>
                  <IconButton
                    icon={ZoomOut}
                    label="글자 작게"
                    onClick={() => setLearnCardFontScale(learnCardFontScale - 1)}
                    disabled={isTransitioning || learnCardFontScale <= 1}
                  />
                </span>
              </Tooltip>
              <span className={styles.fontScaleLabel}>{learnCardFontScale}/4</span>
              <Tooltip label="글자 크게">
                <span>
                  <IconButton
                    icon={ZoomIn}
                    label="글자 크게"
                    onClick={() => setLearnCardFontScale(learnCardFontScale + 1)}
                    disabled={isTransitioning || learnCardFontScale >= 4}
                  />
                </span>
              </Tooltip>
            </div>
            <div className={styles.controlsDivider} aria-hidden="true" />
            <Tooltip label="이전 카드">
              <span>
                <IconButton icon={ChevronLeft} label="이전 카드" onClick={() => undo()} disabled={!previousSnapshot || isTransitioning} />
              </span>
            </Tooltip>
            {isWordCard ? (
              <Tooltip label="즐겨찾기">
                <span>
                  <IconButton icon={Heart} label="즐겨찾기" active={isFavorite} onClick={() => toggleFavorite(item.word.id)} disabled={isTransitioning} />
                </span>
              </Tooltip>
            ) : null}
            <Tooltip label="정답 확인">
              <span>
                <IconButton icon={FlipHorizontal} label="정답 확인" onClick={revealAnswer} disabled={isTransitioning} />
              </span>
            </Tooltip>
            <Tooltip label="세션 종료">
              <span>
                <IconButton
                  icon={X}
                  label="세션 종료"
                  disabled={isTransitioning}
                  onClick={() => {
                    abandonSession()
                    navigate('/learn')
                  }}
                />
              </span>
            </Tooltip>
          </div>
        </div>
      </GlassPanel>
    </div>
  )
}
