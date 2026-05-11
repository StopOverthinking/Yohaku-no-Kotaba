import type { VocabularyWord } from '@/features/vocab/model/types'

export type ConjugationForm =
  | 'masu'
  | 'te'
  | 'ta'
  | 'nai'
  | 'potential'
  | 'volitional'
  | 'imperative'
  | 'prohibitive'

export type ConjugationPromptMode = 'japanese' | 'meaning'

export type VerbGroup = 'godan' | 'ichidan' | 'irregular-suru' | 'irregular-kuru'

export type ConjugationQuestion = {
  id: string
  wordId: string
  dictionaryForm: string
  reading: string
  meaning: string
  verbGroup: VerbGroup
  form: ConjugationForm
  formLabel: string
  promptMode: ConjugationPromptMode
  promptText: string
  supportText: string
  correctAnswer: string
  readingAnswer: string | null
  acceptedAnswers: string[]
  explanation: string
}

export type ConjugationAttempt = {
  userAnswer: string
  normalizedUserAnswer: string
  isCorrect: boolean
  matchedAnswer: string | null
  acceptedAnswers: string[]
  canonicalAnswer: string
  explanation: string
}

export type ConjugationSessionRecord = {
  status: 'active'
  setId: string | 'all' | 'favorites'
  setName: string
  promptMode: ConjugationPromptMode
  selectedForms: ConjugationForm[]
  questions: ConjugationQuestion[]
  attempts: Array<ConjugationAttempt | null>
  currentIndex: number
  isAnswerRevealed: boolean
  draftAnswer: string
  startedAt: string
  updatedAt: string
}

export type ConjugationWrongItem = {
  question: ConjugationQuestion
  attempt: ConjugationAttempt
}

export type ConjugationFormStat = {
  form: ConjugationForm
  label: string
  correctCount: number
  totalCount: number
}

export type ConjugationResult = {
  setId: string | 'all' | 'favorites'
  setName: string
  promptMode: ConjugationPromptMode
  selectedForms: ConjugationForm[]
  totalQuestions: number
  correctCount: number
  wrongItems: ConjugationWrongItem[]
  formStats: ConjugationFormStat[]
  completedAt: string
}

export type StartConjugationSessionPayload = {
  setId: string | 'all' | 'favorites'
  setName: string
  promptMode: ConjugationPromptMode
  selectedForms: ConjugationForm[]
  questionCount: number
  words: VocabularyWord[]
}
