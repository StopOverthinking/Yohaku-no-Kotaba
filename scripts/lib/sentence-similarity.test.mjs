import { describe, it, expect } from 'vitest'
import { findSimilarSentences } from './sentence-similarity.mjs'

function brute(rows, threshold) {
  const grams = (s) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)))
  const output = []
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = grams(rows[i].masked), b = grams(rows[j].masked)
    const score = 2 * [...a].filter((g) => b.has(g)).length / (a.size + b.size || 1)
    if (score >= threshold || rows[i].masked === rows[j].masked) output.push(`${rows[i].id}/${rows[j].id}`)
  }
  return output.sort()
}

describe('lossless similarity candidate filtering', () => {
  it('matches exhaustive pair comparison across lengths, repeated grams and thresholds', () => {
    const rows = ['a', 'a', '', '', 'abcde', 'abcdef', 'abababab', 'abab', 'abcdefxyz', 'zabcdef',
      ...Array.from({ length: 160 }, (_, i) => Array.from({ length: i % 29 + 2 }, (_, j) => String.fromCharCode(97 + ((i * 17 + j * j + i * j) % 13))).join(''))]
      .map((masked, i) => ({ id: String(i), masked }))
    for (const threshold of [0.3, 0.5, 0.7, 1]) {
      const result = findSimilarSentences(rows, threshold).similar.map((p) => `${p.a}/${p.b}`).sort()
      expect(result).toEqual(brute(rows, threshold))
    }
  })
})
