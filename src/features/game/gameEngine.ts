import { BOT_NAMES } from '@/features/game/botNames'
import type {
  AnswerResolution,
  BotHistoryEntry,
  BotResolution,
  BotSettings,
  GameQuestion,
  GameQuestionType,
  GameQuizType,
  SpeedQuizSessionRecord,
  SpeedQuizSetupPayload,
  GameKind,
  SingleModeRecord,
  TierDefinition,
  TierInfo,
} from '@/features/game/gameTypes'
import { shuffleArray } from '@/lib/random'

const OBJECTIVE_QUESTION_COUNT = 30
const PRONUNCIATION_QUESTION_COUNT = 10
const OBJECTIVE_TIME_LIMIT_SECONDS = 10
const PRONUNCIATION_TIME_LIMIT_SECONDS = 20

export const TIERS: TierDefinition[] = [
  { name: 'Bronze', color: '#cd7f32', min: 0 },
  { name: 'Silver', color: '#c0c0c0', min: 500 },
  { name: 'Gold', color: '#ffd700', min: 1000 },
  { name: 'Platinum', color: '#00ced1', min: 1500 },
  { name: 'Emerald', color: '#50c878', min: 2000 },
  { name: 'Master', color: '#9932cc', min: 2500 },
  { name: 'Champion', color: '#ff4500', min: 3000 },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function getQuestionCount(quizType: GameQuizType) {
  return quizType === 'pronunciation' ? PRONUNCIATION_QUESTION_COUNT : OBJECTIVE_QUESTION_COUNT
}

export function getQuestionTimeLimit(question: GameQuestion) {
  return question.type === 'reading_quiz' ? PRONUNCIATION_TIME_LIMIT_SECONDS : OBJECTIVE_TIME_LIMIT_SECONDS
}

export function getModeLabel(mode: 'single' | 'bot') {
  return mode === 'single' ? '싱글플레이' : '멀티플레이'
}

export function getGameLabel(gameKind: GameKind = 'speed_quiz') {
  return gameKind === 'tap_match_rush' ? '탭 매치 러시' : '스피드 퀴즈'
}

export function getQuizTypeLabel(quizType: GameQuizType) {
  return quizType === 'objective' ? '객관식' : '발음 입력'
}

export function processMeaning(text: string) {
  if (!text) return ''

  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1
    else if (text[index] === ')') depth = Math.max(0, depth - 1)
    else if (text[index] === ',' && depth === 0) {
      return text.slice(0, index).trim()
    }
  }

  return text.trim()
}

function getEffectiveMeaning(text: string) {
  return text.replace(/\([^)]*\)/g, '').trim()
}

function getQuestionType(quizType: GameQuizType, random: () => number): GameQuestionType {
  if (quizType === 'pronunciation') return 'reading_quiz'
  return random() > 0.5 ? 'word_to_meaning' : 'meaning_to_word'
}

function generateOptions(question: Omit<GameQuestion, 'options'>, sourceWords: SpeedQuizSetupPayload['sourceWords'], random: () => number) {
  const correct = question.correctAnswer
  const isMeaningOptions = question.type === 'word_to_meaning'
  const selectedEffective = [isMeaningOptions ? getEffectiveMeaning(correct) : correct]
  const distractors: string[] = []
  const candidates = shuffleArray(sourceWords, Math.floor(random() * 1_000_000))

  for (const word of candidates) {
    if (distractors.length >= 4) break
    if (word.id === question.word.id) continue
    if (word.type !== question.word.type) continue
    if (question.word.type === 'verb' && question.word.verbInfo && word.verbInfo !== question.word.verbInfo) continue

    const optionText = isMeaningOptions ? processMeaning(word.meaning) : word.japanese
    const effectiveText = isMeaningOptions ? getEffectiveMeaning(optionText) : optionText
    if (selectedEffective.includes(effectiveText)) continue

    distractors.push(optionText)
    selectedEffective.push(effectiveText)
  }

  return shuffleArray([correct, ...distractors], Math.floor(random() * 1_000_000))
}

export function generateQuestions(sourceWords: SpeedQuizSetupPayload['sourceWords'], quizType: GameQuizType, random: () => number = Math.random) {
  const selectedWords = shuffleArray(sourceWords, Math.floor(random() * 1_000_000)).slice(0, Math.min(getQuestionCount(quizType), sourceWords.length))

  return selectedWords.map((word, index) => {
    const type = getQuestionType(quizType, random)
    const correctAnswer = type === 'word_to_meaning'
      ? processMeaning(word.meaning)
      : type === 'meaning_to_word'
        ? word.japanese
        : word.reading

    const question: Omit<GameQuestion, 'options'> = {
      id: `${word.id}:${type}:${index}`,
      word,
      type,
      correctAnswer,
    }

    return {
      ...question,
      options: type === 'reading_quiz' ? [] : generateOptions(question, sourceWords, random),
    }
  })
}

