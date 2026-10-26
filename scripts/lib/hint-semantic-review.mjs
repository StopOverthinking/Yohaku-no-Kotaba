import { hintSourceHash } from './hint-confusion-scan.mjs'
import { hintComparisonIssue } from './hint-comparison-policy.mjs'
import { createHash } from 'node:crypto'

const canonical = (text) => text.normalize('NFKC').trim()
const labelHeadword = (text) => canonical(text).replace(/\([^)]*\)$/u, '')
const requiredText = (value) => typeof value === 'string' && value.trim().length > 0
export const dictionaryEntryHash = (entry) => createHash('sha256').update(JSON.stringify(entry)).digest('hex')
const wordForms = (word) => new Set([word.japanese,
  ...(word.type === 'na_adj' && word.japanese.endsWith('だ') && word.reading.endsWith('だ') ? [word.japanese.slice(0, -1)] : [])].map(canonical))

/** Current-sense decisions are the sole authority; old groups and authored
 * contrasts remain historical evidence and never supply display candidates. */
export function buildSemanticHintConfusions(review, words, senses, candidates, separatedSenses = []) {
  const sourceHash = hintSourceHash(words, senses)
  if (review?.schemaVersion !== 1 || review.policy !== 'current-korean-sense' || review.sourceHash !== sourceHash)
    throw new Error('Semantic hint review does not match the current corpus/policy')
  if (review.scope?.words !== words.length || review.scope?.senses !== senses.length)
    throw new Error('Semantic hint review scope does not match the current corpus')
  if (!requiredText(review.reviewer?.model) || !requiredText(review.reviewer?.reasoningEffort) || !Array.isArray(review.entries))
    throw new Error('Semantic hint review metadata is missing')
  const byWord = new Map(words.map((word) => [word.id, word]))
  const bySense = new Map([...senses, ...separatedSenses].map((sense) => [sense.id, sense]))
  const originals = new Map(senses.map((sense) => [sense.id, sense]))
  const dictionary = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const entries = new Map(), provenance = {}, displayAudit = []
  for (const entry of [...review.entries, ...(review.usageEntries ?? [])]) {
    const sense = bySense.get(entry.senseId), word = sense && byWord.get(sense.wordId)
    if (!sense || !word || entries.has(entry.senseId)) throw new Error(`Unknown/duplicate semantic hint sense: ${entry.senseId}`)
    if (!originals.has(entry.senseId)) {
      const source = originals.get(entry.sourceSenseId)
      if (!source || source.wordId !== sense.wordId || entry.sourceHash !== dictionaryEntryHash(source)
        || JSON.stringify(entry.exampleIds) !== JSON.stringify(sense.examples.map(example => example.id))
        || !sense.examples.every(example => source.examples.some(original => original.id === example.id)))
        throw new Error(`Stale separated hint source: ${entry.senseId}`)
    } else if (!review.entries.includes(entry)) throw new Error(`Usage hint must reference a separated sense: ${entry.senseId}`)
    if (entry.senseVersion !== sense.version || entry.wordId !== sense.wordId || entry.japanese !== word.japanese || entry.meaning !== sense.meaning)
      throw new Error(`Stale semantic hint decision: ${sense.id}`)
    if (entry.reviewStatus !== 'reviewed' || !['retain', 'replace', 'omit'].includes(entry.decision) || !requiredText(entry.reason)
      || !Array.isArray(entry.selected) || entry.selected.length > 2 || !Array.isArray(entry.rejected)
      || (entry.decision === 'omit') !== (entry.selected.length === 0))
      throw new Error(`Invalid semantic hint decision: ${sense.id}`)
    const targets = [word.japanese, word.reading, ...sense.examples.flatMap((example) => [example.answer, example.reading])]
    const labels = new Set()
    for (const selected of entry.selected) {
      if (!['japanese', 'reading', 'meaning', 'difference'].every((field) => requiredText(selected[field]))
        || selected.japanese !== selected.japanese.trim() || labels.has(canonical(selected.japanese)))
        throw new Error(`Invalid/duplicate semantic comparison: ${sense.id}`)
      const qualified = canonical(selected.japanese).match(/^(.+)\((.+)\)$/u)
      if (qualified && qualified[2] !== canonical(selected.reading))
        throw new Error(`Qualified comparison reading does not match evidence: ${sense.id}`)
      const issue = hintComparisonIssue(selected.japanese, targets)
      if (issue) throw new Error(`Unsafe semantic comparison in ${sense.id}: ${selected.japanese} (${issue})`)
      labels.add(canonical(selected.japanese))
      const evidence = selected.evidence
      if (evidence?.type === 'corpus') {
        if (!Array.isArray(evidence.senseIds) || !evidence.senseIds.length) throw new Error(`Missing comparison senses: ${sense.id}`)
        if (!evidence.senseIds.some((id) => bySense.get(id)?.meaning === selected.meaning))
          throw new Error(`Comparison meaning does not match cited corpus senses: ${sense.id}`)
        for (const id of evidence.senseIds) {
          const targetSense = bySense.get(id), targetWord = targetSense && byWord.get(targetSense.wordId)
          if (!targetWord || !wordForms(targetWord).has(labelHeadword(selected.japanese))
            || ![targetWord.reading, ...(targetWord.type === 'na_adj' && targetWord.japanese.endsWith('だ') && targetWord.reading.endsWith('だ')
              ? [targetWord.reading.slice(0, -1)] : [])].map(canonical).includes(canonical(selected.reading)))
            throw new Error(`Invalid corpus comparison evidence in ${sense.id}: ${id}`)
        }
      } else if (evidence?.type === 'corpus-compound') {
        const parts = evidence.parts?.map((part) => {
          const partSense = bySense.get(part.senseId), partWord = partSense && byWord.get(partSense.wordId)
          if (!partWord || partWord.type !== 'noun' || part.sourceHash !== dictionaryEntryHash({ word: partWord, sense: partSense }))
            throw new Error(`Stale/missing compound component: ${sense.id}`)
          return { word: partWord, sense: partSense }
        })
        if (!parts || parts.length < 2 || parts.length > 3
          || parts.map(part => part.word.japanese).join('') !== selected.japanese
          || parts.map(part => part.word.reading).join('') !== selected.reading
          || parts.map(part => part.sense.meaning).join(' ') !== selected.meaning
          || !requiredText(evidence.source) || !/^https:\/\//u.test(evidence.sourceUrl ?? '')
          || !requiredText(evidence.sourceText) || !evidence.sourceText.includes(selected.japanese)
          || evidence.sourceTextHash !== dictionaryEntryHash(evidence.sourceText))
          throw new Error(`Invalid compound comparison evidence: ${sense.id}`)
      } else if (evidence?.type === 'dictionary') {
        const candidate = dictionary.get(evidence.entryId)
        const derived = ['suru-verb', 'suru-polite-past'].includes(evidence.derivation)
        const naAdverb = evidence.derivation === 'na-adverb'
        if (evidence.derivation !== undefined && !derived && !naAdverb)
          throw new Error(`Unsupported dictionary derivation: ${sense.id}`)
        const suffix = evidence.derivation === 'suru-polite-past' ? 'しました' : derived ? 'する' : naAdverb ? 'に' : ''
        if (!candidate || !requiredText(evidence.source)
          || ![candidate.japanese, ...(candidate.spellings ?? []), ...(candidate.readings ?? [])].map((form) => canonical(form) + suffix).includes(labelHeadword(selected.japanese))
          || !candidate.readings.map((reading) => canonical(reading) + suffix).includes(canonical(selected.reading)))
          throw new Error(`Invalid dictionary comparison evidence in ${sense.id}: ${selected.japanese}`)
        const applicableSenses = derived || naAdverb ? candidate.senses.filter((dictionarySense) =>
          dictionarySense.pos.some((pos) => naAdverb ? /adjectival nouns|keiyodoshi/iu.test(pos) : /suru/iu.test(pos))) : candidate.senses
        const glosses = applicableSenses.flatMap((dictionarySense) => dictionarySense.glosses)
        if (evidence.entryHash !== dictionaryEntryHash(candidate) || !Array.isArray(evidence.sourceGlosses)
          || !evidence.sourceGlosses.length || evidence.sourceGlosses.some((gloss) => !requiredText(gloss) || !glosses.includes(gloss)))
          throw new Error(`Stale/missing dictionary meaning snapshot in ${sense.id}: ${selected.japanese}`)
      } else throw new Error(`Missing semantic comparison evidence: ${sense.id}`)
    }
    for (const rejected of entry.rejected) if (!requiredText(rejected.japanese) || !requiredText(rejected.reason)
      || labels.has(canonical(rejected.japanese))) throw new Error(`Invalid semantic rejection: ${sense.id}`)
    entries.set(sense.id, entry)
    provenance[sense.id] = entry.selected
    displayAudit.push({ senseId: sense.id, wordId: word.id, japanese: word.japanese, meaning: sense.meaning,
      decision: entry.decision, reason: entry.reason, candidates: entry.selected.map((item) => item.japanese),
      excluded: entry.rejected.map((item) => ({ label: item.japanese, reason: item.reason })),
      selected: entry.selected.map((item) => item.japanese) })
  }
  for (const sense of senses) if (!entries.has(sense.id)) throw new Error(`Missing semantic hint decision: ${sense.id}`)
  const supplements = Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)).map(([id, entry]) =>
    [id, { senseVersion: entry.senseVersion, words: entry.selected.map((item) => item.japanese) }]))
  const coverage = senses.map((sense) => ({ senseId: sense.id, wordId: sense.wordId, japanese: byWord.get(sense.wordId).japanese,
    meaning: sense.meaning, additionalWords: supplements[sense.id].words, pendingGroups: [] }))
  return { sourceHash, reviewHash: dictionaryEntryHash(review), reviewPolicy: review.policy, reviewer: review.reviewer, supplements, pending: [],
    coverage, displayAudit, provenance }
}

export function assertSemanticHintSynchronization(current, expected) {
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error('Hint supplements are not synchronized with the semantic review; run hint:audit -- --apply')
}
