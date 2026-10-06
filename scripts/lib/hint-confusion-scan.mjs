import { createHash } from 'node:crypto'

export const hintSourceHash = (words, senses) => createHash('sha256').update(JSON.stringify({ words, senses })).digest('hex')
const canonical = (text) => text.normalize('NFKC').trim()
const baseForm = (word, field) => word.type === 'na_adj' && word.japanese.endsWith('だ') && word.reading.endsWith('だ')
  ? word[field].slice(0, -1) : word[field]
const pairKey = (a, b) => [a, b].sort().join('\t')

export function meaningFragments(text) {
  // Separators inside explanatory parentheses are not independent definitions.
  const fragments = []
  let depth = 0, current = ''
  for (const char of text.normalize('NFKC')) {
    if (char === '(') depth++
    if (char === ')') depth = Math.max(0, depth - 1)
    if (!depth && /[,;·/]/u.test(char)) { fragments.push(current); current = '' }
    else current += char
  }
  fragments.push(current)
  return [...new Set(fragments.map((fragment) => fragment.replace(/\([^)]*\)/g, '').replace(/[\s.!。]/g, '')).filter((fragment) => fragment.length >= 2))]
}

export function scanHintConfusions(words, senses, candidates) {
  const byWord = new Map(words.map((word) => [word.id, word]))
  const dictionary = new Map(candidates.map((entry) => [entry.id, entry]))
  const formIndex = new Map()
  for (const entry of dictionary.values()) {
    for (const form of new Set([entry.japanese, ...entry.spellings, ...entry.readings])) {
      for (const reading of entry.readings) {
        const key = `${canonical(form)}|${canonical(reading)}`
        if (!formIndex.has(key)) formIndex.set(key, new Set())
        formIndex.get(key).add(entry.id)
      }
    }
  }
  const nodes = senses.map((sense) => {
    const word = byWord.get(sense.wordId)
    if (!word) throw new Error(`Missing word: ${sense.id}`)
    const japanese = canonical(baseForm(word, 'japanese'))
    const reading = canonical(baseForm(word, 'reading'))
    const matches = word.id.startsWith('lex-jmdict-') ? new Set([word.id.slice(4)]) : formIndex.get(`${japanese}|${reading}`)
    const dictionaryId = matches?.size === 1 ? [...matches][0] : undefined
    const entry = dictionary.get(dictionaryId)
    const frequencyBuckets = (entry?.priorities ?? []).filter((tag) => /^nf\d+$/u.test(tag)).map((tag) => Number(tag.slice(2)))
    const frequencyRank = frequencyBuckets.length ? Math.min(...frequencyBuckets) : 99
    const commonPriority = (entry?.priorities ?? []).some((tag) => /^(ichi|news|spec|gai)1$/u.test(tag))
    return { id: sense.id, wordId: word.id, japanese, reading, meaning: sense.meaning, wordMeaning: word.meaning,
      hint: sense.hint, comparisons: sense.confusions.map((entry) => canonical(entry.japanese)),
      dictionaryId, frequencyRank, commonPriority, family: `${japanese}|${reading}`, version: sense.version }
  })
  const byNode = new Map(nodes.map((node) => [node.id, node]))
  const names = new Map(), readingGroups = new Map()
  for (const node of nodes) {
    const word = byWord.get(node.wordId)
    const entry = dictionary.get(node.dictionaryId)
    const labels = new Set([word.japanese, word.reading, node.japanese, node.reading, ...(entry?.spellings ?? [])])
    for (const label of labels) {
      const key = canonical(label)
      if (!names.has(key)) names.set(key, [])
      names.get(key).push(node)
    }
    if (!readingGroups.has(node.japanese)) readingGroups.set(node.japanese, new Set())
    readingGroups.get(node.japanese).add(node.reading)
  }
  const labelFor = (node) => readingGroups.get(node.japanese).size > 1 ? `${node.japanese}（${node.reading}）` : node.japanese
  const existingPairs = new Map()
  const unmatched = [], selfOnly = []
  for (const node of nodes) {
    let distinct = false
    for (const comparison of node.comparisons) {
      const targets = names.get(comparison) ?? []
      if (!targets.length) unmatched.push({ senseId: node.id, japanese: comparison })
      for (const target of targets) {
        if (target.family === node.family) continue
        distinct = true
        const key = pairKey(node.id, target.id)
        if (!existingPairs.has(key)) existingPairs.set(key, { ids: [node.id, target.id].sort(), evidence: [] })
        existingPairs.get(key).evidence.push({ senseId: node.id, comparison })
      }
    }
    if (!distinct && node.comparisons.every((label) => [byWord.get(node.wordId).japanese, byWord.get(node.wordId).reading].includes(label)))
      selfOnly.push(node.id)
  }
  const buckets = new Map()
  const add = (key, node) => {
    if (!buckets.has(key)) buckets.set(key, new Set())
    buckets.get(key).add(node.id)
  }
  for (const node of nodes) {
    for (const fragment of new Set([...meaningFragments(node.meaning), ...meaningFragments(node.wordMeaning)])) {
      add(`ko:${fragment}`, node)
      // Inflection variants generate review candidates only; they are never accepted by a text match.
      if (fragment.endsWith('한') && fragment.length > 2) add(`ko:${fragment.slice(0, -1)}하다`, node)
      if (fragment.endsWith('함') && fragment.length > 2) add(`ko:${fragment.slice(0, -1)}하다`, node)
    }
    const entry = dictionary.get(node.dictionaryId)
    for (const gloss of new Set(entry?.senses.flatMap((sense) => sense.glosses) ?? [])) {
      const key = gloss.toLowerCase().replace(/\([^)]*\)/g, '').replace(/^to /, '').replace(/\s+/g, ' ').trim()
      if (key.length >= 3) add(`en:${key}`, node)
    }
  }
  const groups = []
  const allPairs = new Map()
  for (const [key, ids] of [...buckets].sort(([a], [b]) => a.localeCompare(b))) {
    const members = [...ids].map((id) => byNode.get(id))
    const missingPairs = []
    for (let a = 0; a < members.length; a++) for (let b = a + 1; b < members.length; b++) {
      if (members[a].family === members[b].family) continue
      const id = pairKey(members[a].id, members[b].id)
      if (existingPairs.has(id)) continue
      missingPairs.push(id)
      if (!allPairs.has(id)) allPairs.set(id, { ids: [members[a].id, members[b].id].sort(), evidence: [] })
      allPairs.get(id).evidence.push(key)
    }
    if (missingPairs.length) groups.push({ id: key, members: members.map((node) => node.id), pairs: missingPairs })
  }
  return { sourceHash: hintSourceHash(words, senses), nodes, existingPairs: [...existingPairs.values()],
    groups, pairs: [...allPairs.values()], unmatched, selfOnly,
    displayLabels: Object.fromEntries(nodes.map((node) => [node.id, labelFor(node)])) }
}
