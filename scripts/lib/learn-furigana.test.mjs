// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest'
import { addLearnFurigana, counterReading, createFuriganaGenerator } from './learn-furigana.mjs'

describe('generated surrounding furigana', () => {
  let generate
  beforeAll(async () => { generate = await createFuriganaGenerator() })

  it('retains the original sentence while annotating surrounding kanji', () => {
    const text = '今日、部屋の鍵をフロントに'
    const parts = generate(text)
    expect(parts.map(part => part.text).join('')).toBe(text)
    expect(parts).toEqual(expect.arrayContaining([{ text: '今日', reading: 'きょう' }, { text: '部屋', reading: 'へや' }, { text: '鍵', reading: 'かぎ' }]))
    expect(generate('カタカナとひらがな。').every(part => !part.reading)).toBe(true)
  })

  it.each([
    ['一', '人', 'ひとり'], ['二', '人', 'ふたり'], ['四', '人', 'よにん'], ['三', '日', 'みっか'], ['二十', '日', 'はつか'],
    ['一', '本', 'いっぽん'], ['三', '本', 'さんぼん'], ['八', '本', 'はっぽん'], ['一', '杯', 'いっぱい'], ['三', '匹', 'さんびき'],
    ['三', '分', 'さんぷん'], ['六', '分', 'ろっぷん'], ['10', '分', 'じゅっぷん'], ['７', '時', 'しちじ'], ['九', '時間', 'くじかん'],
    ['一', '週間', 'いっしゅうかん'], ['一', 'か月', 'いっかげつ'], ['六', 'ヶ月', 'ろっかげつ'], ['八', 'か月', 'はっかげつ'],
    ['一', '日中', 'いちにちじゅう'], ['一', '年中', 'いちねんじゅう'], ['八百', '円', 'はっぴゃくえん'], ['四', '月', 'しがつ'],
  ])('reads %s%s as %s', (number, counter, reading) => {
    expect(counterReading(number, counter)).toBe(reading)
    expect(generate(number + counter)).toEqual([{ text: number + counter, reading }])
  })

  it('does not mutate authored content or add the target to surrounding parts', async () => {
    const source = [{ id: 'sense', examples: [{ id: 'example', before: '今日', after: '。', answer: '秘密', reading: 'ひみつ', version: 1 }] }]
    const original = structuredClone(source)
    const { senses, report } = await addLearnFurigana(source)
    expect(source).toEqual(original)
    expect(senses[0].examples[0].beforeFurigana).toEqual([{ text: '今日', reading: 'きょう' }])
    expect(senses[0].examples[0].afterFurigana).toEqual([{ text: '。' }])
    expect(report.missing).toEqual([])
    expect(senses[0].examples[0].answer).toBe('秘密')
  })

  it('preserves sufficient versus ten minutes and rejects stale or orphan corrections', async () => {
    const source = [{ id: 'sense', examples: [{ id: 'example', before: '十分', after: '。' }] }]
    const correction = { exampleId: 'example', side: 'before', text: '十分', parts: [{ text: '十分', reading: 'じゅっぷん' }] }
    expect(generate('十分')).toEqual([{ text: '十分', reading: 'じゅうぶん' }])
    expect((await addLearnFurigana(source, [correction])).senses[0].examples[0].beforeFurigana).toEqual(correction.parts)
    await expect(addLearnFurigana(source, [{ ...correction, text: '五分' }])).rejects.toThrow('Stale')
    await expect(addLearnFurigana(source, [{ ...correction, exampleId: 'deleted' }])).rejects.toThrow('Unused')
    await expect(addLearnFurigana(source, [{ ...correction, parts: [{ text: '十分', reading: '十分' }] }])).rejects.toThrow('Invalid')
  })
})
