import type { VocabularyWord } from '@/features/vocab/model/types'

export type GameKind = 'speed_quiz' | 'tap_match_rush'
export type GameMode = 'single' | 'bot'
export type GameQuizType = 'objective' | 'pronunciation'
export type GameQuestionType = 'word_to_meaning' | 'meaning_to_word' | 'reading_quiz'
export type GameOutcome = 'win' | 'lose' | 'draw'
export type TapMatchRushLane = 'prompt' | 'answer'

type GameBaseSetupPayload = {
  setId: string | 'all' | 'favorites'
  setName: string
  playerName: string
  sourceWords: VocabularyWord[]
}

export type SpeedQuizSetupPayload = GameBaseSetupPayload & {
  gameKind: 'speed_quiz'
  mode: GameMode
  quizType: GameQuizType
}

export type TapMatchRushSetupPayload = GameBaseSetupPayload & {
  gameKind: 'tap_match_rush'
  pairCount: number
}

export type GameSetupPayload = SpeedQuizSetupPayload | TapMatchRushSetupPayload

export type GameQuestion = {
  id: string
  word: VocabularyWord
  type: GameQuestionType
  correctAnswer: string
  options: string[]
}

export type BotHistoryEntry = {
  time: number
  accuracy: number
}

export type SingleModeRecord = {
  score: number
  time: number
  date: string
}

export type TapMatchRushRecord = {
  totalTime: number
  penaltySeconds: number
  wrongAttempts: number
  pairCount: number
  date: string
}

export type BotSettings = {
  name: string
  baseTime: number
  accuracy: number
  rating: number
}

export type TierDefinition = {
  name: string
  color: string
  min: number
}

export type TierInfo = TierDefinition & {
  division: number | ''
  lp: number
}

export type BotSessionState = {
  settings: BotSettings
  score: number
  currentIndex: number
  correctCount: number
  finished: boolean
  surrendered: boolean
}

export type SpeedQuizSessionRecord = {
  status: 'active'
  gameKind: 'speed_quiz'
  setId: string | 'all' | 'favorites'
  setName: string
  mode: GameMode
  quizType: GameQuizType
  playerName: string
  totalQuestions: number
  questions: GameQuestion[]
  currentIndex: number
  score: number
  playerCorrectCount: number
  totalResponseTime: number
  totalMaxScore: number
  wrongWordIds: string[]
  playerFinished: boolean
  bot: BotSessionState | null
  startedAt: string
  updatedAt: string
}

export type TapMatchRushCard = {
  id: string
  pairId: string
  wordId: string
  lane: TapMatchRushLane
  primaryText: string
  secondaryText: string | null
}

export type TapMatchRushSessionRecord = {
  status: 'active'
  gameKind: 'tap_match_rush'
  setId: string | 'all' | 'favorites'
  setName: string
  playerName: string
  totalPairs: number
  cards: TapMatchRushCard[]
  matchedPairIds: string[]
  selectedCardId: string | null
  wrongAttempts: number
  penaltySeconds: number
  wrongWordIds: string[]
  playerFinished: boolean
  startedAt: string
  updatedAt: string
}

export type GameSessionRecord = SpeedQuizSessionRecord | TapMatchRushSessionRecord

export type AnswerResolution = {
  question: GameQuestion
  isCorrect: boolean
  points: number
  correctAnswer: string
  playerFinished: boolean
}

export type BotResolution = {
  question: GameQuestion
  isCorrect: boolean
  points: number
  botFinished: boolean
}

export type TapMatchRushSelectionResolution =
  | { kind: 'selected'; cardIds: [string] }
  | { kind: 'deselected'; cardIds: [] }
  | { kind: 'match'; cardIds: [string, string]; matchedPairId: string; playerFinished: boolean }
  | { kind: 'wrong'; cardIds: [string, string] }

export type SpeedQuizResult = {
  gameKind: 'speed_quiz'
  setId: string | 'all' | 'favorites'
  setName: string
  mode: GameMode
  quizType: GameQuizType
  playerName: string
  playerScore: number
  playerCorrectCount: number
  totalQuestions: number
  averageTime: number
  wrongWordIds: string[]
  completedAt: string
  singleRecords: SingleModeRecord[]
  bot: {
    name: string
    score: number
    correctCount: number
    rating: number
    outcome: GameOutcome
    surrendered: boolean
    previousMmr: number
    mmrChange: number
    newMmr: number
    tierInfo: TierInfo
  } | null
}

export type TapMatchRushResult = {
  gameKind: 'tap_match_rush'
  setId: string | 'all' | 'favorites'
  setName: string
  playerName: string
  totalPairs: number
  wrongAttempts: number
  penaltySeconds: number
  totalTime: number
  wrongWordIds: string[]
  completedAt: string
  tapMatchRushRecords: TapMatchRushRecord[]
}

export type GameResult = SpeedQuizResult | TapMatchRushResult
