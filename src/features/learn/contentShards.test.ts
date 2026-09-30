import { describe, expect, it } from 'vitest'
import { learnContent } from '@/features/vocab/data/learnContent'
import { learnContentIndex } from '@/features/vocab/data/learnContentIndex'
import { learnContentLoaders } from '@/features/vocab/data/learnContentLoaders'

describe('generated content shards', () => {
  it('loads every authored sense unchanged and indexes the same versions and difficulty', async () => {
    const shards = await Promise.all(Object.entries(learnContentLoaders).map(async ([id, load]) => [Number(id), await load()] as const))
    const byShard = new Map(shards)
    const restored = new Map(shards.flatMap(([, senses]) => senses.map((s) => [s.id, s] as const)))
    expect(restored.size).toBe(learnContent.length)
    expect(learnContentIndex).toHaveLength(learnContent.length)
    for (const sense of learnContent) expect(restored.get(sense.id)).toEqual(sense)
    for (const item of learnContentIndex) {
      const full = byShard.get(item.shard)?.find((sense) => sense.id === item.id)
      expect(full).toBeDefined()
      expect(item.wordId).toBe(full!.wordId)
      expect(item.meaning).toBe(full!.meaning)
      expect(item.version).toBe(full!.version)
      expect(item.review).toEqual(full!.review)
      expect(item.examples).toEqual(full!.examples.map(({ id, version, difficulty, status }) => ({ id, version, difficulty, status })))
    }
  })
})
