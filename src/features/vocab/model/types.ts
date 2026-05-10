export type WordType = 'verb' | 'noun' | 'i_adj' | 'na_adj' | 'adv' | 'expression' | 'other'
export type WordbookKind = 'basic' | 'theme' | 'compare'

export interface VocabularySet {
  id: string
  name: string
  order: number
  wordIdPrefix?: string
  updatedAt?: string
  wordIds: string[]
}

export interface ThemeWordbook {
  id: string
  name: string
  order: number
  wordIdPrefix?: string
  updatedAt?: string
  kind: 'theme'
  topics: ThemeWordbookTopic[]
}

export interface ThemeWordbookTopic {
  id: string
  name: string
  order: number
  wordIds: string[]
}

export interface VocabularyWord {
  id: string
  setId: string
  japanese: string
  reading: string
  meaning: string
  type: WordType
  difficulty: number | null
  verbInfo: string | null
  sourceOrder: number
}

export interface ComparisonPair {
  id: string
  bookId: string
  leftWordId: string
  rightWordId: string
  leftDescription: string
  rightDescription: string
  sourceOrder: number
}

export interface ComparisonWordbook {
  id: string
  name: string
  order: number
  wordIdPrefix?: string
  updatedAt?: string
  kind: 'compare'
  pairIds: string[]
}

export type FrontMode = 'japanese' | 'meaning'

export type StudyWordItem = {
  id: string
  kind: 'word'
  word: VocabularyWord
  searchText: string
  favoriteWordIds: string[]
  topicId?: string
  topicName?: string
  topicOrder?: number
}

export type StudyComparisonItem = {
  id: string
  kind: 'comparison'
  pair: ComparisonPair
  leftWord: VocabularyWord
  rightWord: VocabularyWord
  searchText: string
  favoriteWordIds: string[]
}

export type StudyItem = StudyWordItem | StudyComparisonItem

export interface SelectableWordbook {
  id: string
  name: string
  order: number
  kind: WordbookKind
  itemCount: number
  updatedAt?: string
}
