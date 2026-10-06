import { profileKey } from './contextEngine'
import { addDays, localDay } from './contextReviewPolicy'
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
  excludedWordIds: string[] = [],
) {
  const dueWords = new Set<string>()
  const excluded = new Set(excludedWordIds)
  const wordDates = new Map<string, string>()
  let nextDue: string | undefined
  for (const profile of Object.values(profiles)) {
    if (profile.mastered) continue
    const sense = senses.get(profile.senseId)
    if (!sense || profileKey(sense) !== `${profile.senseId}@${profile.version}`) continue
    const wordId = resolveWordId(sense.wordId)
    if (!scope.has(wordId) || excluded.has(wordId)) continue
    const due = profile.lastDay === today && profile.due <= today ? addDays(today, 1) : profile.due
    const previous = wordDates.get(wordId)
    if (!previous || due > previous) wordDates.set(wordId, due)
  }
  for (const [wordId, due] of wordDates) {
    if (!nextDue || due < nextDue) nextDue = due
    if (due <= today) dueWords.add(wordId)
  }
  return { dueCount: dueWords.size, nextDue }
}
