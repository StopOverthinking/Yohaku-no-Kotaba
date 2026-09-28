export type LearnExample = {
  id: string
  version: number
  before: string
  answer: string
  after: string
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

export type ReviewProfile = {
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
export type ContextState = {
  version: 2
  revision: number
  level: LearnerLevel
  profiles: Record<string, ReviewProfile>
  session: ContextSession | null
  history: ContextUndo[]
}
