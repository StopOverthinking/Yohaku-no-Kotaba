import { afterEach, describe, expect, it } from 'vitest'
import { loadSingleModeRecords, loadTapMatchRushRecords, saveSingleModeRecords, saveTapMatchRushRecords } from '@/features/game/gameStorage'

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
})
