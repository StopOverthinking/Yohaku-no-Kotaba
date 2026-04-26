import { describe, expect, it } from 'vitest'
import {
  applySmartReviewOutcome,
  buildSmartReviewResult,
  buildSmartReviewSummary,
  createStudyPrompt,
  createEmptyProfile,
  createSmartReviewSession,
  normalizeSmartReviewProfile,
} from '@/features/smart-review/smartReviewEngine'
import type { VocabularyWord } from '@/features/vocab/model/types'

const words: VocabularyWord[] = [
  {
    id: 'word-1',
    setId: 'set-a',
    japanese: '守る',
    reading: 'まもる',
    meaning: 'protect',
    type: 'verb',
    difficulty: 10,
    verbInfo: null,
    smartReviewPrompt: {
      japaneseSentence: '大切なものを ____。',
      translationSentence: '소중한 것을 지킨다.',
    },
    sourceOrder: 0,
  },
  {
    id: 'word-2',
    setId: 'set-a',
    japanese: '位置',
    reading: 'いち',
    meaning: 'position',
    type: 'noun',
    difficulty: 10,
    verbInfo: null,
    smartReviewPrompt: {
      japaneseSentence: 'この ____ を確認する。',
      translationSentence: '이 위치를 확인한다.',
    },
    sourceOrder: 1,
  },
  {
    id: 'word-3',
    setId: 'set-a',
    japanese: '正確だ',
    reading: 'せいかくだ',
    meaning: 'accurate',
    type: 'na_adj',
    difficulty: 10,
    verbInfo: null,
    smartReviewPrompt: {
      japaneseSentence: '答えはとても ____。',
      translationSentence: '답은 매우 정확하다.',
    },
    sourceOrder: 2,
  },
]

