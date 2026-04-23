import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { House, Send, Swords } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import {
  calculateBotSolveTimeSeconds,
  calculateQuestionScore,
  getBotSurrenderDelayMs,
  getGameLabel,
  getModeLabel,
  getQuestionTimeLimit,
  getQuizTypeLabel,
  normalizePronunciationInput,
  processMeaning,
  shouldBotSurrender,
} from '@/features/game/gameEngine'
import { TapMatchRushSessionView } from '@/features/game/TapMatchRushSessionView'
import { useGameStore } from '@/features/game/gameStore'
import styles from '@/features/game/game.module.css'

type FeedbackState = {
  questionId: string
  selectedAnswer: string | null
  isCorrect: boolean
  points: number
  correctAnswer: string
  timedOut: boolean
}

type ScoreBurstState = {
  id: string
  points: number
}

export function GameSessionPage() {
  const session = useGameStore((state) => state.session)

  if (session?.gameKind === 'tap_match_rush') {
    return <TapMatchRushSessionView />
  }

  return <SpeedQuizSessionView />
}

function SpeedQuizSessionView() {
  const navigate = useNavigate()
  const session = useGameStore((state) => state.session)
  const lastResult = useGameStore((state) => state.lastResult)
  const recordPlayerAnswer = useGameStore((state) => state.recordPlayerAnswer)
  const advanceBotTurn = useGameStore((state) => state.advanceBotTurn)
  const surrenderBot = useGameStore((state) => state.surrenderBot)
  const finalizeGame = useGameStore((state) => state.finalizeGame)
  const abandonGame = useGameStore((state) => state.abandonGame)
  const [countdown, setCountdown] = useState(3)
  const [timeLeftMs, setTimeLeftMs] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [inputValue, setInputValue] = useState('')
  const answerDelayRef = useRef<number | null>(null)
  const scoreBurstTimerRef = useRef<number | null>(null)
  const questionDeadlineRef = useRef<number | null>(null)
  const timerIntervalRef = useRef<number | null>(null)
  const [scoreBurst, setScoreBurst] = useState<ScoreBurstState | null>(null)

  const currentQuestion = useMemo(
    () => (session && session.gameKind === 'speed_quiz' && !session.playerFinished ? session.questions[session.currentIndex] ?? null : null),
    [session],
  )

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
    if (!session || session.gameKind !== 'speed_quiz') return
    setCountdown(3)
  }, [session?.startedAt, session?.gameKind])

  useEffect(() => {
    if (!session || session.gameKind !== 'speed_quiz' || countdown <= 0) return undefined

    const timeoutId = window.setTimeout(() => {
      setCountdown((value) => value - 1)
    }, 1000)

    return () => window.clearTimeout(timeoutId)
  }, [countdown, session])

  useEffect(() => {
    return () => {
      if (answerDelayRef.current) {
        window.clearTimeout(answerDelayRef.current)
      }

      if (scoreBurstTimerRef.current) {
        window.clearTimeout(scoreBurstTimerRef.current)
      }

      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current)
      }
    }
  }, [])

  const resolveCurrentQuestion = useEffectEvent((submission: { selectedAnswer: string | null; timedOut: boolean }) => {
    if (!session || session.gameKind !== 'speed_quiz' || !currentQuestion || feedback) return

    const timeLimitSeconds = getQuestionTimeLimit(currentQuestion)
    const timeLimitMs = timeLimitSeconds * 1000
    const timeTakenMs = submission.timedOut || questionDeadlineRef.current === null
      ? timeLimitMs
      : Math.max(0, timeLimitMs - Math.max(0, questionDeadlineRef.current - performance.now()))
    const timeTakenSeconds = Number((timeTakenMs / 1000).toFixed(2))
    const normalizedSelectedAnswer = currentQuestion.type === 'reading_quiz'
      ? normalizePronunciationInput(submission.selectedAnswer ?? '')
      : submission.selectedAnswer ?? ''
    const isCorrect = normalizedSelectedAnswer === currentQuestion.correctAnswer
    const points = isCorrect ? calculateQuestionScore(currentQuestion, timeTakenSeconds) : 0

    setFeedback({
      questionId: currentQuestion.id,
      selectedAnswer: submission.selectedAnswer,
      isCorrect,
      points,
      correctAnswer: currentQuestion.correctAnswer,
      timedOut: submission.timedOut,
    })

    if (isCorrect && points > 0) {
      setScoreBurst({
        id: `${currentQuestion.id}:${Date.now()}`,
        points,
      })

      if (scoreBurstTimerRef.current) {
        window.clearTimeout(scoreBurstTimerRef.current)
      }

      scoreBurstTimerRef.current = window.setTimeout(() => {
        setScoreBurst(null)
        scoreBurstTimerRef.current = null
      }, 900)
    } else {
      setScoreBurst(null)
    }

    if (answerDelayRef.current) {
      window.clearTimeout(answerDelayRef.current)
    }

    answerDelayRef.current = window.setTimeout(() => {
      recordPlayerAnswer({
        questionId: currentQuestion.id,
        isCorrect,
        timeTakenSeconds,
      })
      setFeedback(null)
      setInputValue('')
      answerDelayRef.current = null
    }, submission.timedOut ? 1400 : 900)
  })

  useEffect(() => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    if (!session || session.gameKind !== 'speed_quiz' || !currentQuestion || countdown > 0 || feedback || session.playerFinished) {
      if (countdown > 0) {
        setTimeLeftMs(0)
      }
      return undefined
    }

    const limitMs = getQuestionTimeLimit(currentQuestion) * 1000
    questionDeadlineRef.current = performance.now() + limitMs
    setTimeLeftMs(limitMs)

    timerIntervalRef.current = window.setInterval(() => {
      if (questionDeadlineRef.current === null) return

      const nextTimeLeft = Math.max(0, questionDeadlineRef.current - performance.now())
      setTimeLeftMs(nextTimeLeft)

      if (nextTimeLeft <= 0) {
        if (timerIntervalRef.current) {
          window.clearInterval(timerIntervalRef.current)
          timerIntervalRef.current = null
        }
        resolveCurrentQuestion({ selectedAnswer: null, timedOut: true })
      }
    }, 50)

    return () => {
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }
  }, [countdown, currentQuestion?.id, feedback, session?.playerFinished])

  useEffect(() => {
    if (!session || session.gameKind !== 'speed_quiz' || !session.bot || countdown > 0 || session.bot.finished || session.bot.surrendered) return undefined

    const botQuestion = session.questions[session.bot.currentIndex]
    if (!botQuestion) return undefined

    const solveTimeSeconds = calculateBotSolveTimeSeconds(session.bot.settings.baseTime)
    const timeoutId = window.setTimeout(() => {
      advanceBotTurn({ solveTimeSeconds })
    }, solveTimeSeconds * 1000)

    return () => window.clearTimeout(timeoutId)
  }, [advanceBotTurn, countdown, session])

  useEffect(() => {
    if (!session || session.gameKind !== 'speed_quiz' || !session.bot || countdown > 0 || !shouldBotSurrender(session)) return undefined

    const timeoutId = window.setTimeout(() => {
      surrenderBot()
    }, getBotSurrenderDelayMs())

    return () => window.clearTimeout(timeoutId)
  }, [countdown, session, surrenderBot])

  useEffect(() => {
    if (!session || session.gameKind !== 'speed_quiz' || countdown > 0) return

    if (session.playerFinished && (!session.bot || session.bot.finished || session.bot.surrendered)) {
      finalizeGame()
    }
  }, [countdown, finalizeGame, session])

  useEffect(() => {
    if (!session || session.gameKind !== 'speed_quiz' || !currentQuestion || currentQuestion.type !== 'reading_quiz' || countdown > 0 || feedback) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter') {
        event.preventDefault()
        resolveCurrentQuestion({ selectedAnswer: inputValue, timedOut: false })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [countdown, currentQuestion, feedback, inputValue, session])

  useEffect(() => {
    if (!session || session.gameKind !== 'speed_quiz' || !currentQuestion || currentQuestion.type === 'reading_quiz' || countdown > 0 || feedback) return

    const objectiveQuestion = currentQuestion

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }

      if (!/^[1-5]$/.test(event.key)) return

      const optionIndex = Number(event.key) - 1
      const selectedAnswer = objectiveQuestion.options[optionIndex]
      if (!selectedAnswer) return

      event.preventDefault()
      resolveCurrentQuestion({ selectedAnswer, timedOut: false })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [countdown, currentQuestion, feedback, session])

  if (!session || session.gameKind !== 'speed_quiz') return null

  const gameLabel = getGameLabel()
  const timerPercent = currentQuestion
    ? (timeLeftMs / (getQuestionTimeLimit(currentQuestion) * 1000)) * 100
    : 0
  const timerColor = timerPercent < 30 ? '#ff5f5f' : '#4CAF50'
  const playerProgress = session.totalQuestions > 0 ? ((session.playerFinished ? session.totalQuestions : session.currentIndex) / session.totalQuestions) * 100 : 0
  const botProgress = session.bot && session.totalQuestions > 0 ? (session.bot.currentIndex / session.totalQuestions) * 100 : 0
  const waitingForBot = session.playerFinished && session.bot && !session.bot.finished && !session.bot.surrendered

  const handleLeave = () => {
    const shouldLeave = window.confirm('현재 게임을 종료하고 메뉴로 돌아갈까요?')
    if (!shouldLeave) return

    abandonGame()
    navigate('/game')
  }

  return (
    <div className={`${styles.root} ${styles.sessionRoot}`}>
      <GlassPanel className={styles.hud} variant="floating">
        <div className={styles.hudTop}>
          <div>
            <p className="section-kicker">Speed Quiz</p>
            <h1 className="page-header__title">{gameLabel} · {session.setName}</h1>
            <div className={styles.hudStats}>
              <span className="miniChip">{gameLabel}</span>
              <span className="miniChip">{getModeLabel(session.mode)}</span>
              <span className="miniChip">{getQuizTypeLabel(session.quizType)}</span>
              <span className="miniChip">
                {session.playerFinished ? session.totalQuestions : session.currentIndex + 1}/{session.totalQuestions}
              </span>
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
              <span>{session.playerName}</span>
              <span>{session.score}점</span>
            </div>
            <div className={styles.trackBar}>
              <div className={styles.trackFill} style={{ width: `${Math.min(playerProgress, 100)}%` }} />
            </div>
          </div>

          {session.bot ? (
            <div className={styles.trackRow}>
              <div className={styles.trackLabels}>
                <span>{session.bot.settings.name}</span>
                <span>{session.bot.score}점</span>
              </div>
              <div className={styles.trackBar}>
                <div className={`${styles.trackFill} ${styles.trackFillBot}`} style={{ width: `${Math.min(botProgress, 100)}%` }} />
              </div>
            </div>
          ) : null}
        </div>

        {!waitingForBot && currentQuestion ? (
          <div className={styles.timerWrap}>
            <div className={styles.trackLabels}>
              <span>제한 시간 {getQuestionTimeLimit(currentQuestion)}초</span>
              <span>{(timeLeftMs / 1000).toFixed(1)}초 남음</span>
            </div>
            <div className={styles.timerBar}>
              <div className={styles.timerFill} style={{ width: `${Math.max(0, timerPercent)}%`, backgroundColor: timerColor }} />
            </div>
          </div>
        ) : null}
      </GlassPanel>

      <GlassPanel className={styles.sessionPanel} padding="lg" variant="strong">
        {countdown > 0 ? (
          <div className={styles.countdownBox}>
            <p className="section-kicker">{gameLabel}</p>
            <div className={styles.countdownNumber}>{countdown}</div>
            <p className={styles.softText}>{session.mode === 'bot' ? `${gameLabel} · ${session.bot?.settings.name}` : `${gameLabel} 시작`}</p>
          </div>
        ) : waitingForBot ? (
          <div className={styles.waitingBox}>
            <Swords size={36} />
            <h2 className="section-title">상대가 문제를 푸는 중입니다</h2>
            <p className={styles.softText}>상대가 남은 문제를 끝내거나 기권할 때까지 잠시만 기다려 주세요.</p>
          </div>
        ) : currentQuestion ? (
          <div className={styles.questionWrap}>
            <div className={styles.questionCard}>
              {scoreBurst ? (
                <div key={scoreBurst.id} className={styles.scoreBurst}>
                  +{scoreBurst.points}
                </div>
              ) : null}

              {currentQuestion.type === 'meaning_to_word' ? (
                <div className={styles.questionMeaning}>{processMeaning(currentQuestion.word.meaning)}</div>
              ) : (
                <div className={styles.questionJapanese}>{currentQuestion.word.japanese}</div>
              )}
              {currentQuestion.type === 'reading_quiz' ? (
                <div className={styles.questionReading}>읽기를 입력하세요</div>
              ) : currentQuestion.type === 'word_to_meaning' ? (
                <div className={styles.questionReading}>{currentQuestion.word.reading}</div>
              ) : null}
            </div>

            {currentQuestion.type === 'reading_quiz' ? (
              <div className={styles.inputShell}>
                <input
                  className={`glass-input ${styles.answerInput}`}
                  data-state={
                    feedback?.questionId === currentQuestion.id
                      ? feedback.isCorrect ? 'correct' : 'wrong'
                      : 'idle'
                  }
                  type="text"
                  placeholder="예: ashita"
                  value={inputValue}
                  disabled={feedback !== null}
                  onChange={(event) => setInputValue(event.target.value)}
                />
                <div className={styles.inputActions}>
                  <span className={styles.softText}>로마자 또는 가나 입력 모두 허용됩니다.</span>
                  <button
                    type="button"
                    className={styles.submitButton}
                    disabled={feedback !== null}
                    onClick={() => resolveCurrentQuestion({ selectedAnswer: inputValue, timedOut: false })}
                  >
                    <Send size={16} />
                    제출
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.optionGrid}>
                {currentQuestion.options.map((option, index) => {
                  let optionState: 'idle' | 'selected' | 'correct' | 'wrong' = 'idle'
                  if (feedback?.questionId === currentQuestion.id) {
                    if (feedback.isCorrect && feedback.selectedAnswer === option) {
                      optionState = 'correct'
                    } else if (!feedback.isCorrect && feedback.selectedAnswer === option) {
                      optionState = 'wrong'
                    } else if (option === feedback.correctAnswer) {
                      optionState = 'correct'
                    }
                  }

                  return (
                    <button
                      key={`${currentQuestion.id}-${option}`}
                      type="button"
                      className={styles.optionButton}
                      data-state={optionState}
                      disabled={feedback !== null}
                      onClick={() => resolveCurrentQuestion({ selectedAnswer: option, timedOut: false })}
                    >
                      <span className={styles.optionIndex}>{index + 1}</span>
                      <span>{option}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.waitingBox}>
            <p className="section-kicker">Finishing</p>
            <h2 className="section-title">결과를 정리하고 있습니다</h2>
          </div>
        )}
      </GlassPanel>
    </div>
  )
}
