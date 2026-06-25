import { afterEach, describe, expect, it, vi } from 'vitest'
import { shuffleArray } from '@/lib/random'

describe('shuffleArray', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps explicit seeds deterministic', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f']

    expect(shuffleArray(items, 42)).toEqual(shuffleArray(items, 42))
  })

  it('uses a fresh random seed by default', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.8)

    const first = shuffleArray(items)
    const second = shuffleArray(items)

    expect(randomSpy).toHaveBeenCalledTimes(2)
    expect(first).not.toEqual(second)
  })
})
