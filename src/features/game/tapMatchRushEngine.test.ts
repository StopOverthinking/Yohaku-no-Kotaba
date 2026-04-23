import { describe, expect, it } from 'vitest'
import { applyTapMatchRushSelection, createTapMatchRushSession, recordTapMatchRushResult } from '@/features/game/tapMatchRushEngine'
import type { TapMatchRushSetupPayload } from '@/features/game/gameTypes'
import type { VocabularyWord } from '@/features/vocab/model/types'

const words: VocabularyWord[] = [
  {
    id: 'w1',
    setId: 'all',
    japanese: '明日',
    reading: 'あした',
    meaning: 'tomorrow',
    type: 'noun',
    difficulty: 10,
    verbInfo: null,
    sourceOrder: 0,
  },
  {
    id: 'w2',
    setId: 'all',
    japanese: '今日',
    reading: 'きょう',
    meaning: 'today',
    type: 'noun',
    difficulty: 12,
    verbInfo: null,
    sourceOrder: 1,
  },
  {
    id: 'w3',
    setId: 'all',
    japanese: '昨日',
    reading: 'きのう',
    meaning: 'yesterday',
    type: 'noun',
    difficulty: 14,
    verbInfo: null,
    sourceOrder: 2,
  },
]

const payload: TapMatchRushSetupPayload = {
  gameKind: 'tap_match_rush',
  setId: 'all',
  setName: '전체 세트',
  playerName: '플레이어',
  pairCount: 3,
  sourceWords: words,
}

describe('tapMatchRushEngine', () => {
  it('creates prompt and answer cards for each pair', () => {
    const session = createTapMatchRushSession(payload, () => 0.4)
    const promptCards = session.cards.filter((card) => card.lane === 'prompt')

    expect(session.totalPairs).toBe(3)
    expect(session.cards).toHaveLength(6)
    expect(promptCards.every((card) => card.secondaryText === null)).toBe(true)
  })

  it('marks matched pairs when selecting corresponding cards', () => {
    const session = createTapMatchRushSession(payload, () => 0.4)
    const promptCard = session.cards.find((card) => card.lane === 'prompt')
    const answerCard = session.cards.find((card) => card.pairId === promptCard?.pairId && card.lane === 'answer')

    const firstSelection = applyTapMatchRushSelection(session, promptCard!.id)
    const secondSelection = applyTapMatchRushSelection(firstSelection!.nextSession, answerCard!.id)

    expect(firstSelection?.resolution.kind).toBe('selected')
    expect(secondSelection?.resolution.kind).toBe('match')
    expect(secondSelection?.nextSession.matchedPairIds).toContain(promptCard!.pairId)
  })

  it('adds a penalty for wrong matches and sorts records by fastest time', () => {
    const session = createTapMatchRushSession(payload, () => 0.4)
    const promptCard = session.cards.find((card) => card.lane === 'prompt')!
    const wrongAnswerCard = session.cards.find((card) => card.lane === 'answer' && card.pairId !== promptCard.pairId)!

    const firstSelection = applyTapMatchRushSelection(session, promptCard.id)
    const wrongSelection = applyTapMatchRushSelection(firstSelection!.nextSession, wrongAnswerCard.id)
    const records = recordTapMatchRushResult([
      { totalTime: 12, penaltySeconds: 2, wrongAttempts: 2, pairCount: 6, date: '2026. 4. 10.' },
    ], {
      totalTime: 10,
      penaltySeconds: 1,
      wrongAttempts: 1,
      pairCount: 6,
    }, new Date('2026-04-09T00:00:00Z'))

    expect(wrongSelection?.resolution.kind).toBe('wrong')
    expect(wrongSelection?.nextSession.penaltySeconds).toBe(1)
    expect(records[0]?.totalTime).toBe(10)
  })
})
