import { create } from 'zustand'
import {
  applyBotTurn,
  applyPlayerAnswer,
  createGameSession,
  getTierInfo,
  recordBotHistory,
  recordSingleModeResult,
  resolveMmrChange,
} from '@/features/game/gameEngine'
import { applyTapMatchRushSelection, createTapMatchRushSession, recordTapMatchRushResult } from '@/features/game/tapMatchRushEngine'
import {
  loadBotHistory,
  loadPlayerMmr,
  loadSingleModeRecords,
  loadTapMatchRushRecords,
  saveBotHistory,
  savePlayerMmr,
  saveSingleModeRecords,
  saveTapMatchRushRecords,
} from '@/features/game/gameStorage'
import type {
  AnswerResolution,
  BotResolution,
  GameResult,
  GameSessionRecord,
  GameSetupPayload,
  SpeedQuizResult,
  TapMatchRushResult,
  TapMatchRushSelectionResolution,
} from '@/features/game/gameTypes'

type GameState = {
  session: GameSessionRecord | null
  lastResult: GameResult | null
  lastSetup: GameSetupPayload | null
  startGame: (payload: GameSetupPayload) => void
  restartLastGame: () => boolean
  recordPlayerAnswer: (params: {
    questionId: string
    isCorrect: boolean
    timeTakenSeconds: number
  }) => AnswerResolution | null
  selectTapMatchCard: (cardId: string) => TapMatchRushSelectionResolution | null
  advanceBotTurn: (params: { solveTimeSeconds: number }) => BotResolution | null
  surrenderBot: () => void
  finalizeGame: () => void
  abandonGame: () => void
  clearResult: () => void
}

export const useGameStore = create<GameState>((set, get) => ({
  session: null,
  lastResult: null,
  lastSetup: null,
  startGame: (payload) => {
    const session = payload.gameKind === 'tap_match_rush'
      ? createTapMatchRushSession(payload)
      : createGameSession(payload, payload.mode === 'bot' ? loadBotHistory(payload.quizType) : [])

    set({
      session,
      lastResult: null,
      lastSetup: payload,
    })
  },
  restartLastGame: () => {
    const lastSetup = get().lastSetup
    if (!lastSetup) return false

    get().startGame(lastSetup)
    return true
  },
  recordPlayerAnswer: (params) => {
    const session = get().session
    if (!session || session.gameKind !== 'speed_quiz') return null

    const result = applyPlayerAnswer(session, params)
    if (!result) return null

    set({ session: result.nextSession })
    return result.resolution
  },
  selectTapMatchCard: (cardId) => {
    const session = get().session
    if (!session || session.gameKind !== 'tap_match_rush') return null

    const result = applyTapMatchRushSelection(session, cardId)
    if (!result) return null

    set({ session: result.nextSession })
    return result.resolution
  },
  advanceBotTurn: (params) => {
    const session = get().session
    if (!session || session.gameKind !== 'speed_quiz') return null

    const result = applyBotTurn(session, params)
    if (!result) return null

    set({ session: result.nextSession })
    return result.resolution
  },
  surrenderBot: () => {
    const session = get().session
    if (!session || session.gameKind !== 'speed_quiz' || !session.bot) return

    set({
      session: {
        ...session,
        bot: {
          ...session.bot,
          surrendered: true,
          finished: true,
        },
      },
    })
  },
  finalizeGame: () => {
    const session = get().session
    if (!session) return

    if (session.gameKind === 'tap_match_rush') {
      const elapsedSeconds = Math.max(0, (Date.now() - new Date(session.startedAt).getTime()) / 1000)
      const totalTime = Number((elapsedSeconds + session.penaltySeconds).toFixed(2))
      const tapMatchRushRecords = recordTapMatchRushResult(loadTapMatchRushRecords(), {
        totalTime,
        penaltySeconds: session.penaltySeconds,
        wrongAttempts: session.wrongAttempts,
        pairCount: session.totalPairs,
      })

      saveTapMatchRushRecords(tapMatchRushRecords)

      const result: TapMatchRushResult = {
        gameKind: 'tap_match_rush',
        setId: session.setId,
        setName: session.setName,
        playerName: session.playerName,
        totalPairs: session.totalPairs,
        wrongAttempts: session.wrongAttempts,
        penaltySeconds: session.penaltySeconds,
        totalTime,
        wrongWordIds: session.wrongWordIds,
        completedAt: new Date().toISOString(),
        tapMatchRushRecords,
      }

      set({
        session: null,
        lastResult: result,
      })
      return
    }

    const averageTime = session.totalQuestions > 0 ? Number((session.totalResponseTime / session.totalQuestions).toFixed(2)) : 0
    const singleRecords = session.mode === 'single'
      ? recordSingleModeResult(loadSingleModeRecords(session.quizType), session.score, averageTime)
      : loadSingleModeRecords(session.quizType)

    if (session.mode === 'single') {
      saveSingleModeRecords(session.quizType, singleRecords)
    }

    let botResult: SpeedQuizResult['bot'] = null

    if (session.mode === 'bot' && session.bot) {
      const history = recordBotHistory(loadBotHistory(session.quizType), session, averageTime)
      saveBotHistory(session.quizType, history)

      const previousMmr = loadPlayerMmr(session.quizType)
      const mmrChange = resolveMmrChange({
        previousMmr,
        botRating: session.bot.settings.rating,
        playerScore: session.score,
        botScore: session.bot.score,
        surrendered: session.bot.surrendered,
      })
      const newMmr = Math.max(0, previousMmr + mmrChange)
      savePlayerMmr(session.quizType, newMmr)

      botResult = {
        name: session.bot.settings.name,
        score: session.bot.score,
        correctCount: session.bot.correctCount,
        rating: session.bot.settings.rating,
        outcome: session.score > session.bot.score ? 'win' : session.score < session.bot.score ? 'lose' : 'draw',
        surrendered: session.bot.surrendered,
        previousMmr,
        mmrChange,
        newMmr,
        tierInfo: getTierInfo(newMmr),
      }
    }

    const result: SpeedQuizResult = {
      gameKind: 'speed_quiz',
      setId: session.setId,
      setName: session.setName,
      mode: session.mode,
      quizType: session.quizType,
      playerName: session.playerName,
      playerScore: session.score,
      playerCorrectCount: session.playerCorrectCount,
      totalQuestions: session.totalQuestions,
      averageTime,
      wrongWordIds: session.wrongWordIds,
      completedAt: new Date().toISOString(),
      singleRecords,
      bot: botResult,
    }

    set({
      session: null,
      lastResult: result,
    })
  },
  abandonGame: () => set({ session: null }),
  clearResult: () => set({ lastResult: null }),
}))
