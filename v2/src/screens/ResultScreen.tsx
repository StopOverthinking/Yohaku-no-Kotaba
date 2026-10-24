import { useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CalendarClock, Check, House } from 'lucide-react'
import { useContextStore } from '@/features/learn/contextStore'
import { formatScore, formatScoreChange } from '@/features/learn/reviewList'
import '@v2/styles/result.css'

export function ResultScreen() {
  const navigate = useNavigate()
  const lastResult = useContextStore((state) => state.lastResult)
  const clearResult = useContextStore((state) => state.clearResult)
  const leaving = useRef<string | null>(null)

  if (!lastResult) return <Navigate to={leaving.current ?? '/'} replace />

  const delta = formatScoreChange(lastResult.score.before, lastResult.score.after)
  const leave = (to: string) => {
    leaving.current = to
    clearResult()
    navigate(to)
  }

  return (
    <div className="page result">
      <div className="result__mark" aria-hidden="true">
        <Check size={32} strokeWidth={2.6} />
      </div>
      <div className="result__head">
        <p className="eyebrow">{lastResult.setName}</p>
        <h1>완료</h1>
      </div>

      <section className="result__score" aria-label="학습 점수">
        <span className="result__from">{formatScore(lastResult.score.before)}</span>
        <span className="result__arrow" aria-hidden="true">→</span>
        <strong>{formatScore(lastResult.score.after)}</strong>
        <span className="result__delta" data-sign={delta.startsWith('-') ? 'down' : delta === '0.0' ? 'flat' : 'up'}>
          {delta}
        </span>
      </section>

      <dl className="result__stats">
        <div>
          <dt>카드</dt>
          <dd>{lastResult.totalTargetCount}</dd>
        </div>
        <div>
          <dt>라운드</dt>
          <dd>{lastResult.rounds}</dd>
        </div>
        <div>
          <dt>다시 본</dt>
          <dd>{lastResult.revisitedCount}</dd>
        </div>
      </dl>

      <div className="result__actions">
        <button type="button" className="btn btn--ghost btn--lg" onClick={() => leave('/learn/review')}>
          <CalendarClock size={18} />
          복습
        </button>
        <button type="button" className="btn btn--primary btn--lg" onClick={() => leave('/')}>
          <House size={18} />
          홈
        </button>
      </div>
    </div>
  )
}
