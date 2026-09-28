import { House } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import { useLearnSessionStore } from '@/features/session/learnSessionStore'
import styles from '@/features/learn/learn.module.css'
import { useContextStore } from './contextStore'

export function LearnResultPage() {
  const navigate = useNavigate()
  const legacyResult = useLearnSessionStore((state) => state.lastResult)
  const contextResult = useContextStore((state) => state.lastResult)
  const clearContextResult = useContextStore((state) => state.clearResult)
  const lastResult = contextResult ?? legacyResult
  const clearResult = useLearnSessionStore((state) => state.clearResult)

  if (!lastResult) {
    return <Navigate to="/learn" replace />
  }

  return (
    <div className={styles.root}>
      <GlassPanel className={styles.resultHero} padding="lg" variant="strong">
        <div>
          <p className="section-kicker">Complete</p>
          <h1 className="section-title">{lastResult.setName} 세션을 마쳤습니다.</h1>
          {contextResult && <p className="section-copy">다음 복습 일정에 반영했습니다.</p>}
        </div>

        <div className="meta-grid">
          <GlassPanel className="meta-card" padding="sm">
            <span className="form-label">총 카드 수</span>
            <strong>{lastResult.totalTargetCount}</strong>
          </GlassPanel>
          <GlassPanel className="meta-card" padding="sm">
            <span className="form-label">라운드 수</span>
            <strong>{lastResult.rounds}</strong>
          </GlassPanel>
          <GlassPanel className="meta-card" padding="sm">
            <span className="form-label">다시 본 카드</span>
            <strong>{lastResult.revisitedCount}</strong>
          </GlassPanel>
        </div>

        <div className="action-row">
          <Tooltip label="홈으로 이동">
            <span>
              <IconButton
                icon={House}
                label="홈으로 이동"
                size="lg"
                onClick={() => {
                  clearResult()
                  clearContextResult()
                  navigate('/')
                }}
              />
            </span>
          </Tooltip>
        </div>
      </GlassPanel>
    </div>
  )
}
