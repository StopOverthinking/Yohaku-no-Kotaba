import { rankHintLabels } from './hint-confusion-ranking.mjs'
import { hintComparisonIssue } from './hint-comparison-policy.mjs'

const pairKey = (a, b) => [a, b].sort().join('\t')
const canonical = (text) => text.normalize('NFKC').trim()

export function buildHintConfusions(scan, review, words, senses) {
  if (review.schemaVersion !== 1 || review.sourceHash !== scan.sourceHash)
    throw new Error('Hint review does not match the current corpus')
  if (review.scope.words !== words.length || review.scope.senses !== senses.length)
    throw new Error('Hint review scope does not match the current corpus')
  const byId = new Map(scan.nodes.map((node) => [node.id, node]))
  const byWord = new Map(words.map((word) => [word.id, word]))
  const bySense = new Map(senses.map((sense) => [sense.id, sense]))
  const additions = new Map(), pairs = new Map(), pending = [], suppressed = []
  const add = (id, label, evidence) => {
    const sense = bySense.get(id), word = byWord.get(sense?.wordId)
    if (!sense || !word) throw new Error(`Unknown hint sense: ${id}`)
    const target = canonical(label)
    const blocked = new Set([word.japanese, word.reading,
      ...sense.examples.flatMap((example) => [example.answer, example.reading])].map(canonical))
    const qualified = target.match(/^(.+)\((.+)\)$/u)
    if (!target || blocked.has(target) || qualified &&
      qualified[1] === canonical(byId.get(id).japanese) && qualified[2] === canonical(byId.get(id).reading)) {
      suppressed.push({ senseId: id, word: label, evidence, reason: 'current answer/headword/reading' })
      return
    }
    if (!additions.has(id)) additions.set(id, new Map())
    const labels = additions.get(id)
    if (!labels.has(label)) labels.set(label, [])
    labels.get(label).push(evidence)
  }
  for (const [id, entry] of Object.entries(review.baseline)) {
    if (entry.senseVersion !== bySense.get(id)?.version) throw new Error(`Stale baseline: ${id}`)
    for (const label of entry.words) add(id, label, 'baseline')
  }
  // Retain historical reviewed candidates in provenance; the display filter below
  // excludes even a different reading when it reveals the answer's kanji.
  for (const node of scan.nodes) for (const label of node.comparisons) {
    if (label !== node.japanese) continue
    for (const target of scan.nodes.filter((other) => other.japanese === label && other.reading !== node.reading))
      add(node.id, scan.displayLabels[target.id], 'authored-different-reading')
  }
  for (const group of scan.groups) {
    const decision = review.decisions[group.id]
    if (!decision) { pending.push(group.id); continue }
    if (!['accept', 'reject'].includes(decision.status) || !decision.reason?.trim())
      throw new Error(`Invalid hint decision: ${group.id}`)
    const snapshot = review.previousGroups[group.id]
    if (!snapshot || [...snapshot].sort().join('\t') !== [...group.members].sort().join('\t'))
      throw new Error(`Stale hint group: ${group.id}`)
    for (const id of decision.excludeIds ?? []) if (!group.members.includes(id))
      throw new Error(`Unknown excluded sense in ${group.id}: ${id}`)
    if (decision.status === 'reject') continue
    const members = group.members.map((id) => byId.get(id)).filter((node) =>
      !decision.exclude?.includes(node.japanese) && !decision.excludeIds?.includes(node.id))
    if (decision.partitions && decision.sensePartitions)
      throw new Error(`Conflicting partition types in ${group.id}`)
    const groupNames = new Set(group.members.map((id) => byId.get(id).japanese))
    for (const partition of decision.partitions ?? []) for (const name of partition)
      if (!groupNames.has(name)) throw new Error(`Unknown partition word in ${group.id}: ${name}`)
    for (const partition of decision.sensePartitions ?? []) for (const id of partition)
      if (!group.members.includes(id)) throw new Error(`Unknown partition sense in ${group.id}: ${id}`)
    const partitions = decision.sensePartitions ?? decision.partitions ?? [members.map((node) => node.japanese)]
    for (const partition of partitions) {
      const selected = members.filter((node) => partition.includes(decision.sensePartitions ? node.id : node.japanese))
      for (let a = 0; a < selected.length; a++) for (let b = a + 1; b < selected.length; b++) {
        const left = selected[a], right = selected[b]
        if (left.family === right.family) continue
        const key = pairKey(left.id, right.id)
        if (!pairs.has(key)) pairs.set(key, { ids: [left.id, right.id].sort(), evidence: [] })
        pairs.get(key).evidence.push(group.id)
        add(left.id, scan.displayLabels[right.id], group.id)
        add(right.id, scan.displayLabels[left.id], group.id)
      }
    }
  }
  // Authored contrasts can also compete for the visible slots. The review and
  // provenance keep the full candidate set; only the selected labels go to the app.
  const ranked = new Map()
  for (const id of Object.keys(review.preferredComparisons ?? {})) if (!additions.has(id))
    throw new Error(`Preferred comparisons reference an unavailable sense: ${id}`)
  for (const [id, labels] of additions) {
    const node = byId.get(id), candidates = [...labels.keys()]
    for (const label of node.comparisons) {
      const word = byWord.get(node.wordId)
      if (![word.japanese, word.reading, ...bySense.get(id).examples.flatMap((e) => [e.answer, e.reading])].map(canonical).includes(label)
        && !candidates.includes(label)) candidates.push(label)
    }
    const targets = new Map(candidates.map((label) => [label, []]))
    for (const pair of pairs.values()) if (pair.ids.includes(id)) {
      const target = byId.get(pair.ids.find((other) => other !== id))
      targets.get(scan.displayLabels[target.id])?.push(target)
    }
    for (const label of node.comparisons) for (const target of scan.nodes)
      if ([target.japanese, scan.displayLabels[target.id]].includes(label)) targets.get(label)?.push(target)
    const preferred = review.preferredComparisons?.[id] ?? []
    ranked.set(id, rankHintLabels(node, candidates, targets, preferred))
  }
  // Inspect every sense, including authored-only fallback. An explicit empty list
  // prevents unsafe historical comparisons from returning when none are suitable.
  const displayAudit = scan.nodes.map((node) => {
    const sense = bySense.get(node.id), word = byWord.get(node.wordId)
    const targets = [word.japanese, word.reading, ...sense.examples.flatMap((e) => [e.answer, e.reading])]
    const candidates = [...new Set(ranked.get(node.id) ?? node.comparisons)]
    const excluded = [], safe = []
    for (const label of candidates) {
      const reason = hintComparisonIssue(label, targets)
      if (reason) {
        const record = { senseId: node.id, word: label, reason }
        suppressed.push(record)
        excluded.push({ label, reason })
      } else safe.push(label)
    }
    return { senseId: node.id, wordId: node.wordId, japanese: word.japanese, meaning: node.meaning,
      candidates, excluded, selected: safe.slice(0, review.preferredComparisons?.[node.id]?.length === 1 ? 1 : 2) }
  })
  const supplements = Object.fromEntries([...displayAudit].sort((a, b) => a.senseId.localeCompare(b.senseId)).map((entry) =>
    [entry.senseId, { senseVersion: bySense.get(entry.senseId).version, words: entry.selected }]))
  if (review.semanticChecks) {
    const checks = review.semanticChecks
    if (checks.sourceHash !== scan.sourceHash) throw new Error('Semantic hint review is stale')
    for (const [id, allowed] of Object.entries(checks.allowedSupplementLabels)) {
      if (!bySense.has(id) || !Array.isArray(allowed)) throw new Error(`Invalid semantic hint review: ${id}`)
      for (const label of additions.get(id)?.keys() ?? []) if (!allowed.includes(label))
        throw new Error(`Excluded meaning reintroduced in ${id}: ${label}`)
    }
  }
  const pendingIds = new Set(pending), pendingBySense = new Map()
  for (const group of scan.groups) if (pendingIds.has(group.id)) for (const id of group.members) {
    if (!pendingBySense.has(id)) pendingBySense.set(id, [])
    pendingBySense.get(id).push(group.id)
  }
  const coverage = scan.nodes.map((node) => ({ senseId: node.id, wordId: node.wordId, japanese: node.japanese,
    meaning: node.meaning, additionalWords: supplements[node.id]?.words ?? [],
    pendingGroups: pendingBySense.get(node.id) ?? [] }))
  return { supplements, pending, pairs: [...pairs.values()], suppressed, coverage, displayAudit,
    provenance: Object.fromEntries([...additions].map(([id, labels]) => [id, Object.fromEntries(labels)])) }
}
