import { comparisonPairs, comparisonWords, comparisonWordbooks, themeWords, themeWordbooks, vocabularySets, vocabularyWords } from '@/features/vocab/data'
import type { ComparisonPair, SelectableWordbook, StudyComparisonItem, StudyItem, StudyWordItem, ThemeWordbookTopic, VocabularySet, VocabularyWord, WordbookKind } from '@/features/vocab/model/types'

export const allSets = vocabularySets
export const allBasicWords = vocabularyWords
export const allThemeWords = themeWords
export const allComparisonWords = comparisonWords
export const allNonComparisonWords = [...allBasicWords, ...allThemeWords]
export const allWords = [...allNonComparisonWords, ...allComparisonWords]
export const allThemeWordbooks = themeWordbooks
export const allComparisonWordbooks = comparisonWordbooks

const setMap = new Map<string, VocabularySet>(allSets.map((set) => [set.id, set]))
const wordMap = new Map<string, VocabularyWord>(allWords.map((word) => [word.id, word]))
const themeWordMap = new Map<string, VocabularyWord>(allThemeWords.map((word) => [word.id, word]))
const comparisonWordMap = new Map<string, VocabularyWord>(allComparisonWords.map((word) => [word.id, word]))
const themeWordbookMap = new Map(allThemeWordbooks.map((wordbook) => [wordbook.id, wordbook]))
const comparisonPairMap = new Map<string, ComparisonPair>(comparisonPairs.map((pair) => [pair.id, pair]))
const comparisonWordbookMap = new Map(allComparisonWordbooks.map((wordbook) => [wordbook.id, wordbook]))

function buildWordSearchText(word: VocabularyWord) {
  return [word.japanese, word.reading, word.meaning].join(' ').toLowerCase()
}

function buildWordStudyItem(word: VocabularyWord, topic?: ThemeWordbookTopic): StudyWordItem {
  return {
    id: word.id,
    kind: 'word',
    word,
    searchText: buildWordSearchText(word),
    favoriteWordIds: [word.id],
    topicId: topic?.id,
    topicName: topic?.name,
    topicOrder: topic?.order,
  }
}

function buildComparisonStudyItem(pair: ComparisonPair): StudyComparisonItem | null {
  const leftWord = comparisonWordMap.get(pair.leftWordId)
  const rightWord = comparisonWordMap.get(pair.rightWordId)

  if (!leftWord || !rightWord) {
    return null
  }

  return {
    id: pair.id,
    kind: 'comparison',
    pair,
    leftWord,
    rightWord,
    searchText: [
      leftWord.japanese,
      leftWord.reading,
      leftWord.meaning,
      pair.leftDescription,
      rightWord.japanese,
      rightWord.reading,
      rightWord.meaning,
      pair.rightDescription,
    ].join(' ').toLowerCase(),
    favoriteWordIds: [leftWord.id, rightWord.id],
  }
}

const studyItemMap = new Map<string, StudyItem>([
  ...allWords.map((word) => [word.id, buildWordStudyItem(word)] as const),
  ...comparisonPairs
    .map((pair) => buildComparisonStudyItem(pair))
    .filter((item): item is StudyComparisonItem => item !== null)
    .map((item) => [item.id, item] as const),
])

const selectableWordbooks: SelectableWordbook[] = [
  ...allSets.map((set) => ({
    id: set.id,
    name: set.name,
    order: set.order,
    kind: 'basic' as const,
    itemCount: set.wordIds.length,
    updatedAt: set.updatedAt,
  })),
  ...allThemeWordbooks.map((wordbook) => ({
    id: wordbook.id,
    name: wordbook.name,
    order: 1000 + wordbook.order,
    kind: 'theme' as const,
    itemCount: allThemeWords.filter((word) => word.setId === wordbook.id).length,
    updatedAt: wordbook.updatedAt,
  })),
  ...allComparisonWordbooks.map((wordbook) => ({
    id: wordbook.id,
    name: wordbook.name,
    order: 2000 + wordbook.order,
    kind: 'compare' as const,
    itemCount: wordbook.pairIds.length,
    updatedAt: wordbook.updatedAt,
  })),
]

export const allSelectableWordbooks = selectableWordbooks

export function getSetById(setId: string) {
  return setMap.get(setId)
}

export function normalizeSelectableSetId(setId: string | 'all' | 'favorites') {
  if (setId === 'all' || setId === 'favorites') {
    return setId
  }

  return setMap.has(setId) || themeWordbookMap.has(setId) || comparisonWordbookMap.has(setId) ? setId : 'all'
}

export function getWordById(wordId: string) {
  return wordMap.get(wordId)
}

export function getWordsForSet(setId: string | 'all' | 'favorites', favoriteIds: string[] = []) {
  if (setId === 'all') return allWords
  if (setId === 'favorites') {
    return allWords.filter((word) => favoriteIds.includes(word.id))
  }
  if (themeWordbookMap.has(setId)) {
    return themeWordbookMap.get(setId)!.topics
      .sort((left, right) => left.order - right.order)
      .flatMap((topic) =>
        topic.wordIds
          .map((wordId) => themeWordMap.get(wordId))
          .filter((word): word is VocabularyWord => word !== undefined),
      )
  }
  if (comparisonWordbookMap.has(setId)) {
    return allComparisonWords.filter((word) => word.setId === setId)
  }
  return allBasicWords.filter((word) => word.setId === setId)
}

