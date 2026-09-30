import { CalendarDays } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { useContextStore } from './contextStore'
import { ScoreSummary } from './ScoreSummary'
import { ReviewGuide } from './ReviewGuide'
import styles from './progress.module.css'

export function LearningProgress() {
  const data = useContextStore((s) => s.data)
  const navigate = useNavigate()
  return (
    <GlassPanel padding="md">
      <div className={styles.toolbar}>
        <ScoreSummary value={data.level.value} change={data.lastScoreChange} />
        <IconButton icon={CalendarDays} label="복습 예정 단어" onClick={() => navigate('/learn/review')} />
      </div>
      {data.level.assessedWordIds.length < 20 && (
        <p className="page-header__caption">수준 측정 중 · {data.level.assessedWordIds.length}/20단어</p>
      )}
      <ReviewGuide />
    </GlassPanel>
  )
}
