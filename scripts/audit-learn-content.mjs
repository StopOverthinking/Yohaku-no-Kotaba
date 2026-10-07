import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findSimilarSentences } from './lib/sentence-similarity.mjs'
import { questionKanjiLeaks } from './lib/hint-comparison-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (file) => JSON.parse(await fs.readFile(path.join(root, 'src/features/vocab/editor-data', file), 'utf8'))
const [content, basic, theme] = await Promise.all([read('learnContent.json'), read('vocabularyWords.json'), read('themeWords.json')])
const words = [...basic, ...theme]
const wordMap = new Map(words.map(word => [word.id, word]))
const kanjiLeaks = content.flatMap(sense => sense.examples.flatMap(example => {
  const shared = questionKanjiLeaks(wordMap.get(sense.wordId).japanese, example)
  return shared.length ? [{ senseId: sense.id, exampleId: example.id, wordId: sense.wordId, shared,
    before: example.before, answer: example.answer, after: example.after }] : []
}))
const reviewed = new Set(content.filter((s) => s.review.word && s.review.contrast && s.review.diversity && s.examples.some((e) => e.status === 'reviewed')).map((s) => s.wordId))
const missing = words.filter((word) => !reviewed.has(word.id)).map((word) => ({ id: word.id, japanese: word.japanese }))
const entries = content.flatMap((s) => s.examples.map((e) => ({ ...e, wordId: s.wordId, masked: `${e.before}□${e.after}` })))
const normalize = (s) => s.replace(/[\s、。！？「」『』,.!?]/g, '')
const bigrams = (s) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)))
const prepared = entries.map((e) => ({ ...e, normalized: normalize(e.masked), grams: bigrams(normalize(e.masked)) }))
const { similar, comparisons } = findSimilarSentences(entries)
function repeatedEdges(end) {
  const groups = new Map()
  for (const e of prepared) {
    const edge = end ? e.normalized.slice(-8) : e.normalized.slice(0, 8)
    groups.set(edge, [...(groups.get(edge) ?? []), e.id])
  }
  return [...groups].filter(([, ids]) => ids.length >= 5).sort((a, b) => b[1].length - a[1].length).map(([text, ids]) => ({ text, ids }))
}
const report = {
  words: words.length, senses: content.length, examples: entries.length, reviewedWords: reviewed.size,
  missing, kanjiLeaks, similar, comparisons, repeatedOpenings: repeatedEdges(false), repeatedEndings: repeatedEdges(true),
  note: '자동 유사도 검사는 검토 대상을 찾습니다. 자연스러움, 의미 차이, 장면 다양성은 별도 검수가 필요합니다.',
}
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
if (out) await fs.writeFile(path.resolve(root, out), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, missing: missing.length, kanjiLeaks: kanjiLeaks.length, similar: similar.length, repeatedOpenings: report.repeatedOpenings.length, repeatedEndings: report.repeatedEndings.length }, null, 2))
if (process.argv.includes('--require-complete') && (missing.length || kanjiLeaks.length)) process.exitCode = 1
