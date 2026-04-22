import { describe, expect, it } from 'vitest'
import { getStudyItemsForSet, getWordById, getWordbookKind } from '@/features/vocab/model/selectors'

describe('wordbook selectors', () => {
  it('returns themed words in topic order inside one themed wordbook', () => {
    const items = getStudyItemsForSet('theme-core')

    expect(items.length).toBeGreaterThan(0)
    expect(items[0]?.kind).toBe('word')
    expect(items[0]?.kind === 'word' ? items[0].topicName : null).toBe('움직임')
    expect(items[6]?.kind === 'word' ? items[6].topicName : null).toBe('판단')
    expect(items[0]?.kind === 'word' ? items[0].word.setId : null).toBe('theme-core')
    expect(getWordbookKind('theme-core')).toBe('theme')
  })

  it('returns comparison items for compare wordbooks', () => {
    const items = getStudyItemsForSet('ComparingWords')

    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.kind === 'comparison')).toBe(true)
    expect(getWordById('ComparingWords_1')?.setId).toBe('ComparingWords')
    expect(getWordbookKind('ComparingWords')).toBe('compare')
  })
})
