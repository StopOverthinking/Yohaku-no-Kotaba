import { describe, expect, it } from 'vitest'
import { learnContentIndex } from '@/features/vocab/data/learnContentIndex'
import { vocabularySets } from '@/features/vocab/data/vocabularySets'
import { expectedKnown, RECOMMENDATION_POLICY } from './contextEngine'
import { estimateJlptLevel, formatJlptLevel, JLPT_ESTIMATE_POLICY, jlptAnchorSummary, jlptGradeLabel } from './jlptEstimate'

describe('JLPT vocabulary estimate', () => {
  it('places each level exactly at its anchor and splits the gap into tenths toward the lower level', () => {
    expect(formatJlptLevel(19)).toBe('N5.0')
    expect(formatJlptLevel(18.9)).toBe('N5.1')
    expect(formatJlptLevel(26.5)).toBe('N4.0')
    expect(formatJlptLevel(26.4)).toBe('N4.1')
    expect(formatJlptLevel(33.5)).toBe('N3.0')
    expect(formatJlptLevel(41)).toBe('N2.0')
    expect(formatJlptLevel(49.5)).toBe('N1.0')
    // 30% of the way from N5 to N4 is N4.7.
    expect(formatJlptLevel(19 + 7.5 * 0.3)).toBe('N4.7')
    expect(formatJlptLevel(RECOMMENDATION_POLICY.initialLevel)).toBe('N5.5')
    expect(formatJlptLevel(30)).toBe('N3.5')
    expect(estimateJlptLevel(22.75)).toBeCloseTo(4.5)
  })

  it('clamps below N5.9 and above N1 without inventing N6 or N0 grades', () => {
    expect(formatJlptLevel(12.1)).toBe('N5.9')
    expect(formatJlptLevel(12)).toBe('N5.9')
    expect(formatJlptLevel(-20)).toBe('N5.9')
    expect(formatJlptLevel(49.6)).toBe('N1.0')
    expect(formatJlptLevel(120)).toBe('N1.0')
  })

  it('hides the grade until the initial calibration words are assessed', () => {
    expect(jlptGradeLabel(30, RECOMMENDATION_POLICY.calibrationWords - 1)).toBeNull()
    expect(jlptGradeLabel(30, RECOMMENDATION_POLICY.calibrationWords)).toBe('N3.5')
    expect(jlptAnchorSummary()).toBe('N5 19점 · N4 26.5점 · N3 33.5점 · N2 41점 · N1 49.5점')
  })

  it('keeps the fixed anchors within half a point of the current level-list difficulties', () => {
    const difficulties = new Map<string, number[]>()
    for (const sense of learnContentIndex) {
      difficulties.set(sense.wordId, [...(difficulties.get(sense.wordId) ?? []), ...sense.examples.map((example) => example.difficulty)])
    }
    const recallAnchor = (values: number[]) => {
      const recall = (score: number) => values.reduce((sum, difficulty) => sum + expectedKnown(score, difficulty), 0) / values.length
      let low = -50
      let high = 150
      for (let step = 0; step < 60; step += 1) {
        const middle = (low + high) / 2
        if (recall(middle) < JLPT_ESTIMATE_POLICY.passRecall) low = middle
        else high = middle
      }
      return low
    }
    const computed = ['n5', 'n4', 'n3', 'n2', 'n1'].map((level) => {
      const set = vocabularySets.find((item) => item.id === `jlpt-level-${level}`)!
      return recallAnchor(set.wordIds.flatMap((id) => difficulties.get(id) ?? []))
    })
    const [floor, ...fixed] = JLPT_ESTIMATE_POLICY.anchors
    fixed.forEach((anchor, index) => expect(Math.abs(anchor - computed[index])).toBeLessThanOrEqual(0.5))
    expect(Math.abs(floor - (computed[0] - (computed[1] - computed[0])))).toBeLessThanOrEqual(0.5)
  })
})
