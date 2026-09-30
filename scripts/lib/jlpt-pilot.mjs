import { createHash } from 'node:crypto'

export const hashContent = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function aliasCandidateMembers(proposals) {
  const members = new Set()
  for (const proposal of proposals) if (proposal.aliasCandidateIds?.length) {
    members.add(proposal.wordId)
    proposal.aliasCandidateIds.forEach(id => members.add(id))
  }
  return members
}
const normalize = (s) => s.normalize('NFKC').trim()
export const wordKey = (w) => `${normalize(w.japanese)}|${normalize(w.reading)}`
// A na-adjective's final copula does not make a new lexical item.
export const lexicalKey = (w) => w.type === 'na_adj' && normalize(w.japanese).endsWith('だ') && normalize(w.reading).endsWith('だ')
  ? `${normalize(w.japanese).slice(0, -1)}|${normalize(w.reading).slice(0, -1)}`
  : wordKey(w)

export function expandBatchReview(record, vocabulary, manuscript) {
  if (Array.isArray(record)) return record
  if (record.schemaVersion !== 2 || record.sourceHash !== hashContent({ vocabulary, manuscript }))
    throw new Error('source changed since review')
  return record.entries.map(([wordId, contentHash]) => ({ ...record.review, wordId, contentHash }))
}

export function appendReviewedMembership(currentIds, priorIds, nextIds) {
  if (JSON.stringify(currentIds) !== JSON.stringify(priorIds)) throw new Error('refusing to replace changed membership')
  if (priorIds.some((id, index) => nextIds[index] !== id)) throw new Error('append-only import cannot remove or reorder published words')
  if (new Set(nextIds).size !== nextIds.length) throw new Error('duplicate membership')
  return [...nextIds]
}

// Reference words may have been appended between two authored batches. Preserve
// that published order so saved numeric study ranges still refer to the same words.
export function appendReviewedSources(currentIds, priorIds, nextIds, referenceIds = [], publishedOrder = priorIds) {
  appendReviewedMembership(priorIds, priorIds, nextIds)
  const authored = new Set(priorIds), references = new Set(referenceIds)
  if (references.size !== referenceIds.length || referenceIds.some((id) => authored.has(id)))
    throw new Error('duplicate approved reference')
  if (publishedOrder.length !== priorIds.length + referenceIds.length ||
      new Set(publishedOrder).size !== publishedOrder.length ||
      JSON.stringify(publishedOrder.filter((id) => authored.has(id))) !== JSON.stringify(priorIds) ||
      JSON.stringify(publishedOrder.filter((id) => references.has(id))) !== JSON.stringify(referenceIds))
    throw new Error('published membership does not match approved sources')
  return appendReviewedMembership(currentIds, publishedOrder,
    [...publishedOrder, ...nextIds.slice(priorIds.length)])
}

// aliasGroups must be the result of buildReviewedAliases against these sources.
export function validateLegacyMembership(reviews, words, senses, baselineWords, aliasGroups = []) {
  const originals = new Set(baselineWords.map((word) => word.id))
  const byId = new Map(words.map((word) => [word.id, word]))
  const contentByWord = new Map(), keyMembers = new Map()
  for (const sense of senses) {
    if (!contentByWord.has(sense.wordId)) contentByWord.set(sense.wordId, [])
    contentByWord.get(sense.wordId).push(sense)
  }
  for (const word of words) {
    const key = lexicalKey(word)
    if (!keyMembers.has(key)) keyMembers.set(key, [])
    keyMembers.get(key).push(word.id)
  }
  const seen = new Set(), keys = new Set()
  return reviews.map((review) => {
    const word = byId.get(review.wordId)
    const content = contentByWord.get(review.wordId) ?? []
    if (!word || !originals.has(word.id) || seen.has(word.id)) throw new Error('invalid legacy membership ID')
    if (review.scope !== 'legacy-reference-publication' || review.outcome !== 'accepted' ||
        review.model !== 'gpt-6-astra' || review.reasoningEffort !== 'high' ||
        !/^N[1-5]$/.test(review.level) || !review.reviewedAt || !review.notes?.length)
      throw new Error(`${word.id}: explicit reference approval required`)
    if (hashContent({ word, senses: content }) !== review.sourceHash)
      throw new Error(`${word.id}: legacy source changed since reference review`)
    // A duplicate may be referenced only after an independent, active profile
    // mapping AND a separate level-publication approval of its representative.
    const key = lexicalKey(word)
    const group = aliasGroups.find(group => group.members.some(member => member.wordId === word.id))
    const groupMembers = new Set(group?.members.map(member => member.wordId))
    if (keys.has(key) || (group ? group.representativeWordId !== word.id || review.aliasGroupId !== group.id ||
        keyMembers.get(key).some(id => !groupMembers.has(id)) : keyMembers.get(key).length !== 1 || review.aliasGroupId))
      throw new Error(`${word.id}: alias group requires separate migration`)
    if (!content.length || content.some((sense) => !sense.review.word || !sense.review.contrast || !sense.review.diversity ||
        !sense.examples.length || sense.examples.some((example) => example.status !== 'reviewed')))
      throw new Error(`${word.id}: incomplete legacy content`)
    seen.add(word.id); keys.add(key)
    return { id: word.id, level: review.level, sourceHash: review.sourceHash }
  })
}

