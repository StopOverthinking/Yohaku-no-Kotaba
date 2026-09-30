import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '@/components/IconButton'
import { GlassPanel } from '@/components/GlassPanel'
import { useContextStore } from './contextStore'
import { contextSenses, contextWordMap } from './contextContent'
import { localDay } from './contextEngine'
import { reviewList } from './reviewList'
import styles from './progress.module.css'

export function ReviewListPage() {
  const data = useContextStore((s) => s.data)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const rows = useMemo(() => reviewList(data, contextSenses), [data])
  const filtered = rows.filter(({ sense }) => {
    const word = contextWordMap.get(sense.wordId)
    return word && `${word.japanese} ${word.reading} ${sense.meaning}`.includes(query.trim())
  })
  const today = localDay()
  return (
    <div className={styles.root}>
      <div className="page-header">
        <IconButton icon={ArrowLeft} label="학습 설정으로" onClick={() => navigate('/learn')} />
        <div>
          <h1 className="page-header__title">
            복습 예정 단어 <small>{rows.length}</small>
          </h1>
          <p className="page-header__caption">복습 간격 30일 이하 · 예정일 순</p>
        </div>
      </div>
      <input
        className="glass-input"
        aria-label="복습 단어 검색"
        placeholder="단어 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!rows.length && <p>아직 복습 간격이 30일 이하인 학습 단어가 없습니다.</p>}
      {rows.length > 0 && !filtered.length && <p>검색 결과가 없습니다.</p>}
      <ul className={styles.list}>
        {filtered.map(({ sense, profile, interval }) => {
          const word = contextWordMap.get(sense.wordId)!
          return (
            <li key={sense.id}>
              <GlassPanel padding="md" className={styles.reviewRow}>
                <div>
                  <strong lang="ja">{word.japanese}</strong>
                  <span lang="ja">{word.reading}</span>
                  <p>{sense.meaning}</p>
                </div>
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
    </div>
  )
}
