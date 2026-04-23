import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { House } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import { getGameLabel } from '@/features/game/gameEngine'
import { useGameStore } from '@/features/game/gameStore'
import styles from '@/features/game/game.module.css'

type FeedbackState = {
  cardIds: [string, string]
}

function getMatchBoardColumnCount(cardCount: number) {
  if (cardCount <= 8) return 4
  if (cardCount <= 16) return 4
  return 5
}

export function TapMatchRushSessionView() {
  const navigate = useNavigate()
  const session = useGameStore((state) => state.session)
  const lastResult = useGameStore((state) => state.lastResult)
  const selectTapMatchCard = useGameStore((state) => state.selectTapMatchCard)
  const finalizeGame = useGameStore((state) => state.finalizeGame)
  const abandonGame = useGameStore((state) => state.abandonGame)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const feedbackTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!session && !lastResult) {
      navigate('/game', { replace: true })
    }
  }, [lastResult, navigate, session])

  useEffect(() => {
    if (lastResult) {
      navigate('/game/result', { replace: true })
    }
  }, [lastResult, navigate])

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        window.clearTimeout(feedbackTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!session || session.gameKind !== 'tap_match_rush' || session.playerFinished) return undefined

    const updateElapsedMs = () => {
      const startedAt = new Date(session.startedAt).getTime()
      setElapsedMs(Math.max(0, Date.now() - startedAt))
    }

    updateElapsedMs()
    const intervalId = window.setInterval(updateElapsedMs, 50)
    return () => window.clearInterval(intervalId)
  }, [session])

  useEffect(() => {
    if (!session || session.gameKind !== 'tap_match_rush' || !session.playerFinished) return

    const timeoutId = window.setTimeout(() => {
      finalizeGame()
    }, 180)

    return () => window.clearTimeout(timeoutId)
  }, [finalizeGame, session])

  const handleLeave = () => {
    const shouldLeave = window.confirm('현재 게임을 종료하고 메뉴로 돌아갈까요?')
    if (!shouldLeave) return

    abandonGame()
    navigate('/game')
  }

  const handleCardSelect = (cardId: string) => {
    if (!session || session.gameKind !== 'tap_match_rush' || feedback) return

    const resolution = selectTapMatchCard(cardId)
    if (!resolution) return

    if (resolution.kind === 'wrong') {
      setFeedback({ cardIds: resolution.cardIds })

      if (feedbackTimeoutRef.current) {
        window.clearTimeout(feedbackTimeoutRef.current)
      }

      feedbackTimeoutRef.current = window.setTimeout(() => {
        setFeedback(null)
        feedbackTimeoutRef.current = null
      }, 320)
      return
    }

    setFeedback(null)
  }

  const activeSession = session?.gameKind === 'tap_match_rush' ? session : null
  const boardCards = useMemo(
    () => activeSession?.cards ?? [],
    [activeSession],
  )
  const boardColumns = getMatchBoardColumnCount(boardCards.length)
  const boardRows = Math.max(1, Math.ceil(boardCards.length / boardColumns))
  const boardStyle = {
    ['--match-columns' as string]: String(boardColumns),
    ['--match-rows' as string]: String(boardRows),
  } as CSSProperties

  if (!activeSession) return null

  const gameLabel = getGameLabel(activeSession.gameKind)
  const remainingPairs = Math.max(0, activeSession.totalPairs - activeSession.matchedPairIds.length)
  const completionRate = activeSession.totalPairs > 0
    ? (activeSession.matchedPairIds.length / activeSession.totalPairs) * 100
    : 0
  const totalTime = (elapsedMs / 1000) + activeSession.penaltySeconds

  return (
    <div className={`${styles.root} ${styles.sessionRoot}`}>
      <GlassPanel className={styles.hud} variant="floating">
        <div className={styles.hudTop}>
          <div>
            <p className="section-kicker">Tap Match Rush</p>
            <h1 className="page-header__title">{gameLabel} · {activeSession.setName}</h1>
            <div className={styles.hudStats}>
              <span className="miniChip">{remainingPairs}쌍</span>
              <span className="miniChip">+{activeSession.penaltySeconds}s</span>
              <span className="miniChip">{activeSession.wrongAttempts} miss</span>
            </div>
          </div>

          <div className="action-row">
            <Tooltip label="메뉴로 나가기">
              <span>
                <IconButton icon={House} label="메뉴로 나가기" onClick={handleLeave} />
              </span>
            </Tooltip>
          </div>
        </div>

        <div className={styles.track}>
          <div className={styles.trackRow}>
            <div className={styles.trackLabels}>
              <span>{activeSession.playerName}</span>
              <span>{activeSession.matchedPairIds.length}/{activeSession.totalPairs}</span>
            </div>
            <div className={styles.trackBar}>
              <div className={styles.trackFill} style={{ width: `${Math.min(completionRate, 100)}%` }} />
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className={styles.sessionPanel} padding="lg" variant="strong">
        <div className={styles.matchRushWrap}>
          <div className={styles.matchRushHero}>
            <GlassPanel className="meta-card" padding="sm">
              <span className="form-label">시간</span>
              <strong>{totalTime.toFixed(2)}초</strong>
            </GlassPanel>
            <GlassPanel className="meta-card" padding="sm">
              <span className="form-label">남은 짝</span>
              <strong>{remainingPairs}</strong>
            </GlassPanel>
            <GlassPanel className="meta-card" padding="sm">
              <span className="form-label">패널티</span>
              <strong>+{activeSession.penaltySeconds}s</strong>
            </GlassPanel>
          </div>

          <div className={styles.matchBoard} style={boardStyle}>
            {boardCards.map((card) => {
              const isMatched = activeSession.matchedPairIds.includes(card.pairId)
              const isSelected = activeSession.selectedCardId === card.id
              const isWrong = feedback?.cardIds.includes(card.id) ?? false
              const state = isMatched ? 'matched' : isWrong ? 'wrong' : isSelected ? 'selected' : 'idle'

              return (
                <button
                  key={card.id}
                  type="button"
                  className={styles.matchCard}
                  data-state={state}
                  disabled={isMatched}
                  onClick={() => handleCardSelect(card.id)}
                >
                  <strong className={card.lane === 'prompt' ? styles.matchPrimaryJapanese : styles.matchPrimaryMeaning}>
                    {card.primaryText}
                  </strong>
                </button>
              )
            })}
          </div>
        </div>
      </GlassPanel>
    </div>
  )
}
