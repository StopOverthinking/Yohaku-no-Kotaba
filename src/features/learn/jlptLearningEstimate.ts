import { RECOMMENDATION_POLICY } from './contextReviewPolicy'
import type { ContextState, JlptLearningEstimate, LearnerLevel, LearnSenseIndex } from './contextTypes'

export const JLPT_LEARNING_POLICY = { version: 1, gain: 0.25 } as const

export const emptyJlptEstimate = (): JlptLearningEstimate => ({ policyVersion: 1, value: null })

/** Evaluate the response against this estimate, never against the fast recommendation score. */
export function updateJlptEstimate(estimate: JlptLearningEstimate, level: LearnerLevel, difficulty: number, known: boolean): JlptLearningEstimate {
  if (estimate.value === null) {
    return level.assessedWordIds.length < RECOMMENDATION_POLICY.calibrationWords
      ? estimate : { policyVersion: 1, value: level.value }
  }
  const p = 1 / (1 + Math.exp((difficulty - estimate.value) / RECOMMENDATION_POLICY.probabilityScale))
  return { policyVersion: 1, value: estimate.value + JLPT_LEARNING_POLICY.gain * ((known ? 1 : 0) - p) }
}

/** Last-day first recall is recoverable; full response order and earlier daily recalls are not. */
export function estimateJlptFromHistory(state: ContextState, senses: LearnSenseIndex[], resolveWordId = (id: string) => id) {
  const byWord = new Map<string, { day: string; observations: { difficulty: number; known: boolean }[] }>()
  for (const sense of senses) {
    const profile = state.profiles[`${sense.id}@${sense.version}`]
    if (!profile || profile.levelDay !== profile.lastDay || !profile.lastDay) continue
    const example = sense.examples.find(e => e.id === profile.lastExampleId && e.status === 'reviewed')
    // Never substitute another sentence's difficulty for a missing historical example.
    if (!example || !Number.isFinite(example.difficulty)) continue
    const word = resolveWordId(sense.wordId)
    const previous = byWord.get(word)
    const observation = { difficulty: example.difficulty, known: profile.failedDay !== profile.lastDay }
    if (!previous || previous.day < profile.lastDay)
      byWord.set(word, { day: profile.lastDay, observations: [observation] })
    else if (previous.day === profile.lastDay) previous.observations.push(observation)
  }
  if (!byWord.size) return null
  // Equal weight per word, shared across same-day usages/aliases. Sort only to make
  // the floating-point sum deterministic; no historical answer order is invented.
  const words = [...byWord].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) =>
    row.observations.sort((a, b) => a.difficulty - b.difficulty || Number(a.known) - Number(b.known)))
  const scale = RECOMMENDATION_POLICY.probabilityScale
  const prior = RECOMMENDATION_POLICY.initialLevel
  let low = prior - scale * words.length, high = prior + scale * words.length
  // Regularized logistic fit with a normal prior (mean 16, standard deviation 8).
  // The prior keeps all-known/all-unknown or sparse records finite, without copying
  // a recent volatile recommendation score into the historical estimate.
  for (let step = 0; step < 64; step++) {
    const middle = (low + high) / 2
    let gradient = (prior - middle) / scale
    for (const observations of words) {
      for (const { difficulty, known } of observations)
        gradient += ((known ? 1 : 0) - 1 / (1 + Math.exp((difficulty - middle) / scale))) / observations.length
    }
    if (gradient > 0) low = middle
    else high = middle
  }
  return { value: (low + high) / 2, wordCount: words.length }
}

/** Old sessions keep their exact undo contract until they are finished or discarded. */
export function migrateJlptEstimate(state: ContextState, senses: LearnSenseIndex[] = [], resolveWordId = (id: string) => id): ContextState {
  if (state.jlptHistoryReestimate || state.session || state.history.length) return state
  const candidate = estimateJlptFromHistory(state, senses, resolveWordId)
  // Use the same minimum evidence as initial calibration. Sparse/unresolvable
  // history cannot justify replacing an already measured score with the prior.
  const baseline = candidate && candidate.wordCount >= RECOMMENDATION_POLICY.calibrationWords ? candidate : null
  const measured = baseline !== null || state.jlptEstimate?.value != null || state.level.assessedWordIds.length >= RECOMMENDATION_POLICY.calibrationWords
  return { ...state, version: 4,
    jlptEstimate: { policyVersion: 1, value: measured ? baseline?.value ?? state.jlptEstimate?.value ?? state.level.value : null },
    jlptHistoryReestimate: { version: 1, wordCount: baseline?.wordCount ?? 0 },
  }
}

export function currentJlptScore(state: Pick<ContextState, 'version' | 'jlptEstimate' | 'level'>): number | null {
  if (state.version === 4) return state.jlptEstimate?.value ?? null
  return state.level.assessedWordIds.length >= RECOMMENDATION_POLICY.calibrationWords ? state.level.value : null
}
