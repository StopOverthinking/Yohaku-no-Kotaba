import { beforeAll, describe, expect, it } from 'vitest'
import { learnContent } from '@/features/vocab/data/learnContent'
import { learnContentIndex } from '@/features/vocab/data/learnContentIndex'
import { learnContentLoaders } from '@/features/vocab/data/learnContentLoaders'
import { validateLearnContent } from './contentValidation'
import type { LearnSense } from './contextTypes'
import { kanjiFurigana } from './furiganaPresentation'

describe('generated content shards', () => {
  let shards: Array<readonly [number, LearnSense[]]>
  // Load and transform every generated module as fixture preparation; keep all
  // corpus assertions below within the unchanged default test timeout.
  beforeAll(async () => {
    shards = await Promise.all(Object.entries(learnContentLoaders).map(async ([id, load]) => [Number(id), await load()] as const))
  })

  it('loads every authored sense unchanged and indexes the same versions and difficulty', () => {
    const byShard = new Map(shards)
    const restored = new Map(shards.flatMap(([, senses]) => senses.map((s) => [s.id, s] as const)))
    expect(restored.size).toBe(learnContent.length)
    expect(learnContentIndex).toHaveLength(learnContent.length)
    for (const sense of learnContent) {
      const loaded = restored.get(sense.id)!
      // Shards add generated furigana; all authored fields must still round-trip exactly.
      expect({ ...loaded, examples: loaded.examples.map(({ beforeFurigana, afterFurigana, ...example }) => {
        expect(beforeFurigana?.map(part => part.text).join('')).toBe(example.before)
        expect(afterFurigana?.map(part => part.text).join('')).toBe(example.after)
        return example
      }) }).toEqual(sense)
    }
    expect(validateLearnContent([...restored.values()], new Set(learnContent.map(sense => sense.wordId)))).toEqual([])
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

  it('displays every corpus reading over kanji only without losing text or changing its pronunciation', () => {
    const hira = (text: string) => text.replace(/[ァ-ヶ]/g, char =>
      char === 'ヶ' || char === 'ヵ' ? 'か' : String.fromCharCode(char.charCodeAt(0) - 0x60))
    let examples = 0
    for (const [, senses] of shards) for (const sense of senses) for (const example of sense.examples) {
      examples++
      for (const part of [...example.beforeFurigana!, ...example.afterFurigana!]) {
        const displayed = kanjiFurigana(part)
        expect(displayed.map(piece => piece.text).join(''), example.id).toBe(part.text)
        if (!part.reading) continue
        expect(displayed.some(piece => piece.reading), `${example.id}: ${part.text}`).toBe(true)
        expect(displayed.map(piece => piece.reading ?? hira(piece.text)).join(''), `${example.id}: ${part.text}`).toBe(hira(part.reading))
        for (const piece of displayed.filter(piece => piece.reading)) expect(piece.text).toMatch(/^[\p{Script=Han}々]+$/u)
      }
    }
    expect(examples).toBe(5874)
  })
})