export function calculateQuestionScore(question: GameQuestion, timeTakenSeconds: number) {
  const difficulty = question.word.difficulty ?? 30
  const timeLimit = getQuestionTimeLimit(question)
  const boundedTime = clamp(timeTakenSeconds, 0, timeLimit)
  return Math.round((difficulty * 10) * (1 + (timeLimit - boundedTime) / timeLimit))
}

export function calculateTotalMaxScore(questions: GameQuestion[]) {
  return questions.reduce((sum, question) => {
    const difficulty = question.word.difficulty ?? 30
    return sum + (difficulty * 10 * 2)
  }, 0)
}

export function calculateBotRating(accuracy: number, baseTime: number) {
  const effectiveAccuracy = Math.max(0.3, accuracy)
  const effectiveTime = Math.min(10, Math.max(1, baseTime))
  return Math.max(0, Math.round(2800 * (effectiveAccuracy - 0.3) + 115 * (10 - effectiveTime)))
}

export function calculateBotSettings(quizType: GameQuizType, history: BotHistoryEntry[], random: () => number = Math.random): BotSettings {
  const defaultTime = quizType === 'pronunciation' ? 15 : 5
  const defaultAccuracy = quizType === 'pronunciation' ? 0.4 : 0.7
  const filledHistory = [...history]

  while (filledHistory.length < 5) {
    filledHistory.push({ time: defaultTime, accuracy: defaultAccuracy })
  }

  const recentHistory = filledHistory.slice(-5)
  const averageTime = recentHistory.reduce((sum, entry) => sum + entry.time, 0) / recentHistory.length
  const averageAccuracy = recentHistory.reduce((sum, entry) => sum + Math.min(entry.accuracy, 1), 0) / recentHistory.length
  const speedFactor = 0.7 + random() * 0.6
  const baseTime = averageTime * speedFactor
  const accuracy = clamp(averageAccuracy, 0, 1)
  const rating = calculateBotRating(accuracy, baseTime)
  const botIndex = Math.floor(random() * BOT_NAMES.length)

  return {
    name: BOT_NAMES[botIndex] ?? '상대',
    baseTime,
    accuracy,
    rating,
  }
}

export function createGameSession(
  payload: SpeedQuizSetupPayload,
  history: BotHistoryEntry[],
  random: () => number = Math.random,
): SpeedQuizSessionRecord {
  const questions = generateQuestions(payload.sourceWords, payload.quizType, random)
  const now = new Date().toISOString()
  const botSettings = payload.mode === 'bot' ? calculateBotSettings(payload.quizType, history, random) : null

  return {
    status: 'active',
    gameKind: 'speed_quiz',
    setId: payload.setId,
    setName: payload.setName,
    mode: payload.mode,
    quizType: payload.quizType,
    playerName: payload.playerName,
    totalQuestions: questions.length,
    questions,
    currentIndex: 0,
    score: 0,
    playerCorrectCount: 0,
    totalResponseTime: 0,
    totalMaxScore: calculateTotalMaxScore(questions),
    wrongWordIds: [],
    playerFinished: questions.length === 0,
    bot: botSettings ? {
      settings: botSettings,
      score: 0,
      currentIndex: 0,
      correctCount: 0,
      finished: questions.length === 0,
      surrendered: false,
    } : null,
    startedAt: now,
    updatedAt: now,
  }
}

