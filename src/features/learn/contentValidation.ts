import type { LearnSense, LearnSenseIndex } from './contextTypes'

export function validateLearnContent(senses: LearnSense[], wordIds: Set<string>): string[] {
  const issues: string[] = []
  const ids = new Set<string>()
  const exampleIds = new Set<string>()
  const sentences = new Map<string, string>()
  for (const sense of senses) {
    if (!sense.id || ids.has(sense.id)) issues.push(`${sense.id}: 용법 ID 중복/누락`)
    ids.add(sense.id)
    if (!wordIds.has(sense.wordId)) issues.push(`${sense.id}: 연결 단어 없음`)
    if (!Number.isInteger(sense.version) || sense.version < 1) issues.push(`${sense.id}: 버전 오류`)
    if (sense.review.word && !sense.meaning.trim()) issues.push(`${sense.id}: 뜻 누락`)
    if (sense.review.contrast) {
      if (!sense.hint.trim()) issues.push(`${sense.id}: 힌트 누락`)
      if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(sense.hint))
        issues.push(`${sense.id}: 힌트의 일본어 노출`)
      if (
        !sense.confusions.length ||
        sense.confusions.some((c) => !c.japanese.trim() || !c.distinction.trim())
      )
        issues.push(`${sense.id}: 혼동 표현 검토 누락`)
    }
    for (const example of sense.examples) {
      const label = `${sense.id}/${example.id}`
      if (!example.id || exampleIds.has(example.id)) issues.push(`${label}: 예문 ID 중복/누락`)
      exampleIds.add(example.id)
      if (!Number.isInteger(example.version) || example.version < 1) issues.push(`${label}: 버전 오류`)
      if (!Number.isFinite(example.difficulty)) issues.push(`${label}: 난도 오류`)
      if (!['draft', 'reviewed'].includes(example.status)) issues.push(`${label}: 검수 상태 오류`)
      for (const side of ['before', 'after'] as const) {
        const parts = example[`${side}Furigana`]
        if (parts !== undefined && (!Array.isArray(parts) || parts.some((part) =>
          !part || typeof part.text !== 'string' || (part.reading !== undefined &&
            (typeof part.reading !== 'string' || !/^[\p{Script=Hiragana}ー]+$/u.test(part.reading)))
        ) || parts.map((part) => part.text).join('') !== example[side]))
          issues.push(`${label}: 후리가나 원문/읽기 오류`)
      }
      // Drafts must survive editor saves and XLSX round trips while being ineligible for study.
      if (example.status !== 'reviewed') continue
      if (!example.answer.trim() || !example.reading.trim() || !example.translation.trim())
        issues.push(`${label}: 정답/읽기/번역 누락`)
      if (!example.translationTarget || !example.translation.includes(example.translationTarget))
        issues.push(`${label}: 번역 강조 구간 오류`)
      if (!(example.before + example.after).trim()) issues.push(`${label}: 문맥 없음`)
      const masked = `${example.before}□${example.after}`.replace(/[\s、。！？「」]/g, '')
      if (sentences.has(masked)) issues.push(`${label}: 빈칸 문장 중복 (${sentences.get(masked)})`)
      sentences.set(masked, example.id)
    }
  }
  return issues
}

export function isReviewedSense(sense: LearnSenseIndex) {
  return (
    sense.review.word &&
    sense.review.contrast &&
    sense.review.diversity &&
    sense.examples.some((example) => example.status === 'reviewed')
  )
}
