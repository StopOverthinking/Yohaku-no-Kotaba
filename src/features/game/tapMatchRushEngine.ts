import type {
  TapMatchRushCard,
  TapMatchRushRecord,
  TapMatchRushSelectionResolution,
  TapMatchRushSessionRecord,
  TapMatchRushSetupPayload,
} from '@/features/game/gameTypes'
import { processMeaning } from '@/features/game/gameEngine'
import { shuffleArray } from '@/lib/random'

const TAP_MATCH_RUSH_PENALTY_SECONDS = 1

function createCards(payload: TapMatchRushSetupPayload, random: () => number) {
  const selectedWords = shuffleArray(
    payload.sourceWords,
    Math.floor(random() * 1_000_000),
  ).slice(0, Math.min(payload.pairCount, payload.sourceWords.length))

  const cards: TapMatchRushCard[] = []

  selectedWords.forEach((word, index) => {
    const pairId = `${word.id}:${index}`

    cards.push({
      id: `${pairId}:prompt`,
      pairId,
      wordId: word.id,
      lane: 'prompt',
      primaryText: word.japanese,
      secondaryText: null,
    })

    cards.push({
      id: `${pairId}:answer`,
      pairId,
      wordId: word.id,
      lane: 'answer',
      primaryText: processMeaning(word.meaning),
      secondaryText: null,
    })
  })

  return shuffleArray(cards, Math.floor(random() * 1_000_000))
}

export function createTapMatchRushSession(
  payload: TapMatchRushSetupPayload,
  random: () => number = Math.random,
): TapMatchRushSessionRecord {
  const cards = createCards(payload, random)
  const now = new Date().toISOString()

  return {
    status: 'active',
    gameKind: 'tap_match_rush',
    setId: payload.setId,
    setName: payload.setName,
    playerName: payload.playerName,
    totalPairs: cards.length / 2,
    cards,
    matchedPairIds: [],
    selectedCardId: null,
    wrongAttempts: 0,
    penaltySeconds: 0,
    wrongWordIds: [],
    playerFinished: cards.length === 0,
    startedAt: now,
    updatedAt: now,
  }
}

export function applyTapMatchRushSelection(session: TapMatchRushSessionRecord, cardId: string) {
  const card = session.cards.find((item) => item.id === cardId)
  if (!card) return null
  if (session.matchedPairIds.includes(card.pairId)) return null

  if (!session.selectedCardId) {
    const nextSession: TapMatchRushSessionRecord = {
      ...session,
      selectedCardId: card.id,
      updatedAt: new Date().toISOString(),
    }

    const resolution: TapMatchRushSelectionResolution = {
      kind: 'selected',
      cardIds: [card.id],
    }

    return { nextSession, resolution }
  }

  if (session.selectedCardId === card.id) {
    const nextSession: TapMatchRushSessionRecord = {
      ...session,
      selectedCardId: null,
      updatedAt: new Date().toISOString(),
    }

    const resolution: TapMatchRushSelectionResolution = {
      kind: 'deselected',
      cardIds: [],
    }

    return { nextSession, resolution }
  }

  const selectedCard = session.cards.find((item) => item.id === session.selectedCardId)
  if (!selectedCard) {
    const nextSession: TapMatchRushSessionRecord = {
      ...session,
      selectedCardId: card.id,
      updatedAt: new Date().toISOString(),
    }

    const resolution: TapMatchRushSelectionResolution = {
      kind: 'selected',
      cardIds: [card.id],
    }

    return { nextSession, resolution }
  }

  if (selectedCard.lane === card.lane) {
    const nextSession: TapMatchRushSessionRecord = {
      ...session,
      selectedCardId: card.id,
      updatedAt: new Date().toISOString(),
    }

    const resolution: TapMatchRushSelectionResolution = {
      kind: 'selected',
      cardIds: [card.id],
    }

    return { nextSession, resolution }
  }

  if (selectedCard.pairId === card.pairId) {
    const matchedPairIds = [...session.matchedPairIds, card.pairId]
    const playerFinished = matchedPairIds.length >= session.totalPairs
    const nextSession: TapMatchRushSessionRecord = {
      ...session,
      matchedPairIds,
      selectedCardId: null,
      playerFinished,
      updatedAt: new Date().toISOString(),
    }

    const resolution: TapMatchRushSelectionResolution = {
      kind: 'match',
      cardIds: [selectedCard.id, card.id],
      matchedPairId: card.pairId,
      playerFinished,
    }

    return { nextSession, resolution }
  }

  const wrongWordIds = Array.from(new Set([
    ...session.wrongWordIds,
    selectedCard.wordId,
    card.wordId,
  ]))

  const nextSession: TapMatchRushSessionRecord = {
    ...session,
    selectedCardId: null,
    wrongAttempts: session.wrongAttempts + 1,
    penaltySeconds: session.penaltySeconds + TAP_MATCH_RUSH_PENALTY_SECONDS,
    wrongWordIds,
    updatedAt: new Date().toISOString(),
  }

  const resolution: TapMatchRushSelectionResolution = {
    kind: 'wrong',
    cardIds: [selectedCard.id, card.id],
  }

  return { nextSession, resolution }
}

export function recordTapMatchRushResult(
  records: TapMatchRushRecord[],
  result: Omit<TapMatchRushRecord, 'date'>,
  now = new Date(),
) {
  const nextRecords = [...records, {
    ...result,
    date: new Intl.DateTimeFormat('ko-KR').format(now),
  }]

  nextRecords.sort((left, right) => {
    if (left.totalTime !== right.totalTime) return left.totalTime - right.totalTime
    if (left.wrongAttempts !== right.wrongAttempts) return left.wrongAttempts - right.wrongAttempts
    return left.penaltySeconds - right.penaltySeconds
  })

  return nextRecords.slice(0, 10)
}
