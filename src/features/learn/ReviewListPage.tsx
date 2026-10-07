import { useMemo, useState } from 'react'
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '@/components/IconButton'
import { GlassPanel } from '@/components/GlassPanel'
import { useContextStore } from './contextStore'
import { contextSenses, contextWordMap } from './contextContent'
import { localDay } from './contextReviewPolicy'
import { reviewList } from './reviewList'
import { ReviewConfirmationDialog } from './ReviewConfirmationDialog'
import styles from './progress.module.css'

type Confirmation = { kind: 'remove'; wordId: string } | { kind: 'reset' }

export function ReviewListPage() {
  const data = useContextStore((s) => s.data)
  const busy = useContextStore((s) => s.busy)
  const ready = useContextStore((s) => s.ready)
  const removeReviewWord = useContextStore((s) => s.removeReviewWord)
  const resetLearning = useContextStore((s) => s.resetLearning)
  const storeError = useContextStore((s) => s.error)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const rows = useMemo(() => reviewList(data, contextSenses), [data])
  const filtered = rows.filter(({ sense }) => {
    const word = contextWordMap.get(sense.wordId)
    return word && `${word.japanese} ${word.reading} ${sense.meaning}`.includes(query.trim())
  })
  const today = localDay()
  const confirmAction = async () => {
    if (!confirmation) return
    setConfirmationError(null)
    const resetting = confirmation.kind === 'reset'
    const saved = await (resetting ? resetLearning() : removeReviewWord(confirmation.wordId))
    if (saved) {
      setConfirmation(null)
      if (resetting) setQuery('')
    } else setConfirmationError(useContextStore.getState().error ??
      (resetting ? '초기화하지 못했습니다. 다시 시도해 주세요.' : '삭제하지 못했습니다. 다시 시도해 주세요.'))
  }
  return (
    <div className={styles.root}>
      <div className="page-header page-header--inline-action">
        <div className="page-header__left">
          <IconButton icon={ArrowLeft} label="학습 설정으로" onClick={() => navigate('/learn')} />
          <div>
            <h1 className="page-header__title">
              복습 예정 단어 <small>{rows.length}</small>
            </h1>
            <p className="page-header__caption">예정일 순</p>
          </div>
        </div>
        <div className="page-header__right">
          <IconButton icon={RotateCcw} label="학습 기록 초기화" title="학습 기록 초기화" tone="danger" disabled={busy || !ready}
            onClick={() => { setConfirmationError(null); setConfirmation({ kind: 'reset' }) }} />
        </div>
      </div>
      <input
        className="glass-input"
        aria-label="복습 단어 검색"
        placeholder="단어 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!rows.length && <p>복습 예정인 단어가 없습니다.</p>}
      {rows.length > 0 && !filtered.length && <p>검색 결과가 없습니다.</p>}
      {!confirmation && storeError && <p role="alert">{storeError}</p>}
      <ul className={styles.list}>
        {filtered.map(({ sense, profile, interval }) => {
          const word = contextWordMap.get(sense.wordId)!
          return (
            <li key={sense.id}>
              <GlassPanel padding="md" className={styles.reviewRow}>
                <div className={styles.reviewWord}>
                  <strong lang="ja">{word.japanese}</strong>
                  <span lang="ja">{word.reading}</span>
                  <p>{sense.meaning}</p>
                </div>
                <IconButton icon={Trash2} label={`${word.japanese} 복습 삭제`} tone="danger" disabled={busy || !ready}
                  onClick={() => { setConfirmationError(null); setConfirmation({ kind: 'remove', wordId: sense.wordId }) }} />
                <div className={styles.schedule}>
                  <time dateTime={profile.due}>{profile.due}</time>
                  <span>
                    {profile.due < today ? '복습일 지남' : profile.due === today ? '오늘 복습' : '복습 예정'}
                  </span>
                  <small>{interval}일 간격</small>
                </div>
              </GlassPanel>
            </li>
          )
        })}
      </ul>
      {confirmation && <ReviewConfirmationDialog
        title={confirmation.kind === 'reset' ? '정말 초기화하겠습니까?' : '정말 삭제할까요?'}
        description={confirmation.kind === 'reset' ? '학습 기록과 점수를 모두 초기화합니다.' :
          <><strong lang="ja">{contextWordMap.get(confirmation.wordId)!.japanese}</strong>를 복습 목록에서 삭제합니다.</>}
        confirmLabel={confirmation.kind === 'reset' ? '초기화' : '삭제'} busy={busy}
        error={confirmationError} onCancel={() => setConfirmation(null)} onConfirm={() => { void confirmAction() }} />}
    </div>
  )
}
