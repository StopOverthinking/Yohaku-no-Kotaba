export type FuriganaPart = { text: string; reading?: string }
export type LearnExample = {
  id: string
  version: number
  before: string
  answer: string
  after: string
  beforeFurigana?: FuriganaPart[]
  afterFurigana?: FuriganaPart[]
  reading: string
  translation: string
  translationTarget: string
  difficulty: number
  status: 'draft' | 'reviewed'
}

export type LearnSense = {
  id: string
  wordId: string
  version: number
  meaning: string
  hint: string
  confusions: Array<{ japanese: string; distinction: string }>
  review: { word: boolean; contrast: boolean; diversity: boolean }
  examples: LearnExample[]
}

/** One or two selected display comparisons; authored content and learning versions stay intact. */
export type HintConfusions = Record<string, { senseVersion: number; words: string[] }>

/** Scheduling metadata; sentence text can be fetched separately for the visible card. */
export type LearnExampleIndex = Pick<LearnExample, 'id' | 'version' | 'difficulty' | 'status'>
export type LearnSenseIndex = Pick<LearnSense, 'id' | 'wordId' | 'version' | 'review'> & {
  examples: LearnExampleIndex[]
}

export type ReviewProfile = {
  mastered?: boolean
  senseId: string
  version: number
  due: string
  step: number
  lastDay: string
  dailyAttempts: number
  failedDay: string | null
  levelDay: string
  failedDays: number
  failures: number
  lastExampleId: string
  examples: Record<string, { seen: number; failures: number; hints: number }>
}

export type LearnerLevel = { value: number; assessedWordIds: string[] }
export type ContextAliasGroup = {
  id: string
  representativeWordId: string
  members: Array<{ wordId: string; senseId: string; version: number }>
}
export type ContextAliasMigration = {
  group: ContextAliasGroup
  day: string
  profiles: Record<string, ReviewProfile>
  level: LearnerLevel
}
export type ContextCard = { senseId: string; senseVersion: number; exampleId: string; exampleVersion: number }
export type ContextSession = {
  id: string
  setId: string
  setName: string
  candidateWordIds: string[]
  requiredWordIds: string[]
  allowEarly: boolean
  targetCount: number
  tieOrder: string[]
  cards: ContextCard[]
  round: number
  queue: ContextCard[]
  retry: ContextCard[]
  current: ContextCard
  revealed: boolean
  hintShown: boolean
  hintUsed: boolean
  decisions: number
  unknownWordIds: string[]
}

// Each undo stores only the changed profile and the small session, not the whole collection.
export type ContextUndo = {
  session: ContextSession
  level: LearnerLevel
  profileKey: string
  profile: ReviewProfile | null
}
export type ScoreChange = { before: number; after: number; completedAt: string }
export type ContextResult = {
  setId: string
  setName: string
  totalTargetCount: number
  rounds: number
  revisitedCount: number
  favoriteCount: number
  completedAt: string
  score: ScoreChange
}

export type ContextState = {
  lastScoreChange?: ScoreChange
  version: 2 | 3
  aliasMigrations?: Record<string, ContextAliasMigration>
  scheduleVersion: 4
  excludedWordIds?: string[]
  revision: number
  level: LearnerLevel
  profiles: Record<string, ReviewProfile>
  session: ContextSession | null
  history: ContextUndo[]
}
