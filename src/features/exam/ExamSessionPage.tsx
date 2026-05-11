import { useEffect, useState } from 'react'
import { ChevronLeft, Keyboard, PenTool, SendHorizontal, Undo2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import styles from '@/features/exam/exam.module.css'
import { useExamStore } from '@/features/exam/examStore'
import { EXAM_MANUAL_UNDO_LIMIT } from '@/features/exam/examTypes'
import { HandwritingPad } from '@/features/handwriting/HandwritingPad'
import { getStudyItemAnswerSubtext, getStudyItemAnswerText, getStudyItemById, getStudyItemQuestionText } from '@/features/vocab/model/selectors'

export function ExamSessionPage() {
  const navigate = useNavigate()
  const { status, session, submitAnswer, revealManualAnswer, markManualGrade, goToPreviousManualQuestion, saveDraftAnswer } = useExamStore()
  const [answer, setAnswer] = useState('')
  const [isHandwritingMode, setIsHandwritingMode] = useState(false)

  useEffect(() => {
    if (!session && status === 'idle') {
      navigate('/exam', { replace: true })
    }
  }, [navigate, session, status])

  const currentWordId = session?.questionIds[session.currentIndex]
  const currentItem = currentWordId ? getStudyItemById(currentWordId) : null

  useEffect(() => {
    if (session && !currentItem) {
      navigate('/exam', { replace: true })
    }
  }, [currentItem, navigate, session])

  useEffect(() => {
    if (status === 'complete') {
      navigate('/exam/result', { replace: true })
    }
  }, [navigate, status])

  useEffect(() => {
    if (!session) return
    if (session.gradingMode === 'manual') {
      setAnswer('')
      setIsHandwritingMode(false)
      return
    }

    setAnswer(session.userAnswers[session.currentIndex] ?? '')
  }, [session])

  if (!session) return null
  if (!currentItem) return null

  const isManualMode = session.gradingMode === 'manual'
  const isLastQuestion = session.currentIndex === session.questionIds.length - 1
  const submitLabel = isLastQuestion ? '제출 및 채점' : '다음'
  const canGoPreviousManualQuestion = isManualMode
    && session.manualUndoHistory.length > 0
    && session.manualUndoUsedCount < EXAM_MANUAL_UNDO_LIMIT

  const questionText = getStudyItemQuestionText(currentItem)
  const answerText = getStudyItemAnswerText(currentItem)
  const answerSubtext = getStudyItemAnswerSubtext(currentItem)
  const isComparisonItem = currentItem.kind === 'comparison'

  function handleSubmit() {
    const trimmedAnswer = answer.trim()
    if (!trimmedAnswer && !window.confirm('답을 비운 채로 제출할까요? 빈칸으로 제출하면 오답으로 기록됩니다.')) {
      return
    }

    const outcome = submitAnswer(trimmedAnswer)
    if (outcome === 'revealed') {
      setIsHandwritingMode(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className="page-header">
        <div className="page-header__left">
          <Tooltip label="시험 선택으로 이동">
            <span>
              <IconButton icon={ChevronLeft} label="시험 선택으로 이동" onClick={() => navigate('/exam')} />
            </span>
          </Tooltip>
          <div className="page-header__meta">
            <p className="page-header__caption">Exam Session</p>
            <h1 className="page-header__title">{session.setName}</h1>
          </div>
        </div>
      </div>

      <GlassPanel className={styles.sessionCard} padding="lg" variant="strong">
        <div className={styles.sessionMeta}>
          <div>
            <p className="section-kicker">Question</p>
            <h2 className="page-header__title">
              문제 {session.currentIndex + 1} / {session.questionIds.length}
            </h2>
          </div>
          <div className={styles.selectionMeta}>
            <span className="miniChip">{isManualMode ? '직접 채점' : '자동 채점'}</span>
            {!isManualMode ? <span className="miniChip">{isHandwritingMode ? '손글씨 입력' : '키보드 입력'}</span> : null}
            {isManualMode ? (
              <Tooltip label="이전 문제로">
                <span>
                  <IconButton
                    icon={Undo2}
                    label="이전 문제로"
                    onClick={() => goToPreviousManualQuestion()}
                    disabled={!canGoPreviousManualQuestion}
                  />
                </span>
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div className={styles.questionCard}>
          <p className={styles.questionLabel}>
            {isComparisonItem
              ? '두 표현을 같이 보고 구분해 보세요.'
              : isManualMode
                ? '뜻을 보고 정답을 떠올린 뒤 직접 체크하세요.'
                : '뜻을 보고 일본어 정답을 입력하세요.'}
          </p>
          <p className={styles.questionText}>{questionText}</p>
        </div>

        {isManualMode ? (
          <div className={styles.inputStack}>
            {session.isAnswerRevealed ? (
              <div className={styles.manualPanel}>
                <div className={styles.manualAnswer}>
                  <span className="form-label">정답</span>
                  <strong>{answerText}</strong>
                  <span className="page-header__caption">{answerSubtext}</span>
                </div>

                <div className={styles.manualButtonRow}>
                  <button type="button" className={styles.manualButton} data-tone="correct" onClick={() => markManualGrade(true)}>
                    맞음
                  </button>
                  <button type="button" className={styles.manualButton} data-tone="wrong" onClick={() => markManualGrade(false)}>
                    틀림
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.submitRow}>
                <button type="button" className={styles.submitButton} onClick={() => revealManualAnswer()}>
                  <SendHorizontal size={18} />
                  <span>정답 확인</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <form
            className={styles.inputStack}
            onSubmit={(event) => {
              event.preventDefault()
              handleSubmit()
            }}
          >
            <div className={styles.inputMethodRow}>
              <button
                type="button"
                className="pill"
                data-active={!isHandwritingMode}
                onClick={() => setIsHandwritingMode(false)}
              >
                <Keyboard size={16} />
                <span>키보드 입력</span>
              </button>
              <button
                type="button"
                className="pill"
                data-active={isHandwritingMode}
                onClick={() => setIsHandwritingMode((value) => !value)}
              >
                <PenTool size={16} />
                <span>{isHandwritingMode ? '손글씨 입력 닫기' : '손글씨 입력 열기'}</span>
              </button>
            </div>

            <input
              className={`glass-input ${styles.answerInput}`}
              type="text"
              value={answer}
              onChange={(event) => {
                const nextAnswer = event.target.value
                setAnswer(nextAnswer)
                saveDraftAnswer(nextAnswer)
              }}
              placeholder={isHandwritingMode ? '손글씨 후보를 선택해 입력하세요.' : '일본어 정답 입력'}
              disabled={isHandwritingMode}
              autoComplete="off"
            />

            {isHandwritingMode ? (
              <HandwritingPad
                onSelectCandidate={(candidate) => {
                  setAnswer(candidate)
                  saveDraftAnswer(candidate)
                }}
              />
            ) : null}

            <div className={styles.submitRow}>
              <button type="submit" className={styles.submitButton}>
                <SendHorizontal size={18} />
                <span>{submitLabel}</span>
              </button>
            </div>
          </form>
        )}
      </GlassPanel>
    </div>
  )
}
