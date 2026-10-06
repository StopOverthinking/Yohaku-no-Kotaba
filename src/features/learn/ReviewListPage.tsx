import { useMemo, useState } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '@/components/IconButton'
import { GlassPanel } from '@/components/GlassPanel'
import { useContextStore } from './contextStore'
import { contextSenses, contextWordMap } from './contextContent'
import { localDay } from './contextReviewPolicy'
import { reviewList } from './reviewList'
import { ReviewRemovalDialog } from './ReviewRemovalDialog'
import styles from './progress.module.css'

export function ReviewListPage() {
  const data = useContextStore((s) => s.data)
  const busy = useContextStore((s) => s.busy)
  const ready = useContextStore((s) => s.ready)
  const removeReviewWord = useContextStore((s) => s.removeReviewWord)
  const storeError = useContextStore((s) => s.error)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [removingWord, setRemovingWord] = useState<string | null>(null)
  const [removalError, setRemovalError] = useState<string | null>(null)
  const rows = useMemo(() => reviewList(data, contextSenses), [data])
  const filtered = rows.filter(({ sense }) => {
    const word = contextWordMap.get(sense.wordId)
    return word && `${word.japanese} ${word.reading} ${sense.meaning}`.includes(query.trim())
  })
  const today = localDay()
  const confirmRemoval = async () => {
    if (!removingWord) return
    setRemovalError(null)
    if (await removeReviewWord(removingWord)) setRemovingWord(null)
    else setRemovalError(useContextStore.getState().error ?? '삭제하지 못했습니다. 다시 시도해 주세요.')
  }
  return (
    <div className={styles.root}>
      <div className="page-header">
        <IconButton icon={ArrowLeft} label="학습 설정으로" onClick={() => navigate('/learn')} />
        <div>
          <h1 className="page-header__title">
            복습 예정 단어 <small>{rows.length}</small>
          </h1>
          <p className="page-header__caption">예정일 순</p>
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
      {!removingWord && storeError && <p role="alert">{storeError}</p>}
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
                  onClick={() => { setRemovalError(null); setRemovingWord(sense.wordId) }} />
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
      {removingWord && <ReviewRemovalDialog word={contextWordMap.get(removingWord)!.japanese} busy={busy}
        error={removalError} onCancel={() => setRemovingWord(null)} onConfirm={() => { void confirmRemoval() }} />}
    </div>
  )
}
