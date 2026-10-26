import { useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Check, Heart, HelpCircle, Lightbulb, RotateCw, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { contextSenseMap, contextWordMap } from '@/features/learn/contextContent'
import { useContextStore } from '@/features/learn/contextStore'
import { useContextSense } from '@/features/learn/useContextSense'
import { profileKey } from '@/features/learn/contextEngine'
import { cardRecency, similarHintWords } from '@/features/learn/contextPresentation'
import { IconButton } from '@v2/ui/primitives'
import { Furigana } from '@v2/ui/Furigana'
import '@v2/styles/session.css'

const SWIPE_DISTANCE = 96

export function SessionScreen() {
  const navigate = useNavigate()
  const { data, error, lastResult, answer, reveal, toggleHint, undo, busy, ready } = useContextStore()
  const session = data.session
  const fontScale = usePreferencesStore((s) => s.learnCardFontScale)
  const setFontScale = usePreferencesStore((s) => s.setLearnCardFontScale)
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds)
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite)
  const cardRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number; id: number } | null>(null)
  const suppressClickUntil = useRef(0)
  const lockUntil = useRef(0)

  const candidateSense = session ? contextSenseMap.get(session.current.senseId) : undefined
  const validCard =
    candidateSense?.version === session?.current.senseVersion &&
    candidateSense?.examples.some(
      (e) => e.id === session?.current.exampleId && e.version === session.current.exampleVersion && e.status === 'reviewed',
    )
  const content = useContextSense(ready && validCard ? candidateSense?.id : undefined)
  const sense = content.sense
  const example = sense?.examples.find((e) => e.id === session?.current.exampleId && e.version === session.current.exampleVersion)
  const word = sense ? contextWordMap.get(sense.wordId) : undefined
  const token = session ? `${session.id}:${session.decisions}` : ''

  async function decide(known: boolean) {
    if (busy || !ready || Date.now() < lockUntil.current || !session || !example) return
    if (await answer(known, token)) lockUntil.current = Date.now() + 240
  }

  function setDrag(dx: number, animate: boolean) {
    const card = cardRef.current
    if (!card) return
    card.style.transition = animate ? 'transform 200ms var(--ease)' : 'none'
    card.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 60}deg)` : ''
    card.dataset.swipe = dx <= -SWIPE_DISTANCE ? 'known' : dx >= SWIPE_DISTANCE ? 'unknown' : ''
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        void decide(event.key === 'ArrowLeft')
      } else if (event.key === ' ' && ready && !busy && example && !(event.target instanceof HTMLElement && event.target.closest('button'))) {
        event.preventDefault()
        void reveal()
      } else if (event.key.toLowerCase() === 'h' && ready && !busy) {
        void toggleHint()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  useEffect(() => setDrag(0, false), [token])

  if (!ready) return <div className="page session" role="status" />
  if (!session) return <Navigate to={lastResult ? '/learn/result' : '/'} replace />

  if (validCard && !sense)
    return (
      <div className="page session session--state">
        {content.error ? (
          <>
            <p role="alert">{content.error}</p>
            <IconButton icon={RotateCw} label="다시 불러오기" solid onClick={content.retry} />
          </>
        ) : (
          <span className="session__spinner" role="status" aria-label="예문을 불러오는 중" />
        )}
        <IconButton icon={X} label="학습 나가기" onClick={() => navigate('/')} />
      </div>
    )
  if (!sense || !example || !word)
    return (
      <div className="page session session--state">
        <p role="alert">{error ?? '예문이 변경되었습니다. 학습을 다시 시작해 주세요.'}</p>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/')}>
          홈으로
        </button>
      </div>
    )

  const targetStart = example.translation.indexOf(example.translationTarget)
  const similarWords = similarHintWords(sense, word, example)
  const firstRound = session.round === 1
  // Round 1: answered share of the target. Later rounds re-study misses, so the bar stays full.
  const progress = firstRound ? (session.cards.length - 1) / Math.max(1, session.targetCount) : 1
  const isFavorite = favoriteIds.includes(word.id)

  return (
    <div className="page session">
      <header className="session__top">
        <IconButton icon={X} label="학습 나가기" onClick={() => navigate('/')} />
        <div className="session__progress">
          <div className="progress" data-retry={!firstRound} role="progressbar" aria-valuemin={0} aria-valuemax={1} aria-valuenow={progress}>
            <span style={{ transform: `scaleX(${Math.max(0.015, Math.min(1, progress))})` }} />
          </div>
        </div>
        <span className="session__count">
          {firstRound ? (
            <>
              {session.cards.length}
              <small>/{session.targetCount}</small>
            </>
          ) : (
            <>
              <RotateCw size={13} /> {session.queue.length + 1}
            </>
          )}
        </span>
      </header>

      {error && <p className="alert" role="alert">{error}</p>}

      <div
        ref={cardRef}
        className="flash"
        data-revealed={session.revealed}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button:not(.flash__surface)')) return
          pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
        }}
        onPointerMove={(event) => {
          const start = pointer.current
          if (!start || start.id !== event.pointerId) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) setDrag(dx, false)
        }}
        onPointerCancel={() => {
          pointer.current = null
          setDrag(0, true)
        }}
        onPointerUp={(event) => {
          const start = pointer.current
          pointer.current = null
          if (!start || start.id !== event.pointerId) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          setDrag(0, true)
          if (Math.abs(dx) > 8) suppressClickUntil.current = Date.now() + 400
          if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.4) void decide(dx < 0)
        }}
      >
        <button
          type="button"
          className="flash__surface"
          disabled={busy || !ready}
          aria-label={`정답 공개. ${example.before}${session.revealed ? example.answer : '빈칸'}${example.after} ${example.translation}`}
          aria-expanded={session.revealed}
          onClick={() => {
            if (Date.now() >= suppressClickUntil.current && Date.now() >= lockUntil.current) void reveal()
          }}
        />
        <span className="flash__badge">{cardRecency(data.profiles[profileKey(sense)])}</span>
        <span className="flash__swipe flash__swipe--known" aria-hidden="true">
          <Check size={18} /> 앎
        </span>
        <span className="flash__swipe flash__swipe--unknown" aria-hidden="true">
          <HelpCircle size={18} /> 모름
        </span>

        <div className="flash__body" style={{ ['--card-scale' as string]: String(fontScale) }}>
          <p className="flash__sentence" lang="ja">
            <Furigana text={example.before} parts={example.beforeFurigana} />
            {session.revealed ? <strong className="flash__answer">{example.answer}</strong> : <span className="flash__blank" aria-label="빈칸" />}
            <Furigana text={example.after} parts={example.afterFurigana} />
          </p>
          <p className="flash__translation" lang="ko">
            {targetStart >= 0 ? (
              <>
                {example.translation.slice(0, targetStart)}
                <em>{example.translationTarget}</em>
                {example.translation.slice(targetStart + example.translationTarget.length)}
              </>
            ) : (
              example.translation
            )}
          </p>

          {similarWords.length > 0 && (
            <div className="flash__similar" aria-label="비슷한 단어">
              <span>≈</span>
              {similarWords.map((similar) => (
                <span key={similar} lang="ja" className="flash__similar-word">
                  {similar}
                </span>
              ))}
            </div>
          )}

          {session.revealed && (
            <dl className="flash__answer-info">
              <div>
                <dt lang="ja">{word.japanese}</dt>
                <dd lang="ja">{word.reading}</dd>
              </div>
              {example.answer !== word.japanese && (
                <div className="flash__form">
                  <dt lang="ja">{example.answer}</dt>
                  <dd lang="ja">{example.reading}</dd>
                </div>
              )}
              <p>{sense.meaning}</p>
            </dl>
          )}

          {session.hintShown && (
            <p className="flash__hint">
              <Lightbulb size={16} />
              <span>{sense.hint}</span>
            </p>
          )}
        </div>
      </div>

      <div className="session__tools" role="toolbar" aria-label="카드 도구">
        <IconButton
          icon={Undo2}
          label="이전 카드"
          disabled={busy || !ready || !data.history.length}
          onClick={async () => {
            if (await undo()) lockUntil.current = Date.now() + 240
          }}
        />
        <IconButton icon={Lightbulb} label="뉘앙스 힌트" active={session.hintShown} onClick={() => void toggleHint()} disabled={busy || !ready} />
        <IconButton icon={Heart} label="즐겨찾기" active={isFavorite} onClick={() => toggleFavorite(word.id)} />
        <IconButton icon={ZoomOut} label="글자 작게" disabled={fontScale <= 1} onClick={() => setFontScale(fontScale - 1)} />
        <IconButton icon={ZoomIn} label="글자 크게" disabled={fontScale >= 4} onClick={() => setFontScale(fontScale + 1)} />
      </div>

      <div className="decide">
        <button type="button" className="decide__btn decide__btn--known" onClick={() => void decide(true)} disabled={busy || !ready}>
          <Check size={22} strokeWidth={2.4} />
          앎<kbd>←</kbd>
        </button>
        <button type="button" className="decide__btn decide__btn--unknown" onClick={() => void decide(false)} disabled={busy || !ready}>
          <HelpCircle size={22} strokeWidth={2.2} />
          모름<kbd>→</kbd>
        </button>
      </div>
    </div>
  )
}
