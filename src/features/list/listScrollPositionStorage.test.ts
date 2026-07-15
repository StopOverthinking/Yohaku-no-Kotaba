import { afterEach, describe, expect, it } from 'vitest'
import {
  listScrollPositionsStorageKey,
  loadListScrollPosition,
  saveListScrollPosition,
} from '@/features/list/listScrollPositionStorage'

describe('list scroll position storage', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('stores and reads independent positions for each vocabulary set', () => {
    saveListScrollPosition('set-a', 180)
    saveListScrollPosition('set-b', 640)

    expect(loadListScrollPosition('set-a')).toBe(180)
    expect(loadListScrollPosition('set-b')).toBe(640)
    expect(loadListScrollPosition('set-c')).toBe(0)
  })

  it('ignores malformed and invalid stored positions', () => {
    localStorage.setItem(
      listScrollPositionsStorageKey,
      JSON.stringify({ valid: 240, negative: -1, text: '320' }),
    )

    expect(loadListScrollPosition('valid')).toBe(240)
    expect(loadListScrollPosition('negative')).toBe(0)
    expect(loadListScrollPosition('text')).toBe(0)
  })
})
