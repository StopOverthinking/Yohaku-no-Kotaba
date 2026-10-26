import { RECOMMENDATION_POLICY } from './contextReviewPolicy'

// Vocabulary-only JLPT estimate of the learning score. A level's anchor is the score whose
// expected recall over that level's reviewed examples reaches a pass-like target, not mastery.
export const JLPT_ESTIMATE_POLICY = {
  version: 1,
  passRecall: 0.65,
  // N6 (extrapolated floor of N5.9), N5, N4, N3, N2, N1 from jlpt-level-n5..n1 on 2026-10-26.
  anchors: [12, 19, 26.5, 33.5, 41, 49.5],
  lowest: 5.9,
  highest: 1,
} as const

/** Continuous grade: 6 at the N6 anchor, 5 at N5 … 1 at N1, linear between anchors. */
export function estimateJlptLevel(score: number) {
  const { anchors } = JLPT_ESTIMATE_POLICY
  const top = anchors.length - 1
  if (score <= anchors[0]) return 6
  if (score >= anchors[top]) return 6 - top
  let index = 0
  while (score >= anchors[index + 1]) index += 1
  return 6 - index - (score - anchors[index]) / (anchors[index + 1] - anchors[index])
}

// Rounds toward the lower level so "N4.0" appears only once the N4 anchor is reached.
export function formatJlptLevel(score: number) {
  const grade = Math.ceil(estimateJlptLevel(score) * 10 - 1e-9) / 10
  const clamped = Math.min(JLPT_ESTIMATE_POLICY.lowest, Math.max(JLPT_ESTIMATE_POLICY.highest, grade))
  return `N${clamped.toFixed(1)}`
}

/** Hidden until the initial calibration finishes, so the beginner prior is not shown as a result. */
export const jlptGradeLabel = (score: number, assessedCount: number) =>
  assessedCount < RECOMMENDATION_POLICY.calibrationWords ? null : formatJlptLevel(score)

export const jlptAnchorSummary = () =>
  JLPT_ESTIMATE_POLICY.anchors
    .slice(1)
    .map((score, index) => `N${5 - index} ${score}점`)
    .join(' · ')
