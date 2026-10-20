import { describe, expect, it } from 'vitest'
import { kanjiFurigana } from './furiganaPresentation'

describe('kanji-only furigana display', () => {
  it.each([
    ['回る', 'まわる', [{ text: '回', reading: 'まわ' }, { text: 'る' }]],
    ['回っ', 'まわっ', [{ text: '回', reading: 'まわ' }, { text: 'っ' }]],
    ['新しい', 'あたらしい', [{ text: '新', reading: 'あたら' }, { text: 'しい' }]],
    ['お客様', 'おきゃくさま', [{ text: 'お' }, { text: '客様', reading: 'きゃくさま' }]],
    ['申し込む', 'もうしこむ', [{ text: '申', reading: 'もう' }, { text: 'し' }, { text: '込', reading: 'こ' }, { text: 'む' }]],
    ['取り扱い', 'とりあつかい', [{ text: '取', reading: 'と' }, { text: 'り' }, { text: '扱', reading: 'あつか' }, { text: 'い' }]],
    ['好き嫌い', 'すききらい', [{ text: '好', reading: 'す' }, { text: 'き' }, { text: '嫌', reading: 'きら' }, { text: 'い' }]],
    ['一人暮らし', 'ひとりぐらし', [{ text: '一人暮', reading: 'ひとりぐ' }, { text: 'らし' }]],
    ['一ヶ月', 'いっかげつ', [{ text: '一', reading: 'いっ' }, { text: 'ヶ' }, { text: '月', reading: 'げつ' }]],
    ['今日', 'きょう', [{ text: '今日', reading: 'きょう' }]],
    ['々', 'どき', [{ text: '々', reading: 'どき' }]],
    ['する', 'する', [{ text: 'する' }]],
  ])('annotates only the kanji in %s', (text, reading, expected) => {
    const source = { text, reading }
    expect(kanjiFurigana(source)).toEqual(expected)
    expect(source).toEqual({ text, reading })
  })

  it('preserves plain text and does not guess an ambiguous or inconsistent reading', () => {
    expect(kanjiFurigana({ text: 'かなだけ' })).toEqual([{ text: 'かなだけ' }])
    expect(kanjiFurigana({ text: '回る', reading: 'ちがう' })).toEqual([{ text: '回る' }])
    expect(kanjiFurigana({ text: '漢に字', reading: 'かににじ' })).toEqual([{ text: '漢に字' }])
  })
})
