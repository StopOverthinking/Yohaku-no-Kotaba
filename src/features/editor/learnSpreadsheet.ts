import type { WorkBook } from 'xlsx'
import type { LearnSense } from '@/features/learn/contextTypes'

type Xlsx = typeof import('xlsx')
const senseSheet = 'learn_senses'
const exampleSheet = 'learn_examples'
const confusionSheet = 'learn_confusions'

export function appendLearnSheets(workbook: WorkBook, xlsx: Xlsx, senses: LearnSense[]) {
  const sensesRows = senses.map((s) => ({
    용법ID: s.id,
    단어ID: s.wordId,
    버전: s.version,
    뜻: s.meaning,
    힌트: s.hint,
    단어검수: s.review.word,
    유의어검수: s.review.contrast,
    다양성검수: s.review.diversity,
  }))
  const examplesRows = senses.flatMap((s) =>
    s.examples.map((e) => ({
      용법ID: s.id,
      예문ID: e.id,
      버전: e.version,
      앞문장: e.before,
      정답: e.answer,
      뒷문장: e.after,
      읽기: e.reading,
      번역: e.translation,
      강조: e.translationTarget,
      난도: e.difficulty,
      검수: e.status,
    })),
  )
  const confusionsRows = senses.flatMap((s) =>
    s.confusions.map((c) => ({ 용법ID: s.id, 혼동표현: c.japanese, 차이: c.distinction })),
  )
  for (const [name, rows, header] of [
    [
      senseSheet,
      sensesRows,
      ['용법ID', '단어ID', '버전', '뜻', '힌트', '단어검수', '유의어검수', '다양성검수'],
    ],
    [
      exampleSheet,
      examplesRows,
      ['용법ID', '예문ID', '버전', '앞문장', '정답', '뒷문장', '읽기', '번역', '강조', '난도', '검수'],
    ],
    [confusionSheet, confusionsRows, ['용법ID', '혼동표현', '차이']],
  ] as const) {
    const sheet = xlsx.utils.json_to_sheet([...rows], { header: [...header] })
    sheet['!cols'] = header.map((h) => ({
      wch: ['힌트', '번역', '차이', '앞문장', '뒷문장'].includes(h) ? 48 : 22,
    }))
    xlsx.utils.book_append_sheet(workbook, sheet, name)
  }
}

export function parseLearnSheets(workbook: WorkBook, xlsx: Xlsx): LearnSense[] | undefined {
  if (![senseSheet, exampleSheet, confusionSheet].some((name) => workbook.Sheets[name])) return undefined
  if (![senseSheet, exampleSheet, confusionSheet].every((name) => workbook.Sheets[name]))
    throw new Error('예문 시트가 누락되었습니다.')
  const rows = (name: string) =>
    xlsx.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: '' })
  const text = (r: Record<string, unknown>, key: string) => String(r[key] ?? '')
  const flag = (r: Record<string, unknown>, key: string) =>
    r[key] === true || String(r[key]).toLowerCase() === 'true'
  const senses: LearnSense[] = rows(senseSheet).map((r) => ({
    id: text(r, '용법ID'),
    wordId: text(r, '단어ID'),
    version: Number(r['버전']),
    meaning: text(r, '뜻'),
    hint: text(r, '힌트'),
    review: { word: flag(r, '단어검수'), contrast: flag(r, '유의어검수'), diversity: flag(r, '다양성검수') },
    confusions: [],
    examples: [],
  }))
  const map = new Map(senses.map((s) => [s.id, s]))
  if (map.size !== senses.length) throw new Error('용법 ID가 중복되었습니다.')
  for (const r of rows(confusionSheet)) {
    const sense = map.get(text(r, '용법ID'))
    if (!sense) throw new Error('혼동 표현의 용법이 없습니다.')
    sense.confusions.push({ japanese: text(r, '혼동표현'), distinction: text(r, '차이') })
  }
  for (const r of rows(exampleSheet)) {
    const sense = map.get(text(r, '용법ID'))
    if (!sense) throw new Error('예문의 용법이 없습니다.')
    if (!['draft', 'reviewed'].includes(text(r, '검수'))) throw new Error('예문 검수 상태 오류')
    sense.examples.push({
      id: text(r, '예문ID'),
      version: Number(r['버전']),
      before: text(r, '앞문장'),
      answer: text(r, '정답'),
      after: text(r, '뒷문장'),
      reading: text(r, '읽기'),
      translation: text(r, '번역'),
      translationTarget: text(r, '강조'),
      difficulty: Number(r['난도']),
      status: text(r, '검수') as 'draft' | 'reviewed',
    })
  }
  return senses
}
