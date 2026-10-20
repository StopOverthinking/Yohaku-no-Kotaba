import type { FuriganaPart } from './contextTypes'

const kanji = /^[\p{Script=Han}々]+$/u
const hiragana = (text: string) => text.replace(/[ァ-ヶ]/g, char =>
  char === 'ヶ' || char === 'ヵ' ? 'か' : String.fromCharCode(char.charCodeAt(0) - 0x60))
const reviewedSplits: Record<string, FuriganaPart[]> = {
  '好き嫌い/すききらい': [{ text: '好', reading: 'す' }, { text: 'き' }, { text: '嫌', reading: 'きら' }, { text: 'い' }],
}

/** Align the authored reading to literal kana. Only an unambiguous kanji
 * reading becomes ruby; kana always stays in the ordinary sentence text. */
export function kanjiFurigana(part: FuriganaPart): FuriganaPart[] {
  if (!part.reading) return [{ text: part.text }]
  const runs = part.text.match(/[\p{Script=Han}々]+|[^\p{Script=Han}々]+/gu) ?? []
  const reading = hiragana(part.reading)
  const reviewed = reviewedSplits[`${part.text}/${reading}`]
  if (reviewed) return reviewed.map(piece => ({ ...piece }))
  const solutions: FuriganaPart[][] = []
  function align(index: number, offset: number, parts: FuriganaPart[]) {
    if (solutions.length > 1) return
    if (index === runs.length) {
      if (offset === reading.length) solutions.push(parts)
      return
    }
    const text = runs[index]
    if (!kanji.test(text)) {
      const literal = hiragana(text)
      if (reading.startsWith(literal, offset)) align(index + 1, offset + literal.length, [...parts, { text }])
      return
    }
    if (index === runs.length - 1) {
      if (offset < reading.length) align(index + 1, reading.length, [...parts, { text, reading: reading.slice(offset) }])
      return
    }
    const literal = hiragana(runs[index + 1])
    for (let end = reading.indexOf(literal, offset + 1); end !== -1; end = reading.indexOf(literal, end + 1)) {
      align(index + 1, end, [...parts, { text, reading: reading.slice(offset, end) }])
      if (solutions.length > 1) return
    }
  }
  align(0, 0, [])
  // Never put kana under ruby or invent an alignment for an unknown spelling.
  return solutions.length === 1 ? solutions[0] : [{ text: part.text }]
}
