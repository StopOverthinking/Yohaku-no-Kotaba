import { hashContent } from './jlpt-pilot.mjs'

export function buildReviewedAliases(reviews, activeIds, words, senses) {
  const selected = new Set(), members = new Set()
  const wordMap = new Map(words.map(word => [word.id, word]))
  const byWord = new Map()
  for (const sense of senses) {
    if (!byWord.has(sense.wordId)) byWord.set(sense.wordId, [])
    byWord.get(sense.wordId).push(sense)
  }
  return activeIds.map(id => {
    const matches = reviews.filter(review => review.representativeWordId === id)
    const review = matches[0]
    if (selected.has(id) || matches.length !== 1 || review?.outcome !== 'accepted' ||
        review.scope !== 'same-lexeme-and-representative-usage-only' || review.profileTransfer !== 'equivalent-core-usage' ||
        review.model !== 'gpt-6-astra' || review.reasoningEffort !== 'high' ||
        !Number.isFinite(Date.parse(review.reviewedAt)) || !review.notes?.length || !Array.isArray(review.members) || review.members.length < 2 ||
        review.members.filter(member => member.wordId === id).length !== 1)
      throw new Error(`${id}: explicit equivalent-usage alias review required`)
    selected.add(id)
    const mapped = review.members.map(member => {
      const word = wordMap.get(member.wordId), content = byWord.get(member.wordId)
      if (members.has(member.wordId) || !word || content?.length !== 1 || content[0].id !== member.senseId ||
          content[0].version !== member.version || member.sourceHash !== hashContent({ word, senses: content }))
        throw new Error(`${member.wordId}: alias source changed or membership overlaps`)
      members.add(member.wordId)
      return { wordId: member.wordId, senseId: member.senseId, version: member.version }
    })
    return { id: `alias-${id}`, representativeWordId: id, members: mapped }
  })
}
