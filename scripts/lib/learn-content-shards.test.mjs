// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { partitionLearnContent } from './learn-content-shards.mjs'

const sense = (i) => ({
  id: `sense-${i}`, wordId: `word-${i}`, version: 2,
  meaning: '뜻', hint: '문맥에 맞는 독립 힌트', confusions: [{ japanese: '別', distinction: '차이' }],
  review: { word: true, contrast: true, diversity: true },
  examples: Array.from({ length: 3 }, (_, j) => ({
    id: `sense-${i}-ex-${j}`, version: 3, before: '前', answer: '答', after: '後', reading: 'こたえ',
    translation: '문장 번역', translationTarget: '번역', difficulty: 10 + j, status: 'reviewed',
  })),
})

describe('content shard generation', () => {
  it('round-trips 12,000 senses and 36,000 examples while keeping sentence text out of the index', () => {
    const original = Array.from({ length: 12000 }, (_, i) => sense(i))
    const { index, shards } = partitionLearnContent(original)
    const restored = new Map(shards.flat().map((s) => [s.id, s]))
    expect(index).toHaveLength(12000)
    expect(shards.flat().reduce((n, s) => n + s.examples.length, 0)).toBe(36000)
    for (const [i, entry] of index.entries()) {
      expect(shards[entry.shard].find((s) => s.id === entry.id)).toEqual(original[i])
      expect(restored.get(entry.id)).toEqual(original[i])
      expect(entry).not.toHaveProperty('hint')
      expect(entry.examples[0]).not.toHaveProperty('answer')
      expect(entry.examples[0]).not.toHaveProperty('translation')
    }
    expect(Math.max(...shards.map((s) => s.length))).toBeLessThan(160)
  })
  it('preserves bucket identity and versions when unrelated words are appended', () => {
    const words = [sense(1), sense(2)]
    const before = partitionLearnContent(words)
    const after = partitionLearnContent([...words, sense(3)])
    expect(after.index.slice(0, 2)).toEqual(before.index)
    expect(after.index[0].version).toBe(2)
    expect(after.index[0].examples[0].version).toBe(3)
    expect(words).toEqual([sense(1), sense(2)])
  })
  it('rejects duplicate references rather than silently losing content', () => {
    expect(() => partitionLearnContent([sense(1), sense(1)])).toThrow('sense ID')
    const other = sense(2)
    other.examples[0].id = sense(1).examples[0].id
    expect(() => partitionLearnContent([sense(1), other])).toThrow('example ID')
    expect(() => partitionLearnContent([], 0)).toThrow('bucket count')
  })
})
