import { describe, expect, it } from 'vitest'
import { comparisonWords } from '@/features/vocab/data/comparisonWords'
import { themeWords } from '@/features/vocab/data/themeWords'
import { vocabularyWords } from '@/features/vocab/data/vocabularyWords'

const allWords = [...vocabularyWords, ...themeWords, ...comparisonWords]

describe('vocabulary data quality', () => {
  it('keeps word IDs unique across every vocabulary source', () => {
    const ids = allWords.map((word) => word.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps an inflected kana ending aligned with its reading', () => {
    const mismatches = allWords.filter((word) => {
      const japaneseEnding = word.japanese.match(/[ぁ-ゖー]+$/)?.[0]
      const readingEnding = word.reading.match(/[ぁ-ゖー]+$/)?.[0]

      return japaneseEnding && readingEnding && !readingEnding.endsWith(japaneseEnding)
    })

    expect(mismatches).toEqual([])
  })

  it.each([
    ['JLPTN3_178', '不安だ', 'ふあんだ', null],
    ['JLPTN3_354', '商売', 'しょうばい', null],
    ['handmade_34', '箱', 'はこ', null],
    ['handmade_48', '番号', 'ばんごう', null],
    ['AbsoluteVerb_393', '扱う', 'あつかう', '1타'],
    ['AbsoluteVerb_833', '顔が立たない', 'かおがたたない', null],
    ['JLPTN3_125', '呼びかける', 'よびかける', '2타'],
    ['AbsoluteVerb_113', '悲しむ', 'かなしむ', '1타'],
  ])('keeps the reviewed entry %s corrected', (id, japanese, reading, verbInfo) => {
    const word = allWords.find((candidate) => candidate.id === id)

    expect(word).toMatchObject({ japanese, reading, verbInfo })
  })
})
