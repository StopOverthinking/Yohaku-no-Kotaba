import type { ContextState, LearnSense } from './contextTypes'

/** Explicit historical fixture; new state factories now use schema v4. */
export function legacyContextState(state: ContextState): ContextState {
  const { jlptEstimate: _estimate, jlptHistoryReestimate: _reestimate, ...legacy } = state
  const lastScoreChange = state.lastScoreChange && { before: state.lastScoreChange.before,
    after: state.lastScoreChange.after, completedAt: state.lastScoreChange.completedAt }
  return { ...legacy, version: state.aliasMigrations ? 3 : 2,
    ...(lastScoreChange ? { lastScoreChange } : {}),
    history: state.history.map(({ jlptEstimate: _snapshot, ...entry }) => entry),
  }
}

// Synthetic data only for engine and UI tests; never imported by production.
export function testSense(id: string, difficulty = 30): LearnSense {
  return {
    id: `sense-${id}`,
    wordId: id,
    version: 1,
    meaning: '테스트 용법',
    hint: '문맥으로 구별하는 테스트 힌트입니다.',
    confusions: [{ japanese: '別', distinction: '테스트 구별' }],
    review: { word: true, contrast: true, diversity: true },
    examples: [1, 2].map((n) => ({
      id: `${id}-e${n}`,
      version: 1,
      before: `場面${n}、`,
      answer: '答えた',
      after: '。',
      reading: 'こたえた',
      translation: '문맥에서 대답했다.',
      translationTarget: '대답했다',
      difficulty,
      status: 'reviewed',
    })),
  }
}