export function normalizePronunciationInput(input: string) {
  let value = input.toLowerCase().trim()

  value = value.replace(/[\u30a1-\u30f6]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0x60))
  value = value.replace(/([ksthpmyrwgzbdfjvcq])\1/g, 'っ$1')

  const romajiMap: Array<[string, string]> = [
    ['kya', 'きゃ'], ['kyu', 'きゅ'], ['kyo', 'きょ'],
    ['sha', 'しゃ'], ['shu', 'しゅ'], ['sho', 'しょ'], ['sya', 'しゃ'], ['syu', 'しゅ'], ['syo', 'しょ'],
    ['cha', 'ちゃ'], ['chu', 'ちゅ'], ['cho', 'ちょ'], ['cya', 'ちゃ'], ['cyu', 'ちゅ'], ['cyo', 'ちょ'],
    ['tya', 'ちゃ'], ['tyu', 'ちゅ'], ['tyo', 'ちょ'],
    ['nya', 'にゃ'], ['nyu', 'にゅ'], ['nyo', 'にょ'],
    ['hya', 'ひゃ'], ['hyu', 'ひゅ'], ['hyo', 'ひょ'],
    ['mya', 'みゃ'], ['myu', 'みゅ'], ['myo', 'みょ'],
    ['rya', 'りゃ'], ['ryu', 'りゅ'], ['ryo', 'りょ'],
    ['gya', 'ぎゃ'], ['gyu', 'ぎゅ'], ['gyo', 'ぎょ'],
    ['ja', 'じゃ'], ['ju', 'じゅ'], ['jo', 'じょ'], ['jya', 'じゃ'], ['jyu', 'じゅ'], ['jyo', 'じょ'],
    ['bya', 'びゃ'], ['byu', 'びゅ'], ['byo', 'びょ'],
    ['pya', 'ぴゃ'], ['pyu', 'ぴゅ'], ['pyo', 'ぴょ'],
    ['dya', 'ぢゃ'], ['dyu', 'ぢゅ'], ['dyo', 'ぢょ'],
    ['shi', 'し'], ['si', 'し'], ['chi', 'ち'], ['ti', 'ち'], ['tsu', 'つ'], ['tu', 'つ'],
    ['fu', 'ふ'], ['hu', 'ふ'], ['ji', 'じ'], ['zi', 'じ'],
    ['ka', 'か'], ['ki', 'き'], ['ku', 'く'], ['ke', 'け'], ['ko', 'こ'],
    ['sa', 'さ'], ['su', 'す'], ['se', 'せ'], ['so', 'そ'],
    ['ta', 'た'], ['te', 'て'], ['to', 'と'],
    ['na', 'な'], ['ni', 'に'], ['nu', 'ぬ'], ['ne', 'ね'], ['no', 'の'],
    ['ha', 'は'], ['hi', 'ひ'], ['he', 'へ'], ['ho', 'ほ'],
    ['ma', 'ま'], ['mi', 'み'], ['mu', 'む'], ['me', 'め'], ['mo', 'も'],
    ['ya', 'や'], ['yu', 'ゆ'], ['yo', 'よ'],
    ['ra', 'ら'], ['ri', 'り'], ['ru', 'る'], ['re', 'れ'], ['ro', 'ろ'],
    ['wa', 'わ'], ['wo', 'を'],
    ['ga', 'が'], ['gi', 'ぎ'], ['gu', 'ぐ'], ['ge', 'げ'], ['go', 'ご'],
    ['za', 'ざ'], ['zu', 'ず'], ['ze', 'ぜ'], ['zo', 'ぞ'],
    ['da', 'だ'], ['de', 'で'], ['do', 'ど'],
    ['ba', 'ば'], ['bi', 'び'], ['bu', 'ぶ'], ['be', 'べ'], ['bo', 'ぼ'],
    ['pa', 'ぱ'], ['pi', 'ぴ'], ['pu', 'ぷ'], ['pe', 'ぺ'], ['po', 'ぽ'],
    ['va', 'ゔぁ'], ['vi', 'ゔぃ'], ['vu', 'ゔ'], ['ve', 'ゔぇ'], ['vo', 'ゔぉ'],
    ['nn', 'ん'], ['n', 'ん'],
    ['a', 'あ'], ['i', 'い'], ['u', 'う'], ['e', 'え'], ['o', 'お'],
    ['-', 'ー'],
  ]

  for (const [romaji, hira] of romajiMap) {
    value = value.replaceAll(romaji, hira)
  }

  return value
}

export function applyPlayerAnswer(
  session: SpeedQuizSessionRecord,
  params: {
    questionId: string
    isCorrect: boolean
    timeTakenSeconds: number
  },
) {
  const question = session.questions[session.currentIndex]
  if (!question || question.id !== params.questionId) return null

  const nextIndex = session.currentIndex + 1
  const playerFinished = nextIndex >= session.questions.length
  const points = params.isCorrect ? calculateQuestionScore(question, params.timeTakenSeconds) : 0

  const nextSession: SpeedQuizSessionRecord = {
    ...session,
    currentIndex: nextIndex,
    score: session.score + points,
    playerCorrectCount: session.playerCorrectCount + (params.isCorrect ? 1 : 0),
    totalResponseTime: session.totalResponseTime + params.timeTakenSeconds,
    wrongWordIds: params.isCorrect ? session.wrongWordIds : [...session.wrongWordIds, question.word.id],
    playerFinished,
    updatedAt: new Date().toISOString(),
  }

  const resolution: AnswerResolution = {
    question,
    isCorrect: params.isCorrect,
    points,
    correctAnswer: question.correctAnswer,
    playerFinished,
  }

  return { nextSession, resolution }
}

