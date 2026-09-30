import { profileKey, reviewInterval } from './contextEngine'
import type { ContextState, LearnSenseIndex } from './contextTypes'

// A mastered 60-day item stays hidden even when its due date approaches.
export function reviewList<T extends LearnSenseIndex>(state: ContextState, senses: T[]) {
  return senses
    .flatMap((sense) => {
      const profile = state.profiles[profileKey(sense)]
      if (!profile) return []
      const interval = reviewInterval(profile.step, profile.failedDays)
      return interval <= 30 ? [{ sense, profile, interval }] : []
    })
    .sort(
      (a, b) =>
        a.profile.due.localeCompare(b.profile.due) ||
        b.profile.failures - a.profile.failures ||
        a.sense.id.localeCompare(b.sense.id),
    )
}

export const formatScore = (value: number) => value.toFixed(1)
export function formatScoreChange(before: number, after: number) {
  const difference = Math.round((after - before) * 10) / 10
  return `${difference > 0 ? '+' : ''}${difference.toFixed(1)}`
}
