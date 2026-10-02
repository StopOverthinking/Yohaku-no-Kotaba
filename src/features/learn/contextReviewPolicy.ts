import type { LearnExampleIndex, LearnSenseIndex, ReviewProfile } from './contextTypes'

export const RECOMMENDATION_POLICY = {
  // Beginner prior between the reviewed N5 (14) and N4 (18) difficulty medians.
  initialLevel: 16,
  calibrationWords: 20,
  calibrationGain: 8,
  ongoingGain: 2,
  probabilityScale: 8,
  calibrationTarget: 0.5,
  ongoingTarget: 0.75,
  failurePenalty: 0.25,
  firstKnownStep: 2,
  knownSteps: [2, 4, 8, 11],
  intervals: [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 150, 180],
} as const
export const SCHEDULE_VERSION = 3
export const REVIEW_INTERVALS = RECOMMENDATION_POLICY.intervals
export function reviewInterval(step: number, failures: number) {
  return Math.max(
    1,
    Math.round(
      REVIEW_INTERVALS[step] /
        (1 +
          RECOMMENDATION_POLICY.failurePenalty * (failures > 0 ? 1 : 0)),
    ),
  )
}
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function addDays(day: string, days: number) {
  const [y, m, d] = day.split('-').map(Number)
  return localDay(new Date(y, m - 1, d + days, 12))
}
export function reviewProfile(
  previous: ReviewProfile | undefined,
  sense: LearnSenseIndex,
  example: LearnExampleIndex,
  known: boolean,
  hint: boolean,
  day: string,
): ReviewProfile {
  const profile: ReviewProfile = previous
    ? { ...previous, examples: { ...previous.examples } }
    : {
        senseId: sense.id,
        version: sense.version,
        due: addDays(day, 1),
        step: 0,
        lastDay: '',
        dailyAttempts: 0,
        failedDay: null,
        levelDay: '',
        failedDays: 0,
        failures: 0,
        lastExampleId: '',
        examples: {},
      }
  const isFirstToday = profile.lastDay !== day
  profile.dailyAttempts = isFirstToday ? 1 : profile.dailyAttempts + 1
  if (!known && isFirstToday) {
    profile.failures++
    if (profile.failedDay !== day) profile.failedDays++
    profile.failedDay = day
    profile.step = 0
    delete profile.mastered
    profile.due = addDays(day, 1)
  } else if (known && !previous) {
    // Immediate first recall starts further ahead than a word learned through retries.
    profile.step = RECOMMENDATION_POLICY.firstKnownStep
    profile.due = addDays(day, reviewInterval(profile.step, 0))
  } else if (known && isFirstToday && !profile.mastered && profile.due <= day) {
    if (profile.failures === 0) {
      const nextStep = RECOMMENDATION_POLICY.knownSteps.find(step => step > profile.step)
      if (nextStep === undefined) profile.mastered = true
      else {
        profile.step = nextStep
        profile.due = addDays(day, reviewInterval(profile.step, 0))
      }
    } else {
      profile.step = Math.min(REVIEW_INTERVALS.length - 1, profile.step + 1)
      profile.due = addDays(day, reviewInterval(profile.step, 1))
    }
  }
  const exampleStats = profile.examples[example.id] ?? { seen: 0, failures: 0, hints: 0 }
  profile.examples[example.id] = {
    seen: exampleStats.seen + 1,
    failures: exampleStats.failures + (!known && isFirstToday ? 1 : 0),
    hints: exampleStats.hints + (hint ? 1 : 0),
  }
  profile.lastDay = day
  profile.lastExampleId = example.id
  return profile
}