describe('smart review engine', () => {
  it('summarizes due, new, learning, and mastered words', () => {
    const now = new Date('2026-04-11T00:00:00.000Z')

    const summary = buildSmartReviewSummary(words, {
      'word-1': {
        ...createEmptyProfile('word-1'),
        dueAt: '2026-04-10T00:00:00.000Z',
        intervalDays: 7,
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
      'word-2': {
        ...createEmptyProfile('word-2'),
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
    }, now)

    expect(summary).toEqual({
      dueCount: 1,
      newCount: 1,
      learningCount: 1,
      masteredCount: 1,
    })
  })

  it('creates a session with the eligible words shuffled before starting', () => {
    const now = new Date('2026-04-11T00:00:00.000Z')

    const session = createSmartReviewSession({
      setId: 'set-a',
      setName: 'Set A',
      words,
      wordCount: words.length,
    }, {}, now)

    expect(session?.selectedWordIds).toEqual(['word-3', 'word-1', 'word-2'])
  })

  it('limits the session to the requested daily count and fills due words first', () => {
    const now = new Date('2026-04-11T00:00:00.000Z')

    const session = createSmartReviewSession({
      setId: 'set-a',
      setName: 'Set A',
      words,
      wordCount: 2,
    }, {
      'word-1': {
        ...createEmptyProfile('word-1'),
        dueAt: '2026-04-09T00:00:00.000Z',
        intervalDays: 7,
        updatedAt: '2026-04-08T00:00:00.000Z',
      },
      'word-2': {
        ...createEmptyProfile('word-2'),
        dueAt: '2026-04-10T00:00:00.000Z',
        intervalDays: 3,
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
    }, now)

    expect(session?.selectedWordIds).toHaveLength(2)
    expect(session?.selectedWordIds.slice().sort()).toEqual(['word-1', 'word-2'])
  })

  it('falls back to learning words when nothing is due yet', () => {
    const now = new Date('2026-04-11T00:00:00.000Z')

    const session = createSmartReviewSession({
      setId: 'set-a',
      setName: 'Set A',
      words: words.slice(0, 2),
      wordCount: 2,
    }, {
      'word-1': {
        ...createEmptyProfile('word-1'),
        dueAt: '2026-04-14T00:00:00.000Z',
        intervalDays: 3,
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
      'word-2': {
        ...createEmptyProfile('word-2'),
        dueAt: '2026-04-13T00:00:00.000Z',
        intervalDays: 1,
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
    }, now)

    expect(session?.selectedWordIds).toHaveLength(2)
    expect(session?.selectedWordIds.slice().sort()).toEqual(['word-1', 'word-2'])
  })

  it('normalizes an invalid requested count to at least one word', () => {
    const now = new Date('2026-04-11T00:00:00.000Z')

    const session = createSmartReviewSession({
      setId: 'set-a',
      setName: 'Set A',
      words,
      wordCount: 0,
    }, {}, now)

    expect(session?.selectedWordIds).toHaveLength(1)
  })

  it('keeps the legacy stage mapping stable during migration', () => {
    expect(normalizeSmartReviewProfile({ stage: 1 }, 'word-1').intervalDays).toBe(3)
    expect(normalizeSmartReviewProfile({ stage: 5 }, 'word-1').intervalDays).toBe(90)
  })

  it('resets failed words to tomorrow and promotes clean words forward', () => {
    const now = new Date('2026-04-11T00:00:00.000Z')
    const session = createSmartReviewSession({
      setId: 'set-a',
      setName: 'Set A',
      words: words.slice(0, 2),
      wordCount: 2,
    }, {}, now)

    if (!session) {
      throw new Error('Expected session to be created')
    }

    session.itemStates['word-1'] = {
      wordId: 'word-1',
      attempts: 1,
      wrongCount: 0,
      answeredCorrectly: true,
    }
    session.itemStates['word-2'] = {
      wordId: 'word-2',
      attempts: 2,
      wrongCount: 1,
      answeredCorrectly: true,
    }

    const applied = applySmartReviewOutcome({}, session, now)

    expect(applied.promotedCount).toBe(1)
    expect(applied.resetCount).toBe(1)
    expect(applied.masteredCount).toBe(0)
    expect(applied.nextProfiles['word-1']?.dueAt).toBe('2026-04-13T00:00:00.000Z')
    expect(applied.nextProfiles['word-1']?.intervalDays).toBe(2)
    expect(applied.nextProfiles['word-2']?.dueAt).toBe('2026-04-12T00:00:00.000Z')
    expect(applied.nextProfiles['word-2']?.intervalDays).toBe(1)
  })

  it('uses the full 10-step ladder and masters after the 90-day stage', () => {
    const now = new Date('2026-04-11T00:00:00.000Z')
    const session = createSmartReviewSession({
      setId: 'set-a',
      setName: 'Set A',
      words: words.slice(0, 2),
      wordCount: 2,
    }, {
      'word-1': {
        ...createEmptyProfile('word-1'),
        dueAt: '2026-04-10T00:00:00.000Z',
        intervalDays: 45,
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
      'word-2': {
        ...createEmptyProfile('word-2'),
        dueAt: '2026-04-10T00:00:00.000Z',
        intervalDays: 90,
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
    }, now)

    if (!session) {
      throw new Error('Expected session to be created')
    }

    session.itemStates['word-1'] = {
      wordId: 'word-1',
      attempts: 1,
      wrongCount: 0,
      answeredCorrectly: true,
    }
    session.itemStates['word-2'] = {
      wordId: 'word-2',
      attempts: 1,
      wrongCount: 0,
      answeredCorrectly: true,
    }

    const applied = applySmartReviewOutcome({
      'word-1': {
        ...createEmptyProfile('word-1'),
        dueAt: '2026-04-10T00:00:00.000Z',
        intervalDays: 45,
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
      'word-2': {
        ...createEmptyProfile('word-2'),
        dueAt: '2026-04-10T00:00:00.000Z',
        intervalDays: 90,
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
    }, session, now)

    expect(applied.promotedCount).toBe(1)
    expect(applied.masteredCount).toBe(1)
    expect(applied.nextProfiles['word-1']?.dueAt).toBe('2026-07-10T00:00:00.000Z')
    expect(applied.nextProfiles['word-1']?.intervalDays).toBe(90)
    expect(applied.nextProfiles['word-2']?.dueAt).toBeNull()
    expect(applied.nextProfiles['word-2']?.intervalDays).toBeNull()
  })

  it('includes next review timing for each reviewed word in the session result', () => {
    const now = new Date('2026-04-11T00:00:00.000Z')
    const session = createSmartReviewSession({
      setId: 'set-a',
      setName: 'Set A',
      words: words.slice(0, 2),
      wordCount: 2,
    }, {}, now)

    if (!session) {
      throw new Error('Expected session to be created')
    }

    session.itemStates['word-1'] = {
      wordId: 'word-1',
      attempts: 1,
      wrongCount: 0,
      answeredCorrectly: true,
    }
    session.itemStates['word-2'] = {
      wordId: 'word-2',
      attempts: 1,
      wrongCount: 1,
      answeredCorrectly: true,
    }

    const applied = applySmartReviewOutcome({}, session, now)
    const result = buildSmartReviewResult(session, applied.nextProfiles, now)

    expect(result.reviewedItems.slice().sort((left, right) => left.wordId.localeCompare(right.wordId))).toEqual([
      {
        wordId: 'word-1',
        dueAt: '2026-04-13T00:00:00.000Z',
        nextReviewInDays: 2,
        wasWrong: false,
      },
      {
        wordId: 'word-2',
        dueAt: '2026-04-12T00:00:00.000Z',
        nextReviewInDays: 1,
        wasWrong: true,
      },
    ])
  })

  it('returns null when a word has no handwritten prompt', () => {
    const prompt = createStudyPrompt({
      id: '1_1',
      setId: 'jlpt-n3',
      japanese: '飽きる',
      reading: 'あきる',
      meaning: '질리다, 싫증나다',
      type: 'verb',
      difficulty: 35,
      verbInfo: '2자',
      sourceOrder: 0,
    })

    expect(prompt).toBeNull()
  })

  it('uses word-owned handwritten prompts only', () => {
    const prompt = createStudyPrompt({
      id: '1_1',
      setId: 'jlpt-n3',
      japanese: '飽きる',
      reading: 'あきる',
      meaning: '질리다, 싫증나다',
      type: 'verb',
      difficulty: 35,
      verbInfo: '2자',
      smartReviewPrompt: {
        japaneseSentence: '仕事にすっかり ____。',
        translationSentence: '일에 완전히 질렸다.',
      },
      sourceOrder: 0,
    })

    expect(prompt?.japaneseSentence).toBe('仕事にすっかり ____。')
    expect(prompt?.translationSentence).toBe('일에 완전히 질렸다.')
  })

  it('excludes words without handwritten prompts from session selection', () => {
    const now = new Date('2026-04-11T00:00:00.000Z')
    const session = createSmartReviewSession({
      setId: 'set-a',
      setName: 'Set A',
      words: [
        words[0],
        {
          ...words[1],
          smartReviewPrompt: undefined,
        },
      ],
      wordCount: 2,
    }, {}, now)

    expect(session?.selectedWordIds).toEqual(['word-1'])
  })
})