export function getSetName(setId: string | 'all' | 'favorites') {
  if (setId === 'all') return '전체 세트'
  if (setId === 'favorites') return '즐겨찾기 단어장'
  if (themeWordbookMap.has(setId)) return themeWordbookMap.get(setId)?.name ?? '주제 단어장'
  if (comparisonWordbookMap.has(setId)) return comparisonWordbookMap.get(setId)?.name ?? '비교 단어장'
  return getSetById(setId)?.name ?? '세트'
}

export function getWordbookKind(wordbookId: string): WordbookKind {
  if (themeWordbookMap.has(wordbookId)) return 'theme'
  if (comparisonWordbookMap.has(wordbookId)) return 'compare'
  return 'basic'
}

export function isComparisonWordbook(wordbookId: string) {
  return comparisonWordbookMap.has(wordbookId)
}

export function isComparisonWord(wordId: string) {
  const word = wordMap.get(wordId)
  return word ? comparisonWordbookMap.has(word.setId) : false
}

export function filterNonComparisonWordIds(wordIds: string[]) {
  return wordIds.filter((wordId) => !isComparisonWord(wordId))
}

export function getComparisonPairById(pairId: string) {
  return comparisonPairMap.get(pairId)
}

export function getStudyItemById(itemId: string) {
  return studyItemMap.get(itemId)
}

export function getStudyItemsForSet(setId: string | 'all' | 'favorites', favoriteIds: string[] = []) {
  if (setId === 'all') {
    return allWords.map((word) => getStudyItemById(word.id)).filter((item): item is StudyItem => item !== undefined)
  }

  if (setId === 'favorites') {
    return allWords
      .filter((word) => favoriteIds.includes(word.id))
      .map((word) => getStudyItemById(word.id))
      .filter((item): item is StudyItem => item !== undefined)
  }

  if (comparisonWordbookMap.has(setId)) {
    return comparisonWordbookMap
      .get(setId)!
      .pairIds
      .map((pairId) => getStudyItemById(pairId))
      .filter((item): item is StudyItem => item !== undefined)
  }

  if (themeWordbookMap.has(setId)) {
    return themeWordbookMap.get(setId)!.topics
      .sort((left, right) => left.order - right.order)
      .flatMap((topic) =>
        topic.wordIds
          .map((wordId) => themeWordMap.get(wordId))
          .filter((word): word is VocabularyWord => word !== undefined)
          .map((word) => buildWordStudyItem(word, topic)),
      )
  }

  return getWordsForSet(setId, favoriteIds)
    .map((word) => getStudyItemById(word.id))
    .filter((item): item is StudyItem => item !== undefined)
}

export function isStudyItemFavorite(item: StudyItem, favoriteIds: string[]) {
  return item.favoriteWordIds.some((wordId) => favoriteIds.includes(wordId))
}

export function getStudyItemFavoriteWordIds(item: StudyItem) {
  return [...item.favoriteWordIds]
}

export function getStudyItemSearchText(item: StudyItem) {
  return item.searchText
}

export function getStudyItemPartLabel(item: StudyItem) {
  if (item.kind === 'comparison') {
    return '비교'
  }

  switch (item.word.type) {
    case 'verb':
      if (item.word.verbInfo?.includes('1')) return '1동사'
      if (item.word.verbInfo?.includes('2')) return '2동사'
      if (item.word.verbInfo?.includes('3')) return '3동사'
      return '동사'
    case 'noun':
      return '명사'
    case 'i_adj':
      return 'い형'
    case 'na_adj':
      return 'な형'
    case 'adv':
      return '부사'
    case 'expression':
      return '표현'
    default:
      return '기타'
  }
}

export function getStudyItemQuestionText(item: StudyItem) {
  if (item.kind === 'comparison') {
    return `${item.leftWord.meaning} / ${item.rightWord.meaning}`
  }

  return item.word.meaning
}

export function getStudyItemAnswerText(item: StudyItem) {
  if (item.kind === 'comparison') {
    return `${item.leftWord.japanese} / ${item.rightWord.japanese}`
  }

  return item.word.japanese
}

export function getStudyItemAnswerSubtext(item: StudyItem) {
  if (item.kind === 'comparison') {
    return `${item.leftWord.reading} / ${item.rightWord.reading}`
  }

  return item.word.reading
}

export function getStudyItemWrongAnswerWordIds(itemId: string) {
  const item = getStudyItemById(itemId)

  if (!item) {
    return []
  }

  return [...item.favoriteWordIds]
}

export function getSelectableWordbooks() {
  return [...allSelectableWordbooks].sort((left, right) => left.order - right.order)
}

export function getStudySelectableWordbooks() {
  return getSelectableWordbooks().filter((wordbook) => wordbook.kind !== 'compare')
}

export function hasStudyItemTopic(item: StudyItem) {
  return item.kind === 'word' && Boolean(item.topicName)
}
