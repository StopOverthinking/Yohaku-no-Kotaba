import { useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BadgeCheck, ChevronLeft, CircleHelp, Heart, Lightbulb, X, ZoomIn, ZoomOut } from 'lucide-react'
import { IconButton } from '@/components/IconButton'
import { GlassPanel } from '@/components/GlassPanel'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { contextSenseMap, contextWordMap } from './contextContent'
import { useContextStore } from './contextStore'
import styles from './context.module.css'

export function ContextSessionPage() {
  const navigate = useNavigate()
  const { data, error, lastResult, answer, reveal, toggleHint, undo } = useContextStore()
  const session = data.session
  const fontScale = usePreferencesStore((s) => s.learnCardFontScale)
  const setFontScale = usePreferencesStore((s) => s.setLearnCardFontScale)
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds)
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite)
  const pointer = useRef<{ x: number; y: number; id: number } | null>(null)
  const dragged = useRef(false)
  const lockUntil = useRef(0)
  const candidateSense = session ? contextSenseMap.get(session.current.senseId) : undefined
  const sense = candidateSense?.version === session?.current.senseVersion ? candidateSense : undefined
  const example = sense?.examples.find(
    (e) => e.id === session?.current.exampleId && e.version === session.current.exampleVersion,
  )
  const word = sense ? contextWordMap.get(sense.wordId) : undefined
  const token = session ? `${session.id}:${session.decisions}` : ''

  function decide(known: boolean) {
    if (Date.now() < lockUntil.current || !session || !example) return
    // Commit synchronously before changing the visible card. Suppress double clicks.
    if (answer(known, token)) lockUntil.current = Date.now() + 240
  }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
      )
        return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        decide(event.key === 'ArrowLeft')
      }
      if (event.key === ' ' && !(event.target instanceof HTMLElement && event.target.closest('button'))) {
        event.preventDefault()
        reveal()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  if (!session) return <Navigate to={lastResult ? '/learn/result' : '/learn'} replace />
  if (!sense || !example || !word)
    return (
      <div className={styles.root}>
        <p role="alert">{error ?? '예문이 변경되었습니다. 학습을 다시 시작해 주세요.'}</p>
        <IconButton icon={X} label="설정으로" onClick={() => navigate('/learn')} />
      </div>
    )
  const targetStart = example.translation.indexOf(example.translationTarget)
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <IconButton icon={X} label="학습 나가기" onClick={() => navigate('/')} />
        <span>{session.setName}</span>
        <span className={styles.progress}>
          {session.round === 1
            ? `${session.cards.length}/${session.targetCount}`
            : `↻ ${session.round} · ${session.queue.length + 1}`}
        </span>
      </header>
      {error && <p role="alert">{error}</p>}
      <GlassPanel className={styles.panel} padding="lg">
        <button
          className={styles.sentence}
          style={{ fontSize: `${1.1 + fontScale * 0.2}rem` }}
          type="button"
          aria-label={`문장 정답 공개. ${example.before}${session.revealed ? example.answer : '빈칸'}${example.after} ${example.translation}`}
          aria-expanded={session.revealed}
          onPointerDown={(event) => {
            pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
            dragged.current = false
          }}
          onPointerCancel={() => {
            pointer.current = null
          }}
          onPointerUp={(event) => {
            const start = pointer.current
            pointer.current = null
            if (!start || start.id !== event.pointerId) return
            const dx = event.clientX - start.x
            const dy = event.clientY - start.y
            if (Math.abs(dx) >= 96 && Math.abs(dx) > Math.abs(dy) * 1.4) {
              dragged.current = true
              decide(dx < 0)
            }
          }}
          onClick={() => {
            if (!dragged.current) reveal()
            dragged.current = false
          }}
        >
          <span lang="ja">
            {example.before}
            {session.revealed ? (
              <strong className={styles.answer}>{example.answer}</strong>
            ) : (
              <span className={styles.blank} aria-label="빈칸" />
            )}
            {example.after}
          </span>
          <span className={styles.translation} lang="ko">
            {example.translation.slice(0, targetStart)}
            <em>{example.translationTarget}</em>
            {example.translation.slice(targetStart + example.translationTarget.length)}
          </span>
        </button>
        <div className={styles.details}>
          {session.revealed && (
            <div className={styles.forms}>
              <span>
                <small>문장</small> <span lang="ja">{example.answer}</span>{' '}
                <small lang="ja">{example.reading}</small>
              </span>
              <span>
                <small>기본형</small> <span lang="ja">{word.japanese}</span>{' '}
                <small lang="ja">{word.reading}</small>
              </span>
              <span>{sense.meaning}</span>
            </div>
          )}
          {session.hintShown && <p className={styles.hint}>{sense.hint}</p>}
        </div>
        <div className={styles.tools}>
          <IconButton
            icon={ChevronLeft}
            label="이전 카드"
            disabled={!data.history.length}
            onClick={() => {
              if (undo()) lockUntil.current = Date.now() + 240
            }}
          />
          <IconButton icon={Lightbulb} label="뉘앙스 힌트" active={session.hintShown} onClick={toggleHint} />
          <IconButton
            icon={Heart}
            label="즐겨찾기"
            active={favoriteIds.includes(word.id)}
            onClick={() => toggleFavorite(word.id)}
          />
          <IconButton
            icon={ZoomOut}
            label="글자 작게"
            disabled={fontScale <= 1}
            onClick={() => setFontScale(fontScale - 1)}
          />
          <IconButton
            icon={ZoomIn}
            label="글자 크게"
            disabled={fontScale >= 4}
            onClick={() => setFontScale(fontScale + 1)}
          />
        </div>
      </GlassPanel>
      <div className={styles.decisions}>
        <button type="button" onClick={() => decide(true)}>
          <BadgeCheck size={22} />앎
        </button>
        <button type="button" onClick={() => decide(false)}>
          <CircleHelp size={22} />
          모름
        </button>
      </div>
    </div>
  )
}
