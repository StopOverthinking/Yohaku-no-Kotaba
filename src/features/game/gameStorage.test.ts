import { afterEach, describe, expect, it } from 'vitest'
import {
  clearGameResult,
  clearGameSessionRecord,
  loadGameResult,
  loadGameSessionRecord,
  loadSingleModeRecords,
  loadTapMatchRushRecords,
  saveGameResult,
  saveGameSessionRecord,
  saveSingleModeRecords,
  saveTapMatchRushRecords,
} from '@/features/game/gameStorage'
import type { GameResult, GameSessionRecord } from '@/features/game/gameTypes'

describe('gameStorage', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('keeps only the top 10 single mode records', () => {
    const records = Array.from({ length: 12 }, (_, index) => ({
      score: 300 - index,
      time: 4 + index,
      date: `2026. 4. ${index + 1}.`,
    }))

    saveSingleModeRecords('objective', records)

    expect(loadSingleModeRecords('objective')).toHaveLength(10)
  })

  it('keeps only the top 10 tap match rush records', () => {
    const records = Array.from({ length: 12 }, (_, index) => ({
      totalTime: 10 + index,
      penaltySeconds: index,
      wrongAttempts: index,
      pairCount: 8,
      date: `2026. 4. ${index + 1}.`,
    }))

    saveTapMatchRushRecords(records)

    expect(loadTapMatchRushRecords()).toHaveLength(10)
  })

  it('persists and clears an active speed quiz session', () => {
    const now = new Date().toISOString()
    const session: GameSessionRecord = {
      status: 'active',
      gameKind: 'speed_quiz',
      setId: 'all',
      setName: '테스트',
      mode: 'single',
      quizType: 'objective',
      playerName: '플레이어',
      totalQuestions: 1,
      questions: [{
        id: 'q1',
        word: {
          id: 'w1',
          setId: 's1',
          japanese: '水',
          reading: 'みず',
          meaning: '물',
          type: 'noun',
          sourceOrder: 0,
          difficulty: null,
          verbInfo: null,
        },
        type: 'word_to_meaning',
        correctAnswer: '물',
        options: ['물', '불', '흙', '바람', '하늘'],
      }],
      currentIndex: 0,
      score: 0,
      playerCorrectCount: 0,
      totalResponseTime: 0,
      totalMaxScore: 100,
      wrongWordIds: [],
      playerFinished: false,
      bot: null,
      startedAt: now,
      updatedAt: now,
    }

    saveGameSessionRecord(session)
    expect(loadGameSessionRecord()).toEqual(session)

    clearGameSessionRecord()
    expect(loadGameSessionRecord()).toBeNull()
  })

  it('persists and clears the latest game result', () => {
    const result: GameResult = {
      gameKind: 'speed_quiz',
      setId: 'all',
      setName: '테스트',
      mode: 'single',
      quizType: 'objective',
      playerName: '플레이어',
      playerScore: 100,
      playerCorrectCount: 1,
      totalQuestions: 1,
      averageTime: 1.2,
      wrongWordIds: [],
      completedAt: new Date().toISOString(),
      singleRecords: [],
      bot: null,
    }

    saveGameResult(result)
    expect(loadGameResult()).toEqual(result)

    clearGameResult()
    expect(loadGameResult()).toBeNull()
  })
})
