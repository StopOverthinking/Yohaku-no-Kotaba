import kuromoji from 'kuromoji'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const hasKanji = /[\p{Script=Han}々]/u
const suspicious = /一人|二人|今日|明日|昨日|一日|二十日|大人|上手|下手|人気|市場|何|[0-9０-９一二三四五六七八九十百千]+[年月日時分人本匹杯階]/u
const hiragana = (text) => text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
const digits = ['','いち','に','さん','よん','ご','ろく','なな','はち','きゅう']
function parseNumber(text) {
  text = text.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
  if (/^\d+$/.test(text)) return Number(text)
  let total = 0, section = 0, current = 0
  for (const char of text) {
    const digit = '〇一二三四五六七八九'.indexOf(char)
    if (digit >= 0) current = current * 10 + digit
    else if (char === '万') { total += (section + current || 1) * 10000; section = current = 0 }
    else { section += (current || 1) * ({ 十: 10, 百: 100, 千: 1000 }[char]); current = 0 }
  }
  return total + section + current
}
function numberReading(number) {
  if (number === 0) return 'ぜろ'
  let result = ''
  if (number >= 10000) { result += numberReading(Math.floor(number / 10000)) + 'まん'; number %= 10000 }
  const thousands = Math.floor(number / 1000)
  if (thousands) result += ({ 1: 'せん', 3: 'さんぜん', 8: 'はっせん' }[thousands] ?? digits[thousands] + 'せん')
  number %= 1000
  const hundreds = Math.floor(number / 100)
  if (hundreds) result += ({ 1: 'ひゃく', 3: 'さんびゃく', 6: 'ろっぴゃく', 8: 'はっぴゃく' }[hundreds] ?? digits[hundreds] + 'ひゃく')
  number %= 100
  const tens = Math.floor(number / 10)
  if (tens) result += (tens === 1 ? '' : digits[tens]) + 'じゅう'
  return result + digits[number % 10]
}
export function counterReading(text, counter) {
  const n = parseNumber(text), reading = numberReading(n)
  const suffix = counter.endsWith('間') ? 'かん' : counter.endsWith('半') ? 'はん' : counter.endsWith('中') ? 'じゅう' : ''
  const base = counter.replace(/間$|半$|中$/, '')
  if (base === '人') return ({ 1: 'ひとり', 2: 'ふたり', 4: 'よにん' }[n] ?? reading.replace(/よん$/, 'よ') + 'にん') + suffix
  if (base === '日') return ({ 1: 'いちにち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか', 6: 'むいか', 7: 'なのか', 8: 'ようか', 9: 'ここのか', 10: 'とおか', 14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか' }[n] ?? reading + 'にち') + suffix
  if (base === '月') return ({ 4: 'し', 7: 'しち', 9: 'く' }[n] ?? reading) + 'がつ' + suffix
  if (base === '時') return reading.replace(/よん$/, 'よ').replace(/なな$/, 'しち').replace(/きゅう$/, 'く') + 'じ' + suffix
  const regular = { 年: 'ねん', 週間: 'しゅうかん', 週: 'しゅう', か月: 'かげつ', ヶ月: 'かげつ', 箇月: 'かげつ', 枚: 'まい', 台: 'だい', 円: 'えん', 人前: 'にんまえ' }
  if (regular[base]) {
    let prefix = base === '年' ? reading.replace(/よん$/, 'よ') : reading
    if (['か月', 'ヶ月', '箇月'].includes(base)) prefix = prefix.replace(/いち$/, 'いっ').replace(/ろく$/, 'ろっ').replace(/はち$/, 'はっ').replace(/じゅう$/, 'じゅっ').replace(/ひゃく$/, 'ひゃっ')
    if (base === '週') prefix = prefix.replace(/いち$/, 'いっ').replace(/はち$/, 'はっ').replace(/じゅう$/, 'じゅっ')
    return prefix + regular[base] + suffix
  }
  const endings = { 本: ['ほん', 'ぽん', 'ぼん'], 杯: ['はい', 'ぱい', 'ばい'], 匹: ['ひき', 'ぴき', 'びき'], 分: ['ふん', 'ぷん', 'ぷん'], 階: ['かい', 'かい', 'がい'], 回: ['かい', 'かい', 'かい'], 個: ['こ', 'こ', 'こ'], 冊: ['さつ', 'さつ', 'さつ'] }
  const sounds = endings[base]
  if (!sounds) throw new Error(`Unsupported counter: ${counter}`)
  const unit = n % 10
  const short = /いち$|ろく$|はち$|じゅう$|ひゃく$/
  const geminate = [1, 6, 8, 0].includes(unit) && short.test(reading) && !(unit === 6 && ['回', '冊'].includes(base))
  const pref = geminate ? reading.replace(/いち$/, 'いっ').replace(/ろく$/, 'ろっ').replace(/はち$/, 'はっ').replace(/じゅう$/, 'じゅっ').replace(/ひゃく$/, 'ひゃっ') : reading
  const sound = geminate || (base === '分' && [3, 4].includes(unit)) ? sounds[1] : unit === 3 ? sounds[2] : sounds[0]
  return pref + sound + suffix
}
const counters = /([0-9０-９〇一二三四五六七八九十百千万]+)(日間|日中|年間|年中|時間|時半|分間|週間|人前|か月|ヶ月|箇月|[年月日時分人本匹杯階回個冊枚台円週])/gu

export async function createFuriganaGenerator() {
  const dicPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict')
  const tokenizer = await new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((error, value) => error ? reject(error) : resolve(value))
  })
  return (text) => {
    const tokenize = (source) => tokenizer.tokenize(source).map((token) => {
      const part = { text: token.surface_form }
      if (hasKanji.test(part.text) && token.reading) part.reading = hiragana(token.reading)
      return part
    })
    const parts = []
    let position = 0
    for (const match of text.matchAll(counters)) {
      parts.push(...tokenize(text.slice(position, match.index)))
      // 十分 also means "sufficient". Preserve dictionary interpretation; reviewed
      // sentence-specific overrides distinguish actual ten-minute contexts.
      if (match[0] === '十分') parts.push({ text: match[0], reading: 'じゅうぶん' })
      else parts.push({ text: match[0], reading: counterReading(match[1], match[2]) })
      position = match.index + match[0].length
    }
    parts.push(...tokenize(text.slice(position)))
    const compact = []
    for (const part of parts) {
      if (!part.reading && compact.length && !compact.at(-1).reading) compact.at(-1).text += part.text
      else compact.push({ ...part })
    }
    if (parts.map((part) => part.text).join('') !== text) throw new Error(`Furigana source mismatch: ${text}`)
    return compact
  }
}

