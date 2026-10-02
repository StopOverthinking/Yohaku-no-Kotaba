import { validateLearnContent } from '@/features/learn/contentValidation'
import type { LearnSense } from '@/features/learn/contextTypes'
import type { ComparisonPair, ComparisonWordbook, ThemeWordbook, VocabularySet, VocabularyWord } from './types'

export type VocabSource = {
  learnContent?: LearnSense[]
  sets: VocabularySet[]
  words: VocabularyWord[]
  themeWordbooks: ThemeWordbook[]
  themeWords: VocabularyWord[]
  comparisonWordbooks: ComparisonWordbook[]
  comparisonWords: VocabularyWord[]
  comparisonPairs: ComparisonPair[]
}

/** Read-only checks: source IDs, ownership and saved range order are never normalized. */
export function validateVocabSource(source: VocabSource): string[] {
  const issues = validateLearnContent(source.learnContent ?? [], new Set([...source.words, ...source.themeWords].map(word => word.id)))
  const bookIds = new Set<string>()
  const prefixes = new Set<string>()
  const wordIds = new Set<string>()
  const pairIds = new Set<string>()
  const words = new Map(source.words.map(word => [word.id, word]))
  const themeWords = new Map(source.themeWords.map(word => [word.id, word]))
  const comparisonWords = new Map(source.comparisonWords.map(word => [word.id, word]))
  const pairs = new Map(source.comparisonPairs.map(pair => [pair.id, pair]))

  function checkId(id: string, known: Set<string>, kind: string) {
    if (!id.trim()) issues.push(`${kind}: missing ID`)
    if (known.has(id)) issues.push(`${id}: duplicate ${kind} ID`)
    known.add(id)
  }

  function checkBook(book: { id: string; wordIdPrefix?: string }) {
    checkId(book.id, bookIds, 'wordbook')
    if (!book.wordIdPrefix?.trim()) issues.push(`${book.id}: missing word ID prefix`)
    else {
      if (prefixes.has(book.wordIdPrefix)) issues.push(`${book.id}: duplicate word ID prefix`)
      prefixes.add(book.wordIdPrefix)
    }
  }

  function checkWords(entries: VocabularyWord[], ownerIds: Set<string>) {
    for (const word of entries) {
      checkId(word.id, wordIds, 'word')
      if (!ownerIds.has(word.setId)) issues.push(`${word.id}: unknown owner ${word.setId}`)
      if (word.difficulty !== null && !Number.isFinite(word.difficulty)) issues.push(`${word.id}: invalid difficulty`)
    }
  }

  function checkReferences(ids: string[], ownerId: string, resolveOwner: (id: string) => string | undefined, allowExternal = false) {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) issues.push(`${ownerId}: duplicate membership ${id}`)
      seen.add(id)
      const owner = resolveOwner(id)
      if (owner === undefined) issues.push(`${ownerId}: unknown reference ${id}`)
      else if (!allowExternal && owner !== ownerId) issues.push(`${ownerId}: foreign reference ${id}`)
    }
  }

  for (const book of [...source.sets, ...source.themeWordbooks, ...source.comparisonWordbooks]) checkBook(book)
  checkWords(source.words, new Set(source.sets.map(book => book.id)))
  checkWords(source.themeWords, new Set(source.themeWordbooks.map(book => book.id)))
  checkWords(source.comparisonWords, new Set(source.comparisonWordbooks.map(book => book.id)))

  for (const set of source.sets) checkReferences(set.wordIds, set.id, id => words.get(id)?.setId, set.membershipMode === 'explicit')
  for (const book of source.themeWordbooks) {
    for (const topic of book.topics) checkReferences(topic.wordIds, book.id, id => themeWords.get(id)?.setId)
  }
  for (const pair of source.comparisonPairs) {
    checkId(pair.id, pairIds, 'pair')
    if (!source.comparisonWordbooks.some(book => book.id === pair.bookId)) issues.push(`${pair.id}: unknown owner ${pair.bookId}`)
    for (const id of [pair.leftWordId, pair.rightWordId]) {
      const word = comparisonWords.get(id)
      if (!word) issues.push(`${pair.id}: unknown word ${id}`)
      else if (word.setId !== pair.bookId) issues.push(`${pair.id}: foreign word ${id}`)
    }
  }
  for (const book of source.comparisonWordbooks) checkReferences(book.pairIds, book.id, id => pairs.get(id)?.bookId)
  return issues
}
