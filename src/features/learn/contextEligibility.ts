import type { ContextState, LearnSenseIndex, ReviewProfile } from './contextTypes'

const key = (sense: LearnSenseIndex) => `${sense.id}@${sense.version}`

/** A pending usage also protects the word from appearing through another usage. */
export function blockedStudyWords(
  profiles: ContextState['profiles'],
  senses: LearnSenseIndex[],
  day: string,
  excludedWordIds: string[] = [],
) {
  const blocked = new Set(excludedWordIds)
  for (const sense of senses) {
    const profile = profiles[key(sense)]
    if (profile && !profile.mastered && (profile.due > day || profile.lastDay === day)) blocked.add(sense.wordId)
  }
  return blocked
}

export function isStudyDue(profile: ReviewProfile | undefined, day: string) {
  return !profile || (!profile.mastered && profile.due <= day)
}

export function eligibleStudyWords(state: ContextState, senses: LearnSenseIndex[], day: string) {
  const blocked = blockedStudyWords(state.profiles, senses, day, state.excludedWordIds)
  return new Set(senses.filter(sense => !blocked.has(sense.wordId) && isStudyDue(state.profiles[key(sense)], day))
    .map(sense => sense.wordId))
}
