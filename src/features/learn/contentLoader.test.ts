import { describe, expect, it, vi } from 'vitest'
import { createContentLoader } from './contentLoader'
import { testSense } from './contextTestFixtures'
import type { LearnSense } from './contextTypes'

const a = testSense('a', 10), b = testSense('b', 20), c = testSense('c', 30)
// The shared scheduling fixture intentionally reuses sentence text; loader fixtures must not.
for (const sense of [a, b, c])
  sense.examples = sense.examples.map((example) => ({ ...example, before: `【${sense.wordId}】${example.before}` }))
const entry = (sense: LearnSense, shard: number) => ({
  id: sense.id, wordId: sense.wordId, version: sense.version, review: sense.review, shard,
  examples: sense.examples.map(({ id, version, difficulty, status }) => ({ id, version, difficulty, status })),
})

describe('lazy sentence loader', () => {
  it('shares a pending request and caches two senses in the same shard', async () => {
    let resolve!: (senses: LearnSense[]) => void
    const fetch = vi.fn(() => new Promise<LearnSense[]>((done) => { resolve = done }))
    const loader = createContentLoader([entry(a, 0), entry(b, 0)], { 0: fetch })
    const first = loader.loadSense(a.id), second = loader.loadSense(b.id)
    await Promise.resolve()
    expect(fetch).toHaveBeenCalledTimes(1)
    resolve([a, b])
    expect(await Promise.all([first, second])).toEqual([a, b])
    expect(await loader.loadSense(a.id)).toEqual(a)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('retries failed requests and refuses content from a different index version', async () => {
    const fetch = vi.fn<() => Promise<LearnSense[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ ...a, version: a.version + 1 }])
      .mockResolvedValueOnce([a])
    const loader = createContentLoader([entry(a, 0)], { 0: fetch })
    await expect(loader.loadSense(a.id)).rejects.toThrow('내려받지 못했습니다')
    await expect(loader.loadSense(a.id)).rejects.toThrow('버전')
    expect(await loader.loadSense(a.id)).toEqual(a)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('evicts the least recently used shard without discarding the most recent one', async () => {
    const fetchA = vi.fn(async () => [a]), fetchB = vi.fn(async () => [b]), fetchC = vi.fn(async () => [c])
    const loader = createContentLoader([entry(a, 0), entry(b, 1), entry(c, 2)], { 0: fetchA, 1: fetchB, 2: fetchC }, 2)
    await loader.loadSense(a.id); await loader.loadSense(b.id); await loader.loadSense(a.id)
    await loader.loadSense(c.id); await loader.loadSense(a.id)
    expect(fetchA).toHaveBeenCalledTimes(1)
    await loader.loadSense(b.id)
    expect(fetchB).toHaveBeenCalledTimes(2)
  })
  it('rejects missing, duplicate and malformed content without caching it', async () => {
    const fetch = vi.fn(async () => [{ ...a, hint: '答え' }])
    const loader = createContentLoader([entry(a, 0)], { 0: fetch })
    await expect(loader.loadSense(a.id)).rejects.toThrow('데이터')
    await expect(loader.loadSense(a.id)).rejects.toThrow('데이터')
    expect(fetch).toHaveBeenCalledTimes(2)
    await expect(loader.loadSense('missing')).rejects.toThrow('찾지')
    await expect(createContentLoader([entry(a, 0)], {}).loadSense(a.id)).rejects.toThrow('파일')
    await expect(createContentLoader([entry(a, 0)], { 0: async () => [a, a] }).loadSense(a.id)).rejects.toThrow('버전')
  })
})
