import type { VocabularySet, VocabularyWord } from './types'

/** Membership order is also the order used by saved study ranges. */
export function resolveSetWords(
  set: Pick<VocabularySet, 'wordIds'> | undefined,
  words: ReadonlyMap<string, VocabularyWord>,
): VocabularyWord[] {
  const seen = new Set<string>()
  const result: VocabularyWord[] = []
  for (const id of set?.wordIds ?? []) {
    const word = words.get(id)
    if (word && !seen.has(id)) { seen.add(id); result.push(word) }
  }
  return result
}

export function normalizeSetMembership(set: VocabularySet, words: VocabularyWord[]): string[] {
  const owned = words.filter((word) => word.setId === set.id).map((word) => word.id)
  if (set.membershipMode !== 'explicit') return owned
  const known = new Set(words.map((word) => word.id))
  // Keep established range positions; new owned words are appended after references.
  return [...new Set([...set.wordIds.filter((id) => known.has(id)), ...owned])]
}
