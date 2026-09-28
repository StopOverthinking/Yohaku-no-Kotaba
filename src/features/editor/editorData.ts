import comparisonPairsJson from '@/features/vocab/editor-data/comparisonPairs.json'
import comparisonWordsJson from '@/features/vocab/editor-data/comparisonWords.json'
import comparisonWordbooksJson from '@/features/vocab/editor-data/comparisonWordbooks.json'
import themeWordsJson from '@/features/vocab/editor-data/themeWords.json'
import themeWordbooksJson from '@/features/vocab/editor-data/themeWordbooks.json'
import vocabularySetsJson from '@/features/vocab/editor-data/vocabularySets.json'
import vocabularyWordsJson from '@/features/vocab/editor-data/vocabularyWords.json'
import learnContentJson from '@/features/vocab/editor-data/learnContent.json'
import type { LearnSense } from '@/features/learn/contextTypes'
import type { ComparisonPair, ComparisonWordbook, ThemeWordbook, VocabularySet, VocabularyWord, WordType } from '@/features/vocab/model/types'

export type EditorSnapshot = {
  learnContent?: LearnSense[]
  sets: VocabularySet[]
  words: VocabularyWord[]
  themeWordbooks: ThemeWordbook[]
  themeWords: VocabularyWord[]
  comparisonWordbooks: ComparisonWordbook[]
  comparisonWords: VocabularyWord[]
  comparisonPairs: ComparisonPair[]
}

export const wordTypeOptions: Array<{ value: WordType; label: string }> = [
  { value: 'verb', label: '동사' },
  { value: 'noun', label: '명사' },
  { value: 'i_adj', label: 'い형' },
  { value: 'na_adj', label: 'な형' },
  { value: 'adv', label: '부사' },
  { value: 'expression', label: '표현' },
  { value: 'other', label: '기타' },
]

export const editorVocabularySets = vocabularySetsJson as VocabularySet[]
export const editorLearnContent = learnContentJson as LearnSense[]
export const editorVocabularyWords = vocabularyWordsJson as VocabularyWord[]
export const editorThemeWordbooks = themeWordbooksJson as ThemeWordbook[]
export const editorThemeWords = themeWordsJson as VocabularyWord[]
export const editorComparisonWordbooks = comparisonWordbooksJson as ComparisonWordbook[]
export const editorComparisonWords = comparisonWordsJson as VocabularyWord[]
export const editorComparisonPairs = comparisonPairsJson as ComparisonPair[]