export async function addLearnFurigana(senses, overrides = []) {
  const generate = await createFuriganaGenerator()
  const corrections = new Map(overrides.map((override) => [`${override.exampleId}:${override.side}`, override]))
  if (corrections.size !== overrides.length) throw new Error('Duplicate furigana override')
  const used = new Set(), cache = new Map(), candidates = [], missing = []
  const enriched = senses.map((sense) => ({ ...sense, examples: sense.examples.map((example) => {
    const fields = {}
    for (const side of ['before', 'after']) {
      const text = example[side]
      if (!cache.has(text)) cache.set(text, generate(text))
      let parts = cache.get(text)
      const key = `${example.id}:${side}`
      const correction = corrections.get(key)
      if (correction) {
        if (correction.text !== text || correction.parts.map((part) => part.text).join('') !== text)
          throw new Error(`Stale furigana override: ${key}`)
        parts = correction.parts
        used.add(key)
      }
      for (const part of parts) {
        if (typeof part.text !== 'string' || (part.reading !== undefined && !/^[\p{Script=Hiragana}ー]+$/u.test(part.reading)))
          throw new Error(`Invalid furigana reading: ${key}`)
        if (hasKanji.test(part.text) && !part.reading) missing.push({ exampleId: example.id, side, text, token: part.text })
      }
      if (suspicious.test(text)) candidates.push({ exampleId: example.id, side, text, parts })
      fields[`${side}Furigana`] = parts
    }
    return { ...example, ...fields }
  }) }))
  for (const key of corrections.keys()) if (!used.has(key)) throw new Error(`Unused furigana override: ${key}`)
  return { senses: enriched, report: { examples: enriched.reduce((sum, sense) => sum + sense.examples.length, 0), missing, candidates } }
}