function marked(text, label) {
  const parts = text.match(/^([^《》]*)《([^《》]+)》([^《》]*)$/u)
  if (!parts) throw new Error(`${label}: exactly one marked answer is required`)
  return { before: parts[1], answer: parts[2], after: parts[3] }
}

export function parseManuscript(text, level, candidates, exampleVersions = {}) {
  if (!/^N[1-5]$/.test(level)) throw new Error('Invalid level')
  // Index once per manuscript instead of scanning the full dictionary for each word.
  // Keep every matching entry: homographs still require an explicit dictionary ID.
  const dictionary = new Map()
  for (const candidate of candidates) {
    for (const form of new Set([...candidate.spellings, ...candidate.readings])) {
      for (const reading of new Set(candidate.readings)) {
        const key = `${form}\0${reading}`
        if (!dictionary.has(key)) dictionary.set(key, [])
        dictionary.get(key).push(candidate)
      }
    }
  }
  const entries = []
  for (const line of text.split(/\r?\n/u).filter((l) => l.trim())) {
    const fields = line.replace(/^@/, '').split('|')
    if (line.startsWith('@')) {
      if (![7, 8].includes(fields.length) || fields.some((v) => !v.trim())) throw new Error(`Incomplete entry: ${line}`)
      const [japanese, reading, type, meaning, hint, confusion, distinction, dictionaryId] = fields
      const matches = (dictionary.get(`${japanese}\0${reading}`) ?? [])
        .filter((candidate) => !dictionaryId || candidate.id === dictionaryId)
      if (matches.length !== 1) throw new Error(`${japanese}: dictionary entry needs disambiguation (${matches.length})`)
      const source = matches[0]
      const id = `lex-${source.id}`
      // Use the leading ordinary sense, without grammar from rare secondary senses.
      const pos = source.senses[0].pos
      let verbInfo = null
      if (type === 'verb') {
        const group = pos.some((p) => p.includes('Ichidan')) ? '2'
          : pos.some((p) => p.includes('Godan')) ? '1'
          : pos.some((p) => p === 'Kuru verb - special class' || p.startsWith('suru verb - ')) ? '3' : null
        if (!group) throw new Error(`${japanese}: verb group needs review`)
        const transitive = pos.includes('transitive verb'), intransitive = pos.includes('intransitive verb')
        verbInfo = group + (transitive && intransitive ? '자타' : transitive ? '타' : intransitive ? '자' : '')
      }
      if (!['noun', 'verb', 'i_adj', 'na_adj', 'adv', 'expression', 'other'].includes(type)) throw new Error(`Invalid type: ${type}`)
      entries.push({
        level,
        word: { id, setId: `jlpt-level-${level.toLowerCase()}`, japanese, reading, meaning, type,
          difficulty: null, verbInfo, sourceOrder: entries.length },
        sense: { id: `sense-${id}-1`, wordId: id, version: 1, meaning, hint,
          confusions: [{ japanese: confusion, distinction }],
          review: { word: false, contrast: false, diversity: false }, examples: [] },
        source: { dictionary: source.id, proposedLevel: source.proposedLevel,
          levelEvidence: source.levelEvidence, assignment: 'editorial-estimate' },
      })
    } else {
      const entry = entries.at(-1)
      if (!entry || fields.length !== 4) throw new Error(`Unexpected example: ${line}`)
      const [question, reading, korean, difficulty] = fields
      const sentence = marked(question, entry.word.japanese)
      const translation = marked(korean, entry.word.japanese)
      if (!reading || !Number.isFinite(Number(difficulty))) throw new Error('Invalid reading/difficulty')
      const surrounding = sentence.before + sentence.after
      for (const answer of [sentence.answer, entry.word.japanese])
        if (surrounding.includes(answer)) throw new Error(`${entry.word.japanese}: answer exposed`)
      entry.sense.examples.push({ id: `${entry.sense.id}-ex-${entry.sense.examples.length + 1}`, version: 1,
        ...sentence, reading, translation: translation.before + translation.answer + translation.after,
        translationTarget: translation.answer, difficulty: Number(difficulty), status: 'draft' })
    }
  }
  const keys = new Set(), ids = new Set(), masked = new Map()
  for (const entry of entries) {
    if (entry.sense.examples.length < 1) throw new Error(`${entry.word.japanese}: at least one authored example required`)
    if (keys.has(wordKey(entry.word)) || ids.has(entry.word.id)) throw new Error('Duplicate word')
    keys.add(wordKey(entry.word)); ids.add(entry.word.id)
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(entry.sense.hint)) throw new Error('Hint reveals Japanese')
    for (const e of entry.sense.examples) {
      if (Object.hasOwn(exampleVersions, e.id)) {
        const version = exampleVersions[e.id]
        if (!Number.isInteger(version) || version < 2) throw new Error(`${e.id}: invalid example revision`)
        e.version = version
      }
      const key = `${e.before}□${e.after}`.replace(/[\s、。！？「」]/g, '')
      if (masked.has(key)) throw new Error(`Duplicate masked sentence: ${e.id} and ${masked.get(key)} (${key})`)
      masked.set(key, e.id)
    }
    entry.word.difficulty = [...entry.sense.examples.map((e) => e.difficulty)].sort((a, b) => a - b)[Math.floor(entry.sense.examples.length / 2)]
    entry.contentHash = hashContent({ word: entry.word, sense: entry.sense, level: entry.level })
  }
  return entries
}

