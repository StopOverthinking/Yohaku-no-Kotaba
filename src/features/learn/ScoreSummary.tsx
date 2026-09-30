import type { ScoreChange } from './contextTypes'
import { formatScore, formatScoreChange } from './reviewList'
import styles from './progress.module.css'

export function ScoreSummary({ value, change }: { value: number; change?: ScoreChange }) {
  return (
    <div className={styles.score}>
      <span>학습 점수</span>
      <strong>{formatScore(value)}</strong>
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
