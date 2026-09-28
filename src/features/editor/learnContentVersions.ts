import type { LearnSense } from '@/features/learn/contextTypes'

/** Keep accumulated recall for editorial corrections; reset only a changed target/sense. */
export function versionLearnContent(content: LearnSense[], previous: LearnSense[]): LearnSense[] {
  const old = new Map(previous.map((sense) => [sense.id, sense]))
  return content.map((sense) => {
    const baseline = old.get(sense.id)
    if (!baseline) return sense
    const oldExamples = new Map(baseline.examples.map((example) => [example.id, example]))
    const targetChanged =
      sense.wordId !== baseline.wordId ||
      sense.meaning !== baseline.meaning ||
      sense.examples.some((example) => {
        const before = oldExamples.get(example.id)
        return before && (before.answer !== example.answer || before.reading !== example.reading)
      })
    return {
      ...sense,
      version: Math.max(sense.version, baseline.version + (targetChanged ? 1 : 0)),
      examples: sense.examples.map((example) => {
        const before = oldExamples.get(example.id)
        const changed =
          before &&
          ['before', 'answer', 'after', 'reading', 'translation', 'translationTarget'].some(
            (key) => before[key as keyof typeof before] !== example[key as keyof typeof example],
          )
        return { ...example, version: Math.max(example.version, (before?.version ?? 1) + (changed ? 1 : 0)) }
      }),
    }
  })
}
