import { describe, expect, it } from 'vitest'
import {
  applyPlayerAnswer,
  calculateBotSettings,
  createGameSession,
  generateQuestions,
  getTierInfo,
  normalizePronunciationInput,
  recordSingleModeResult,
  resolveMmrChange,
} from '@/features/game/gameEngine'
import type { BotHistoryEntry, SpeedQuizSetupPayload } from '@/features/game/gameTypes'
import type { VocabularyWord } from '@/features/vocab/model/types'

const words: VocabularyWord[] = [
  {
    id: 'w1',
    setId: 'all',
    japanese: '\u660e\u65e5',
    reading: '\u3042\u3057\u305f',
    meaning: 'tomorrow',
    type: 'noun',
    difficulty: 10,
    verbInfo: null,
    sourceOrder: 0,
  },
  {
    id: 'w2',
    setId: 'all',
    japanese: '\u4eca\u65e5',
    reading: '\u304d\u3087\u3046',
    meaning: 'today',
    type: 'noun',
    difficulty: 12,
    verbInfo: null,
    sourceOrder: 1,
  },
  {
    id: 'w3',
    setId: 'all',
    japanese: '\u6628\u65e5',
    reading: '\u304d\u306e\u3046',
    meaning: 'yesterday',
    type: 'noun',
    difficulty: 14,
    verbInfo: null,
    sourceOrder: 2,
  },
  {
    id: 'w4',
    setId: 'all',
    japanese: '\u5bb6',
    reading: '\u3044\u3048',
    meaning: 'house',
    type: 'noun',
    difficulty: 20,
    verbInfo: null,
    sourceOrder: 3,
  },
  {
    id: 'w5',
    setId: 'all',
    japanese: '\u5b66\u6821',
    reading: '\u304c\u3063\u3053\u3046',
    meaning: 'school',
    type: 'noun',
    difficulty: 18,
    verbInfo: null,
    sourceOrder: 4,
  },
]

const basePayload: SpeedQuizSetupPayload = {
  gameKind: 'speed_quiz',
  setId: 'all',
  setName: '전체 세트',
  mode: 'single',
  quizType: 'objective',
  playerName: '플레이어',
  sourceWords: words,
}

describe('gameEngine', () => {
  it('creates pronunciation questions as reading quizzes', () => {
    const questions = generateQuestions(words, 'pronunciation', () => 0.4)

    expect(questions).toHaveLength(words.length)
    expect(questions.every((question) => question.type === 'reading_quiz')).toBe(true)
  })

  it('normalizes romaji input into hiragana', () => {
    expect(normalizePronunciationInput('ashita')).toBe('\u3042\u3057\u305f')
    expect(normalizePronunciationInput('\u30a2\u30b7\u30bf')).toBe('\u3042\u3057\u305f')
  })

  it('creates a playable session and applies player answers', () => {
    const session = createGameSession(basePayload, [], () => 0.4)
    const question = session.questions[0]
    const result = applyPlayerAnswer(session, {
      questionId: question.id,
      isCorrect: true,
      timeTakenSeconds: 2,
    })

    expect(session.totalQuestions).toBe(words.length)
    expect(result?.nextSession.currentIndex).toBe(1)
    expect(result?.resolution.points).toBeGreaterThan(0)
  })

  it('calculates adaptive bot settings from recent history', () => {
    const history: BotHistoryEntry[] = [
      { time: 5, accuracy: 0.8 },
      { time: 6, accuracy: 0.7 },
      { time: 4, accuracy: 0.9 },
    ]

    const bot = calculateBotSettings('objective', history, () => 0.5)
    expect(bot.baseTime).toBeGreaterThan(0)
    expect(bot.accuracy).toBeGreaterThan(0)
    expect(bot.rating).toBeGreaterThanOrEqual(0)
  })

  it('sorts single mode records by score then time', () => {
    const records = recordSingleModeResult([
      { score: 100, time: 5, date: '2026. 4. 9.' },
      { score: 120, time: 7, date: '2026. 4. 8.' },
    ], 120, 4.5, new Date('2026-04-09T00:00:00Z'))

    expect(records[0]?.time).toBe(4.5)
    expect(records).toHaveLength(3)
  })

  it('resolves tier and mmr movement for bot matches', () => {
    const mmrChange = resolveMmrChange({
      previousMmr: 1000,
      botRating: 1200,
      playerScore: 1500,
      botScore: 1000,
      surrendered: false,
    })

    expect(mmrChange).toBeGreaterThan(0)
    expect(getTierInfo(1350).name).toBe('Gold')
  })
})
