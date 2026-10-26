import type { CSSProperties } from 'react'
import { kanjiFurigana } from '@/features/learn/furiganaPresentation'
import type { FuriganaPart } from '@/features/learn/contextTypes'

// Widths in base em: rt is 0.48em. A reading may overhang plain text by up
// to half a kanji but never a neighbouring reading (授業|中 would collide), so
// it slides toward free space first and only then widens its box. Each side
// keeps half a gap free so two readings never run together (志の志).
const RT_EM = 0.48
const OVERHANG_EM = 0.5
const RUBY_GAP_EM = 0.1
const textEm = (text: string) => [...text].reduce((sum, char) => sum + (char.charCodeAt(0) < 0x2000 ? 0.5 : 1), 0)

type RubyLayout = { box?: CSSProperties; rt?: CSSProperties }

export function rubyLayouts(parts: FuriganaPart[]): RubyLayout[] {
  const room = (neighbour?: FuriganaPart) =>
    (!neighbour ? OVERHANG_EM : neighbour.reading ? 0 : Math.min(OVERHANG_EM, textEm(neighbour.text) / 2)) - RUBY_GAP_EM / 2
  return parts.map((part, index) => {
    const overflow = part.reading ? [...part.reading].length * RT_EM - textEm(part.text) : 0
    if (overflow <= 0) return {}
    const roomStart = room(parts[index - 1])
    const roomEnd = room(parts[index + 1])
    const spare = overflow - roomStart - roomEnd
    const start = spare > 0 ? roomStart + spare / 2 : Math.min(roomStart, Math.max(overflow / 2, overflow - roomEnd))
    const end = overflow - start
    const marginStart = Math.max(0, start - roomStart).toFixed(2)
    const marginEnd = Math.max(0, end - roomEnd).toFixed(2)
    // rt is centred; its own em is RT_EM of the base em.
    const shift = ((end - start) / 2 / RT_EM).toFixed(2)
    return {
      box: +marginStart || +marginEnd ? { marginInlineStart: `${marginStart}em`, marginInlineEnd: `${marginEnd}em` } : undefined,
      rt: +shift ? { left: `calc(50% + ${shift}em)` } : undefined,
    }
  })
}

export function Furigana({ text, parts }: { text: string; parts?: FuriganaPart[] }) {
  if (!parts) return text
  // Merge adjacent plain runs so a neighbour's width reflects all its kana.
  const pieces = parts.flatMap(kanjiFurigana).reduce<FuriganaPart[]>((merged, part) => {
    const last = merged[merged.length - 1]
    if (last && !last.reading && !part.reading) last.text += part.text
    else merged.push({ ...part })
    return merged
  }, [])
  const layouts = rubyLayouts(pieces)
  return pieces.map((part, index) =>
    part.reading ? (
      <ruby key={index} style={layouts[index].box}>
        {part.text}
        <rt style={layouts[index].rt}>{part.reading}</rt>
      </ruby>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  )
}
