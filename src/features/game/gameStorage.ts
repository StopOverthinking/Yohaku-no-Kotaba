import type { BotHistoryEntry, GameQuizType, SingleModeRecord, TapMatchRushRecord } from '@/features/game/gameTypes'

const MAX_GAME_RECORDS = 10
const playerNicknameKey = 'jsp-react:game-player-name'
const tapMatchRushRecordsKey = 'jsp-react:game-records-tap-match-rush'
const singleRecordKeys: Record<GameQuizType, string> = {
  objective: 'jsp-react:game-records-objective',
  pronunciation: 'jsp-react:game-records-pronunciation',
}
const botHistoryKeys: Record<GameQuizType, string> = {
  objective: 'jsp-react:game-bot-history-objective',
  pronunciation: 'jsp-react:game-bot-history-pronunciation',
}
const playerMmrKeys: Record<GameQuizType, string> = {
  objective: 'jsp-react:game-mmr-objective',
  pronunciation: 'jsp-react:game-mmr-pronunciation',
}

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    localStorage.removeItem(key)
    return fallback
  }
}

export function loadPlayerNickname() {
  return localStorage.getItem(playerNicknameKey) ?? ''
}

export function savePlayerNickname(playerName: string) {
  localStorage.setItem(playerNicknameKey, playerName)
}

export function loadSingleModeRecords(quizType: GameQuizType) {
  return readJson<SingleModeRecord[]>(singleRecordKeys[quizType], []).slice(0, MAX_GAME_RECORDS)
}

export function saveSingleModeRecords(quizType: GameQuizType, records: SingleModeRecord[]) {
  localStorage.setItem(singleRecordKeys[quizType], JSON.stringify(records.slice(0, MAX_GAME_RECORDS)))
}

export function loadTapMatchRushRecords() {
  return readJson<TapMatchRushRecord[]>(tapMatchRushRecordsKey, []).slice(0, MAX_GAME_RECORDS)
}

export function saveTapMatchRushRecords(records: TapMatchRushRecord[]) {
  localStorage.setItem(tapMatchRushRecordsKey, JSON.stringify(records.slice(0, MAX_GAME_RECORDS)))
}

export function loadBotHistory(quizType: GameQuizType) {
  return readJson<BotHistoryEntry[]>(botHistoryKeys[quizType], [])
}

export function saveBotHistory(quizType: GameQuizType, history: BotHistoryEntry[]) {
  localStorage.setItem(botHistoryKeys[quizType], JSON.stringify(history))
}

export function loadPlayerMmr(quizType: GameQuizType) {
  const raw = localStorage.getItem(playerMmrKeys[quizType])
  return Math.max(0, Number.parseInt(raw ?? '0', 10) || 0)
}

export function savePlayerMmr(quizType: GameQuizType, mmr: number) {
  localStorage.setItem(playerMmrKeys[quizType], String(Math.max(0, Math.round(mmr))))
}
