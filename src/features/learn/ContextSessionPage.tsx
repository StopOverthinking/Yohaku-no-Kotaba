import { useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BadgeCheck, ChevronLeft, CircleHelp, Heart, Lightbulb, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { IconButton } from '@/components/IconButton'
import { GlassPanel } from '@/components/GlassPanel'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { contextSenseMap, contextWordMap } from './contextContent'
import { useContextStore } from './contextStore'
import { useContextSense } from './useContextSense'
import { profileKey } from './contextEngine'
import { cardRecency, similarHintWords } from './contextPresentation'
import type { FuriganaPart } from './contextTypes'
import styles from './context.module.css'

function Furigana({ text, parts }: { text: string; parts?: FuriganaPart[] }) {
  return parts ? parts.map((part, index) => part.reading
    ? <ruby key={index}>{part.text}<rt>{part.reading}</rt></ruby>
    : <span key={index}>{part.text}</span>) : text
}

export function ContextSessionPage() {
  const navigate = useNavigate()
  const { data, error, lastResult, answer, reveal, toggleHint, undo, busy, ready } = useContextStore()
  const session = data.session
  const fontScale = usePreferencesStore((s) => s.learnCardFontScale)
  const setFontScale = usePreferencesStore((s) => s.setLearnCardFontScale)
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds)
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite)
  const pointer = useRef<{ x: number; y: number; id: number } | null>(null)
  const dragged = useRef(false)
  const suppressClickUntil = useRef(0)
  const lockUntil = useRef(0)
  const candidateSense = session ? contextSenseMap.get(session.current.senseId) : undefined
  const validCard = candidateSense?.version === session?.current.senseVersion && candidateSense?.examples.some(
    (e) => e.id === session?.current.exampleId && e.version === session.current.exampleVersion && e.status === 'reviewed',
  )
  const content = useContextSense(ready && validCard ? candidateSense?.id : undefined)
  const sense = content.sense
  const example = sense?.examples.find(
    (e) => e.id === session?.current.exampleId && e.version === session.current.exampleVersion,
  )
  const word = sense ? contextWordMap.get(sense.wordId) : undefined
  const token = session ? `${session.id}:${session.decisions}` : ''

  async function decide(known: boolean) {
    if (busy || !ready || Date.now() < lockUntil.current || !session || !example) return
    if (await answer(known, token)) lockUntil.current = Date.now() + 240
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
      if (ready && !busy && example && event.key === ' ' && !(event.target instanceof HTMLElement && event.target.closest('button'))) {
        event.preventDefault()
        reveal()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  if (!ready) return <div className={styles.root} role="status">학습을 불러오는 중…</div>
  if (!session) return <Navigate to={lastResult ? '/learn/result' : '/learn'} replace />
  if (validCard && !sense)
    return (
      <div className={styles.root}>
        <IconButton icon={X} label="학습 나가기" onClick={() => navigate('/')} />
        {content.error ? <>
          <p role="alert">{content.error}</p>
          <IconButton icon={RotateCw} label="예문 다시 불러오기" onClick={content.retry} />
        </> : <p role="status">예문을 불러오는 중…</p>}
      </div>
    )
  if (!sense || !example || !word)
    return (
      <div className={styles.root}>
        <p role="alert">{error ?? '예문이 변경되었습니다. 학습을 다시 시작해 주세요.'}</p>
        <IconButton icon={X} label="설정으로" onClick={() => navigate('/learn')} />
      </div>
    )
  const targetStart = example.translation.indexOf(example.translationTarget)
  const similarWords = session.hintShown ? similarHintWords(sense, word, example) : []
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
          className={styles.cardSurface}
          type="button"
          disabled={busy || !ready}
          aria-label={`문장 정답 공개. ${example.before}${session.revealed ? example.answer : '빈칸'}${example.after} ${example.translation}`}
          aria-expanded={session.revealed}
          onPointerDown={(event) => {
            pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
            dragged.current = false
            event.currentTarget.setPointerCapture?.(event.pointerId)
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
              suppressClickUntil.current = Date.now() + 500
              decide(dx < 0)
            }
          }}
          onClick={() => {
            if (!dragged.current && Date.now() >= suppressClickUntil.current && Date.now() >= lockUntil.current) reveal()
            dragged.current = false
          }}
        />
        <div className={styles.recency}>{cardRecency(data.profiles[profileKey(sense)])}</div>
        <div className={styles.sentence} style={{ fontSize: `${1.1 + fontScale * 0.2}rem` }}>
          <span lang="ja">
            <Furigana text={example.before} parts={example.beforeFurigana} />
            {session.revealed ? (
              <strong className={styles.answer}>{example.answer}</strong>
            ) : (
              <span className={styles.blank} aria-label="빈칸" />
            )}
            <Furigana text={example.after} parts={example.afterFurigana} />
          </span>
          <span className={styles.translation} lang="ko">
            {example.translation.slice(0, targetStart)}
            <em>{example.translationTarget}</em>
            {example.translation.slice(targetStart + example.translationTarget.length)}
          </span>
        </div>
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
          {session.hintShown && (
            <div className={styles.hint}>
              <p>{sense.hint}</p>
              {similarWords.length > 0 && (
                <p className={styles.similarWords}>비슷한 단어: <span lang="ja">{similarWords.join(' · ')}</span></p>
              )}
            </div>
          )}
        </div>
        <div className={styles.tools}>
          <IconButton
            icon={ChevronLeft}
            label="이전 카드"
            disabled={busy || !ready || !data.history.length}
            onClick={async () => {
              if (await undo()) lockUntil.current = Date.now() + 240
            }}
          />
          <IconButton icon={Lightbulb} label="뉘앙스 힌트" active={session.hintShown} onClick={toggleHint} disabled={busy || !ready} />
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
        <button type="button" onClick={() => decide(true)} disabled={busy || !ready}>
          <BadgeCheck size={22} />앎
        </button>
        <button type="button" onClick={() => decide(false)} disabled={busy || !ready}>
          <CircleHelp size={22} />
          모름
        </button>
      </div>
    </div>
  )
}
