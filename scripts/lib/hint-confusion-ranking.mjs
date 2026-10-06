import { meaningFragments } from './hint-confusion-scan.mjs'

/** Rank already reviewed comparisons. Frequency never admits an unreviewed pair. */
export function rankHintLabels(node, labels, targets, preferred = []) {
  for (const label of preferred) if (!labels.includes(label))
    throw new Error(`Preferred comparison is not available in ${node.id}: ${label}`)
  const meaning = new Set(meaningFragments(node.meaning))
  const scores = new Map(labels.map((label) => {
    const matches = targets.get(label) ?? []
    const overlap = Math.max(0, ...matches.map((target) =>
      meaningFragments(target.meaning).filter((fragment) => meaning.has(fragment)).length))
    const common = matches.some((target) => target.commonPriority)
    const frequency = Math.min(99, ...matches.map((target) => target.frequencyRank ?? 99))
    return [label, [preferred.includes(label) ? preferred.indexOf(label) : Infinity,
      overlap, node.comparisons.includes(label), common, frequency]]
  }))
  return [...labels].sort((left, right) => {
    const a = scores.get(left), b = scores.get(right)
    if (a[0] !== b[0]) return a[0] - b[0]
    return b[1] - a[1] || Number(b[2]) - Number(a[2]) || Number(b[3]) - Number(a[3]) || a[4] - b[4]
      || left.localeCompare(right, 'ja')
  })
}
