import { profileKey } from './contextEngine'
import { reviewInterval } from './contextReviewPolicy'
import type { ContextState, LearnSenseIndex } from './contextTypes'

// Keep every pending review visible until its flow explicitly finishes.
export function reviewList<T extends LearnSenseIndex>(state: ContextState, senses: T[]) {
  const excluded = new Set(state.excludedWordIds)
  return senses
    .flatMap((sense) => {
      const profile = state.profiles[profileKey(sense)]
      if (!profile || profile.mastered || excluded.has(sense.wordId)) return []
      const interval = reviewInterval(profile.step, profile.failures)
      return [{ sense, profile, interval }]
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
