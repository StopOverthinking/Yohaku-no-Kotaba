import type {
  BotHistoryEntry,
  GameQuizType,
  GameResult,
  GameSessionRecord,
  GameSetupPayload,
  SingleModeRecord,
  TapMatchRushRecord,
} from '@/features/game/gameTypes'

const MAX_GAME_RECORDS = 10
const gameSessionKey = 'jsp-react:game-session'
const gameResultKey = 'jsp-react:game-result'
const gameLastSetupKey = 'jsp-react:game-last-setup'
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

function isGameSessionRecord(value: unknown): value is GameSessionRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<GameSessionRecord>
  if (candidate.status !== 'active' || !candidate.startedAt || !candidate.updatedAt) {
    return false
  }

  if (candidate.gameKind === 'speed_quiz') {
    return Array.isArray(candidate.questions)
      && candidate.questions.length > 0
      && typeof candidate.currentIndex === 'number'
      && typeof candidate.playerFinished === 'boolean'
  }

  if (candidate.gameKind === 'tap_match_rush') {
    return Array.isArray(candidate.cards)
      && candidate.cards.length > 0
      && Array.isArray(candidate.matchedPairIds)
      && typeof candidate.playerFinished === 'boolean'
  }

  return false
}

function isGameResult(value: unknown): value is GameResult {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<GameResult>
  return (candidate.gameKind === 'speed_quiz' || candidate.gameKind === 'tap_match_rush')
    && typeof candidate.setName === 'string'
    && typeof candidate.completedAt === 'string'
}

function isGameSetupPayload(value: unknown): value is GameSetupPayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<GameSetupPayload>
  return (candidate.gameKind === 'speed_quiz' || candidate.gameKind === 'tap_match_rush')
    && typeof candidate.setName === 'string'
    && typeof candidate.playerName === 'string'
    && Array.isArray(candidate.sourceWords)
}

export function loadGameSessionRecord() {
  const record = readJson<GameSessionRecord | null>(gameSessionKey, null)
  if (isGameSessionRecord(record)) {
    return record
  }

  if (record) {
    localStorage.removeItem(gameSessionKey)
  }

  return null
}

export function saveGameSessionRecord(record: GameSessionRecord) {
  localStorage.setItem(gameSessionKey, JSON.stringify(record))
}

export function clearGameSessionRecord() {
  localStorage.removeItem(gameSessionKey)
}

export function loadGameResult() {
  const result = readJson<GameResult | null>(gameResultKey, null)
  if (isGameResult(result)) {
    return result
  }

  if (result) {
    localStorage.removeItem(gameResultKey)
  }

  return null
}

export function saveGameResult(result: GameResult) {
  localStorage.setItem(gameResultKey, JSON.stringify(result))
}

export function clearGameResult() {
  localStorage.removeItem(gameResultKey)
}

export function loadGameLastSetup() {
  const setup = readJson<GameSetupPayload | null>(gameLastSetupKey, null)
  if (isGameSetupPayload(setup)) {
    return setup
  }

  if (setup) {
    localStorage.removeItem(gameLastSetupKey)
  }

  return null
}

export function saveGameLastSetup(setup: GameSetupPayload) {
  localStorage.setItem(gameLastSetupKey, JSON.stringify(setup))
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
