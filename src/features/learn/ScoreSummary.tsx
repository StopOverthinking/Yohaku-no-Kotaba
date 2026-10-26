import type { ScoreChange } from './contextTypes'
import { formatScore, formatScoreChange } from './reviewList'
import styles from './progress.module.css'

export function ScoreSummary({ value, change, grade }: { value: number; change?: ScoreChange; grade?: string | null }) {
  return (
    <div className={styles.score}>
      <span>학습 점수</span>
      <strong>{formatScore(value)}</strong>
      {grade && <span title="JLPT 어휘 환산">{grade}</span>}
      {change && (
        <span aria-label="지난 학습 점수 변화">
          지난 학습 {formatScoreChange(change.before, change.after)}
          <small>
            {formatScore(change.before)} → {formatScore(change.after)}
          </small>
        </span>
      )}
    </div>
  )
}
