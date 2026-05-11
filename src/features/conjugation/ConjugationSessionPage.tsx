import { ArrowRight, ChevronLeft, SendHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import styles from '@/features/conjugation/conjugation.module.css'
import { useConjugationStore } from '@/features/conjugation/conjugationStore'

export function ConjugationSessionPage() {
  const navigate = useNavigate()
  const answerInputRef = useRef<HTMLInputElement>(null)
  const status = useConjugationStore((state) => state.status)
  const session = useConjugationStore((state) => state.session)
  const submitAnswer = useConjugationStore((state) => state.submitAnswer)
  const saveDraftAnswer = useConjugationStore((state) => state.saveDraftAnswer)
  const advanceAfterReveal = useConjugationStore((state) => state.advanceAfterReveal)
  const [answer, setAnswer] = useState('')

  useEffect(() => {
    if (!session && status === 'idle') {
      navigate('/conjugation', { replace: true })
    }
  }, [navigate, session, status])

  useEffect(() => {
    if (status === 'complete') {
      navigate('/conjugation/result', { replace: true })
    }
  }, [navigate, status])

  useEffect(() => {
    setAnswer(session?.draftAnswer ?? '')
  }, [session?.currentIndex, session?.draftAnswer])

  const currentQuestion = session?.questions[session.currentIndex]
  const currentAttempt = session?.attempts[session.currentIndex] ?? null
  const isRevealed = Boolean(session?.isAnswerRevealed && currentAttempt)
  const isLastQuestion = session ? session.currentIndex === session.questions.length - 1 : false

  useEffect(() => {
    if (!currentQuestion || isRevealed) return

    const input = answerInputRef.current
    if (!input) return

    let timeoutId = 0
    const frameId = window.requestAnimationFrame(() => {
      input.focus({ preventScroll: true })
      input.select()
      input.scrollIntoView({ block: 'center', behavior: 'smooth' })

      timeoutId = window.setTimeout(() => {
        input.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, 160)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [currentQuestion?.id, isRevealed])

  useEffect(() => {
    if (!isRevealed) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key !== 'Enter') return

      const target = event.target
      if (target instanceof HTMLElement && target.tagName === 'TEXTAREA') return

      event.preventDefault()
      const outcome = advanceAfterReveal()
      if (outcome === 'completed') {
        navigate('/conjugation/result', { replace: true })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [advanceAfterReveal, isRevealed, navigate])

  function handleSubmit() {
    if (isRevealed) {
      const outcome = advanceAfterReveal()
      if (outcome === 'completed') {
        navigate('/conjugation/result', { replace: true })
      }
      return
    }

    submitAnswer(answer)
  }

  if (!session || !currentQuestion) return null

  return (
    <div className={styles.root}>
      <div className="page-header">
        <div className="page-header__left">
          <Tooltip label="설정으로 이동">
            <span>
              <IconButton icon={ChevronLeft} label="설정으로 이동" onClick={() => navigate('/conjugation')} />
            </span>
          </Tooltip>
          <div className="page-header__meta">
            <p className="page-header__caption">Conjugation Session</p>
            <h1 className="page-header__title">{session.setName}</h1>
          </div>
        </div>
      </div>

      <GlassPanel className={styles.sessionCard} padding="lg" variant="strong">
        <div className={styles.sessionMeta}>
          <div>
            <p className="section-kicker">Question</p>
            <h2 className="page-header__title">
              문제 {session.currentIndex + 1} / {session.questions.length}
            </h2>
          </div>
        </div>

        <div className={styles.promptCard}>
          <div className={styles.promptHeader}>
            <p className={styles.promptLabel}>기본형</p>
            <p className={styles.promptLabel}>읽기와 뜻을 함께 보고 활용형을 만드세요.</p>
          </div>
          <p className={styles.promptText}>{currentQuestion.dictionaryForm}</p>
          <p className={styles.promptSupport}>{currentQuestion.reading}</p>
          <p className={styles.promptSupport}>{currentQuestion.meaning}</p>
        </div>

        <form
          className={styles.inputStack}
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
        >
          <div className={styles.answerShell}>
            <div className={styles.targetBanner}>
              <div>
                <p className={styles.targetLabel}>만들 활용형</p>
                <h3 className={styles.targetText}>{currentQuestion.formLabel}으로 바꾸기</h3>
              </div>
              <span className={styles.targetChip}>{currentQuestion.formLabel}</span>
            </div>

            <label className={styles.answerLabel} htmlFor="conjugation-answer-input">
              정답 입력
            </label>
            <input
              ref={answerInputRef}
              id="conjugation-answer-input"
              className={`glass-input ${styles.answerInput}`}
              type="text"
              value={isRevealed ? currentAttempt!.userAnswer : answer}
              onChange={(event) => {
                const nextAnswer = event.target.value
                setAnswer(nextAnswer)
                saveDraftAnswer(nextAnswer)
              }}
              placeholder={`${currentQuestion.formLabel}을 입력하세요`}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              disabled={isRevealed}
            />

            {!isRevealed ? (
              <div className={styles.submitRow}>
                <button type="submit" className={styles.submitButton}>
                  <SendHorizontal size={18} />
                  <span>채점하기</span>
                </button>
              </div>
            ) : currentAttempt ? (
              <div className={styles.feedbackPanel} data-tone={currentAttempt.isCorrect ? 'correct' : 'wrong'}>
                <h3 className={styles.feedbackTitle}>{currentAttempt.isCorrect ? '정답입니다' : '오답입니다'}</h3>

                {!currentAttempt.isCorrect ? (
                  <>
                    <div className={styles.answerBlock}>
                      <span className="form-label">내 답안</span>
                      <p className={styles.answerPrimary}>{currentAttempt.userAnswer || '(빈 답안)'}</p>
                    </div>
                    <div className={styles.answerBlock}>
                      <span className="form-label">정답</span>
                      <p className={styles.answerPrimary}>{currentAttempt.canonicalAnswer}</p>
                      {currentQuestion.readingAnswer ? <p className={styles.answerSecondary}>{currentQuestion.readingAnswer}</p> : null}
                    </div>
                  </>
                ) : (
                  <div className={styles.answerBlock}>
                    <span className="form-label">정답</span>
                    <p className={styles.answerPrimary}>{currentAttempt.matchedAnswer ?? currentAttempt.canonicalAnswer}</p>
                  </div>
                )}

                <p className={styles.explanation}>{currentAttempt.explanation}</p>

                <div className={styles.feedbackActions}>
                  <button type="submit" className={styles.continueButton} aria-keyshortcuts="Enter">
                    <ArrowRight size={18} />
                    <span>{isLastQuestion ? '결과 보기' : '다음 문제'}</span>
                    <span className={styles.keycap}>Enter</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </form>
      </GlassPanel>
    </div>
  )
}