export function applyReview(entry, review) {
  if (!review || review.contentHash !== entry.contentHash || review.outcome !== 'accepted' ||
      !review.method || !review.reviewer || !review.reviewedAt || !review.notes?.length)
    throw new Error(`${entry.word.japanese}: current content has no accepted review`)
  return {
    ...entry.sense,
    review: { word: true, contrast: true, diversity: true },
    examples: entry.sense.examples.map((e) => ({ ...e, status: 'reviewed' })),
  }
}

// A wording correction may change example versions without resetting word mastery.
// Semantic/sense changes and externally edited content require a different migration.
export function validateExampleRevision(oldWord, oldSense, nextWord, nextSense, publishedHash) {
  if (hashContent({ word: oldWord, sense: oldSense }) !== publishedHash)
    throw new Error('editor has diverged from reviewed publication')
  const { examples: oldExamples, ...oldMetadata } = oldSense
  const { examples: nextExamples, ...nextMetadata } = nextSense
  if (hashContent(oldWord) !== hashContent(nextWord) || hashContent(oldMetadata) !== hashContent(nextMetadata))
    throw new Error('example revision cannot change word or sense metadata')
  if (oldExamples.length !== nextExamples.length) throw new Error('example revision cannot change membership')
  let changed = 0
  for (let i = 0; i < oldExamples.length; i++) {
    const old = oldExamples[i], next = nextExamples[i]
    if (old.id !== next.id) throw new Error('example revision cannot change ID or order')
    if (hashContent(old) === hashContent(next)) continue
    if (next.version !== old.version + 1) throw new Error('changed example must advance exactly one version')
    const { version: _oldVersion, ...oldText } = old
    const { version: _nextVersion, ...nextText } = next
    if (hashContent(oldText) === hashContent(nextText)) throw new Error('revision needs a content correction')
    changed++
  }
  if (!changed) throw new Error('no corrected examples')
}
