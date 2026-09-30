/** Exact Dice verification after globally ordered Jaccard prefix filtering.
 * Jaccard = Dice / (2 - Dice). Prefix filtering is lossless for this threshold.
 * Common sentence endings are ordered last, avoiding enormous posting lists.
 */
export function findSimilarSentences(entries, threshold = 0.7) {
  if (!(threshold > 0 && threshold <= 1)) throw new Error('Threshold must be in (0, 1]')
  const normalize = (s) => s.replace(/[\s、。！？「」『』,.!?]/g, '')
  const rows = entries.map((e, index) => {
    const normalized = normalize(e.masked)
    const grams = new Set(Array.from({ length: Math.max(0, normalized.length - 1) }, (_, i) => normalized.slice(i, i + 2)))
    return { ...e, index, normalized, grams }
  })
  const frequencies = new Map()
  for (const row of rows) for (const gram of row.grams) frequencies.set(gram, (frequencies.get(gram) ?? 0) + 1)
  const order = (a, b) => frequencies.get(a) - frequencies.get(b) || a.localeCompare(b)
  const posting = new Map(), exact = new Map(), output = []
  const jaccard = threshold / (2 - threshold)
  let comparisons = 0
  for (const row of [...rows].sort((a, b) => a.grams.size - b.grams.size || a.index - b.index)) {
    const sorted = [...row.grams].sort(order)
    const prefix = sorted.slice(0, sorted.length - Math.ceil(jaccard * sorted.length) + 1)
    const candidates = new Set(exact.get(row.normalized) ?? [])
    for (const gram of prefix) for (const candidate of posting.get(gram) ?? []) {
      if (candidate.grams.size >= Math.ceil(jaccard * row.grams.size)) candidates.add(candidate)
    }
    for (const other of candidates) {
      comparisons++
      let overlap = 0
      for (const gram of other.grams) if (row.grams.has(gram)) overlap++
      const score = 2 * overlap / (row.grams.size + other.grams.size || 1)
      if (row.normalized !== other.normalized && score < threshold) continue
      const [a, b] = other.index < row.index ? [other, row] : [row, other]
      output.push({ a: a.id, b: b.id, score: Number(score.toFixed(3)), sentences: [a.masked, b.masked] })
    }
    for (const gram of prefix) {
      if (!posting.has(gram)) posting.set(gram, [])
      posting.get(gram).push(row)
    }
    if (!exact.has(row.normalized)) exact.set(row.normalized, [])
    exact.get(row.normalized).push(row)
  }
  return { similar: output, comparisons }
}
