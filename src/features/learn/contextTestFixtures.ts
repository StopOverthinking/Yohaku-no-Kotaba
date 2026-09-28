import type { LearnSense } from './contextTypes'

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
