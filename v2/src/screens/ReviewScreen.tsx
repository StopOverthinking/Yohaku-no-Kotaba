import { useMemo, useState } from 'react'
import { CalendarCheck2, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { useContextStore } from '@/features/learn/contextStore'
import { contextSenses, contextWordMap } from '@/features/learn/contextContent'
import { addDays, localDay } from '@/features/learn/contextReviewPolicy'
import { dueReviewCount, reviewList } from '@/features/learn/reviewList'
import { ConfirmDialog, IconButton } from '@v2/ui/primitives'
import '@v2/styles/review.css'

type Filter = 'all' | 'now' | 'later'
type Confirmation = { kind: 'remove'; wordId: string } | { kind: 'reset' }

function dayLabel(due: string, today: string) {
  if (due < today) return '지남'
  if (due === today) return '오늘'
  if (due === addDays(today, 1)) return '내일'
  const [y, m, d] = due.split('-').map(Number)
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(y, m - 1, d))
}

export function ReviewScreen() {
  const data = useContextStore((s) => s.data)
  const busy = useContextStore((s) => s.busy)
  const ready = useContextStore((s) => s.ready)
  const storeError = useContextStore((s) => s.error)
  const removeReviewWord = useContextStore((s) => s.removeReviewWord)
  const resetLearning = useContextStore((s) => s.resetLearning)
  const [filter, setFilter] = useState<Filter>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const today = localDay()
  const rows = useMemo(() => reviewList(data, contextSenses), [data])
  const nowCount = dueReviewCount(rows, today)

  const groups = useMemo(() => {
    const q = query.trim()
    const out: Array<{ label: string; tone: string; items: typeof rows }> = []
    for (const row of rows) {
      if (filter === 'now' && row.profile.due > today) continue
      if (filter === 'later' && row.profile.due <= today) continue
      if (q) {
        const word = contextWordMap.get(row.sense.wordId)
        if (!word || !`${word.japanese} ${word.reading} ${row.sense.meaning}`.includes(q)) continue
      }
      const label = dayLabel(row.profile.due, today)
      const last = out.at(-1)
      if (last?.label === label) last.items.push(row)
      else out.push({ label, tone: row.profile.due < today ? 'late' : row.profile.due === today ? 'today' : 'later', items: [row] })
    }
    return out
  }, [rows, filter, query, today])

  const confirmAction = async () => {
    if (!confirmation) return
    setConfirmError(null)
    const resetting = confirmation.kind === 'reset'
    const saved = await (resetting ? resetLearning() : removeReviewWord(confirmation.wordId))
    if (saved) {
      setConfirmation(null)
      if (resetting) setQuery('')
    } else
      setConfirmError(useContextStore.getState().error ?? (resetting ? '초기화하지 못했습니다. 다시 시도해 주세요.' : '삭제하지 못했습니다. 다시 시도해 주세요.'))
  }

  return (
    <div className="page review">
      <header className="topbar">
        <h1 className="topbar__title">
          복습<small>{rows.length}</small>
        </h1>
        <IconButton
          icon={searchOpen ? X : Search}
          label={searchOpen ? '검색 닫기' : '검색'}
          active={searchOpen || undefined}
          onClick={() => {
            setSearchOpen(!searchOpen)
            if (searchOpen) setQuery('')
          }}
        />
        <IconButton
          icon={RotateCcw}
          label="학습 기록 초기화"
          tone="danger"
          disabled={busy || !ready}
          onClick={() => {
            setConfirmError(null)
            setConfirmation({ kind: 'reset' })
          }}
        />
      </header>

      {searchOpen && <input className="field" autoFocus aria-label="복습 단어 검색" placeholder="단어 · 읽기 · 뜻" value={query} onChange={(e) => setQuery(e.target.value)} />}

      <div className="segmented" role="radiogroup" aria-label="보기">
        {(
          [
            ['all', '전체', rows.length],
            ['now', '지금', nowCount],
            ['later', '예정', rows.length - nowCount],
          ] as const
        ).map(([key, label, count]) => (
          <button key={key} type="button" role="radio" aria-checked={filter === key} onClick={() => setFilter(key)}>
            {label}
            <span className="chip__count">{count}</span>
          </button>
        ))}
      </div>

      {!confirmation && storeError && <p className="alert" role="alert">{storeError}</p>}

      {rows.length === 0 ? (
        <div className="empty">
          <CalendarCheck2 size={36} strokeWidth={1.5} />
          <p>복습할 단어가 없습니다</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="empty">
          <Search size={32} strokeWidth={1.5} />
          <p>결과 없음</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="review__group" aria-label={group.label}>
            <h2 className="review__day" data-tone={group.tone}>
              {group.label}
              <span>{group.items.length}</span>
            </h2>
            <ul className="card card--flush review__list">
              {group.items.map(({ sense, profile, interval }) => {
                const word = contextWordMap.get(sense.wordId)!
                return (
                  <li key={sense.id} className="review__row">
                    <div className="review__word">
                      <strong lang="ja">{word.japanese}</strong>
                      <span lang="ja">{word.reading}</span>
                    </div>
                    <p className="review__meaning">{sense.meaning}</p>
                    <span className="review__interval" title={`다음 예정 ${profile.due}`}>
                      {interval}일
                    </span>
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      label={`${word.japanese} 복습 삭제`}
                      disabled={busy || !ready}
                      onClick={() => {
                        setConfirmError(null)
                        setConfirmation({ kind: 'remove', wordId: sense.wordId })
                      }}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {confirmation && (
        <ConfirmDialog
          title={confirmation.kind === 'reset' ? '학습 기록을 초기화할까요?' : '복습에서 삭제할까요?'}
          body={
            confirmation.kind === 'reset' ? (
              '학습 기록과 점수를 모두 초기화합니다. 설정과 즐겨찾기는 유지됩니다.'
            ) : (
              <>
                <strong lang="ja">{contextWordMap.get(confirmation.wordId)?.japanese}</strong>을(를) 복습과 학습 대상에서 제외합니다.
              </>
            )
          }
          confirmLabel={confirmation.kind === 'reset' ? '초기화' : '삭제'}
          busy={busy}
          error={confirmError}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void confirmAction()}
        />
      )}
    </div>
  )
}