export function calculateBotSolveTimeSeconds(baseTime: number, random: () => number = Math.random) {
  const currentSpeedFactor = 0.5 + random() * 1.0
  return Math.max(baseTime * currentSpeedFactor, 1)
}

export function applyBotTurn(
  session: SpeedQuizSessionRecord,
  params: { solveTimeSeconds: number; random?: () => number },
) {
  if (!session.bot || session.bot.finished || session.bot.surrendered) return null

  const random = params.random ?? Math.random
  const question = session.questions[session.bot.currentIndex]
  if (!question) return null

  const isCorrect = random() < session.bot.settings.accuracy
  const timeLimit = getQuestionTimeLimit(question)
  const points = isCorrect && params.solveTimeSeconds <= timeLimit ? calculateQuestionScore(question, params.solveTimeSeconds) : 0
  const nextIndex = session.bot.currentIndex + 1
  const botFinished = nextIndex >= session.questions.length

  const nextSession: SpeedQuizSessionRecord = {
    ...session,
    bot: {
      ...session.bot,
      score: session.bot.score + points,
      currentIndex: nextIndex,
      correctCount: session.bot.correctCount + (isCorrect ? 1 : 0),
      finished: botFinished,
    },
    updatedAt: new Date().toISOString(),
  }

  const resolution: BotResolution = {
    question,
    isCorrect,
    points,
    botFinished,
  }

  return { nextSession, resolution }
}

export function shouldBotSurrender(session: SpeedQuizSessionRecord) {
  if (!session.bot || session.mode !== 'bot' || session.bot.finished || !session.playerFinished) return false

  const playerAccuracy = session.totalQuestions > 0 ? session.playerCorrectCount / session.totalQuestions : 0
  const botAccuracy = session.bot.currentIndex > 0 ? session.bot.correctCount / session.bot.currentIndex : 0
  const surrenderThreshold = session.quizType === 'pronunciation' ? 4 : 20

  return playerAccuracy >= botAccuracy && session.bot.currentIndex <= surrenderThreshold
}

export function getBotSurrenderDelayMs(random: () => number = Math.random) {
  return Math.round((3 + random() * 4) * 1000)
}

export function recordSingleModeResult(records: SingleModeRecord[], score: number, averageTime: number, now = new Date()) {
  if (score <= 0) return records

  const nextRecords = [...records, {
    score,
    time: averageTime,
    date: new Intl.DateTimeFormat('ko-KR').format(now),
  }]

  nextRecords.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    return left.time - right.time
  })

  return nextRecords.slice(0, 10)
}

export function recordBotHistory(history: BotHistoryEntry[], session: SpeedQuizSessionRecord, averageTime: number) {
  const minimumQuestions = session.quizType === 'pronunciation' ? 3 : 10
  if (session.currentIndex <= minimumQuestions) return history

  const accuracy = session.totalQuestions > 0 ? session.playerCorrectCount / session.totalQuestions : 0
  const nextHistory = [...history, { time: averageTime, accuracy }]
  return nextHistory.slice(-20)
}

export function getTierInfo(mmr: number): TierInfo {
  let tier = TIERS[0]

  for (let index = TIERS.length - 1; index >= 0; index -= 1) {
    if (mmr >= TIERS[index].min) {
      tier = TIERS[index]
      break
    }
  }

  if (tier.name === 'Champion') {
    return {
      ...tier,
      division: '',
      lp: mmr - tier.min,
    }
  }

  const relativeMmr = mmr - tier.min
  const divisionIndex = Math.floor(relativeMmr / 100)
  return {
    ...tier,
    division: 5 - divisionIndex,
    lp: relativeMmr % 100,
  }
}

export function getRomanNumeral(value: number | '') {
  if (value === '') return ''
  const romanMap: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' }
  return romanMap[value] ?? String(value)
}

export function resolveMmrChange(params: {
  previousMmr: number
  botRating: number
  playerScore: number
  botScore: number
  surrendered: boolean
}) {
  const expectedScore = 1 / (1 + (10 ** ((params.botRating - params.previousMmr) / 400)))
  const actualScore = params.playerScore > params.botScore ? 1 : params.playerScore < params.botScore ? 0 : 0.5
  let mmrChange = Math.round(50 * (actualScore - expectedScore))

  if (params.surrendered) mmrChange += 10
  if (actualScore === 1 && mmrChange < 10) mmrChange = 10
  if (actualScore === 0 && mmrChange > -5) mmrChange = -5

  return mmrChange
}
