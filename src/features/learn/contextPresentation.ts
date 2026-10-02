import { profileKey } from './contextEngine'
import { localDay } from './contextReviewPolicy'
import type { ContextState, LearnSenseIndex, ReviewProfile } from './contextTypes'

function calendarDay(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  return Date.UTC(year, month - 1, date) / 86_400_000
}

export function cardRecency(profile: ReviewProfile | undefined, today = localDay()) {
  return profile ? `${Math.max(0, calendarDay(today) - calendarDay(profile.lastDay))}일 전` : '새 단어'
}

export function scopedReviews(
  profiles: ContextState['profiles'],
  senses: Map<string, LearnSenseIndex>,
  scope: Set<string>,
  resolveWordId: (id: string) => string,
  today = localDay(),
) {
  const dueWords = new Set<string>()
  let nextDue: string | undefined
  for (const profile of Object.values(profiles)) {
    if (profile.mastered) continue
    const sense = senses.get(profile.senseId)
    if (!sense || profileKey(sense) !== `${profile.senseId}@${profile.version}`) continue
    const wordId = resolveWordId(sense.wordId)
    if (!scope.has(wordId)) continue
    if (!nextDue || profile.due < nextDue) nextDue = profile.due
    if (profile.due <= today) dueWords.add(wordId)
  }
  return { dueCount: dueWords.size, nextDue }
}
