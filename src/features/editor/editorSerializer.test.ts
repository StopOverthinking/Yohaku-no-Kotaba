import { describe, expect, it } from 'vitest'
import {
  buildEditorFileOutputs,
  createEmptyComparisonWord,
  createEmptySet,
  createEmptyThemeWord,
  createEmptyWord,
  normalizeEditorSnapshot,
  validateEditorSnapshot,
} from '@/features/editor/editorSerializer'
import type { EditorSnapshot } from '@/features/editor/editorData'

function createSnapshot(): EditorSnapshot {
  return {
    sets: [
      { id: 'set-b', name: 'B', order: 1, wordIdPrefix: 'WordB', wordIds: [] },
      { id: 'set-a', name: 'A', order: 0, wordIdPrefix: 'WordA', wordIds: [] },
    ],
    words: [
      {
        id: 'w-2',
        setId: 'set-a',
        japanese: '食べる',
        reading: 'たべる',
        meaning: '먹다',
        type: 'verb',
        difficulty: 2,
        verbInfo: '2타',
        smartReviewPrompt: {
          japaneseSentence: '朝ごはんを ____。',
          translationSentence: '아침밥을 먹다.',
        },
        sourceOrder: 1,
      },
      {
        id: 'w-1',
        setId: 'set-a',
        japanese: '行く',
        reading: 'いく',
        meaning: '가다',
        type: 'verb',
        difficulty: 1,
        verbInfo: '1자',
        smartReviewPrompt: {
          japaneseSentence: '学校へ ____。',
          translationSentence: '학교에 가다.',
        },
        sourceOrder: 0,
      },
    ],
    themeWordbooks: [
      {
        id: 'theme-a',
        name: '주제형',
        order: 0,
        wordIdPrefix: 'ThemeWord',
        kind: 'theme',
        topics: [
          { id: 'topic-b', name: '둘째', order: 1, wordIds: ['ThemeWord_2'] },
          { id: 'topic-a', name: '첫째', order: 0, wordIds: ['ThemeWord_1'] },
        ],
      },
    ],
    themeWords: [
      {
        id: 'ThemeWord_2',
        setId: 'theme-a',
        japanese: '食べる',
        reading: 'たべる',
        meaning: '먹다',
        type: 'verb',
        difficulty: 2,
        verbInfo: '2타',
        sourceOrder: 1,
      },
      {
        id: 'ThemeWord_1',
        setId: 'theme-a',
        japanese: '行く',
        reading: 'いく',
        meaning: '가다',
        type: 'verb',
        difficulty: 1,
        verbInfo: '1자',
        smartReviewPrompt: {
          japaneseSentence: '学校へ ____。',
          translationSentence: '학교에 가다.',
        },
        sourceOrder: 0,
      },
    ],
    comparisonWordbooks: [
      {
        id: 'compare-a',
        name: '비교형',
        order: 0,
        wordIdPrefix: 'CompareWord',
        kind: 'compare',
        pairIds: [],
      },
    ],
    comparisonWords: [
      {
        id: 'compare-w-2',
        setId: 'compare-a',
        japanese: '強い',
        reading: 'つよい',
        meaning: '강하다',
        type: 'i_adj',
        difficulty: null,
        verbInfo: null,
        sourceOrder: 1,
      },
      {
        id: 'compare-w-1',
        setId: 'compare-a',
        japanese: '固い',
        reading: 'かたい',
        meaning: '단단하다',
        type: 'i_adj',
        difficulty: null,
        verbInfo: null,
        sourceOrder: 0,
      },
    ],
    comparisonPairs: [
      {
        id: 'pair-a',
        bookId: 'compare-a',
        leftWordId: 'compare-w-1',
        rightWordId: 'compare-w-2',
        leftDescription: '왼쪽 첫 줄\n왼쪽 둘째 줄',
        rightDescription: '오른쪽 첫 줄\n오른쪽 둘째 줄',
        sourceOrder: 0,
      },
    ],
  }
}

describe('editorSerializer', () => {
  it('normalizes set order and rebuilds wordIds', () => {
    const normalized = normalizeEditorSnapshot(createSnapshot())

    expect(normalized.sets[0]).toMatchObject({
      id: 'set-b',
      order: 0,
      wordIdPrefix: 'WordB',
      wordIds: [],
    })

    expect(normalized.sets[1]).toMatchObject({
      id: 'set-a',
      order: 1,
      wordIdPrefix: 'WordA',
      wordIds: ['w-1', 'w-2'],
    })

    expect(normalized.words.map((word) => word.sourceOrder)).toEqual([0, 1])
    expect(normalized.themeWordbooks[0]).toMatchObject({
      wordIdPrefix: 'ThemeWord',
    })
    expect(normalized.themeWordbooks[0]?.topics.map((topic) => topic.id)).toEqual(['theme-a_theme_1', 'theme-a_theme_2'])
    expect(normalized.themeWords.map((word) => word.id)).toEqual(['ThemeWord_1', 'ThemeWord_2'])
    expect(normalized.comparisonWordbooks[0]).toMatchObject({
      wordIdPrefix: 'CompareWord',
      pairIds: ['pair-a'],
    })
    expect(normalized.comparisonWords.map((word) => word.id)).toEqual(['compare-w-1', 'compare-w-2'])
  })

  it('preserves comparison description spaces while normalizing line endings', () => {
    const normalized = normalizeEditorSnapshot({
      ...createSnapshot(),
      comparisonPairs: [
        {
          ...createSnapshot().comparisonPairs[0],
          leftDescription: '앞  공백 \r\n\r\n끝 공백 ',
          rightDescription: ' 유지 ',
        },
      ],
    })

    expect(normalized.comparisonPairs[0]?.leftDescription).toBe('앞  공백 \n\n끝 공백 ')
    expect(normalized.comparisonPairs[0]?.rightDescription).toBe(' 유지 ')
  })

  it('reports duplicate ids and missing sets', () => {
    const issues = validateEditorSnapshot({
      sets: [
        { id: 'set-a', name: 'A', order: 0, wordIdPrefix: 'Word', wordIds: [] },
        { id: 'set-a', name: 'A-2', order: 1, wordIdPrefix: 'Word', wordIds: [] },
      ],
      words: [
        {
          id: 'word-1',
          setId: 'missing',
          japanese: '',
          reading: '',
          meaning: '',
          type: 'noun',
          difficulty: null,
          verbInfo: null,
          sourceOrder: 0,
        },
        {
          id: 'word-1',
          setId: 'set-a',
          japanese: '',
          reading: '',
          meaning: '',
          type: 'noun',
          difficulty: Number.NaN,
          verbInfo: null,
          sourceOrder: 1,
        },
      ],
      themeWordbooks: [
        {
          id: 'theme-a',
          name: '주제형',
          order: 0,
          wordIdPrefix: 'Word',
          kind: 'theme',
          topics: [
            { id: 'topic-a', name: '주제', order: 0, wordIds: ['missing-word'] },
            { id: 'topic-a', name: '중복', order: 1, wordIds: [] },
          ],
        },
      ],
      themeWords: [
        {
          id: 'theme-word-1',
          setId: 'missing-theme',
          japanese: '',
          reading: '',
          meaning: '',
          type: 'noun',
          difficulty: Number.NaN,
          verbInfo: null,
          sourceOrder: 0,
        },
      ],
      comparisonWordbooks: [
        { id: 'compare-a', name: '비교', order: 0, wordIdPrefix: 'Word', kind: 'compare', pairIds: [] },
        { id: 'compare-a', name: '비교2', order: 1, wordIdPrefix: 'Word', kind: 'compare', pairIds: [] },
      ],
      comparisonWords: [
        {
          id: 'compare-word-1',
          setId: 'missing-compare',
          japanese: '',
          reading: '',
          meaning: '',
          type: 'noun',
          difficulty: Number.NaN,
          verbInfo: null,
          sourceOrder: 0,
        },
      ],
      comparisonPairs: [
        {
          id: 'pair-a',
          bookId: 'missing-book',
          leftWordId: 'compare-word-1',
          rightWordId: 'missing-word',
          leftDescription: '',
          rightDescription: '',
          sourceOrder: 0,
        },
        {
          id: 'pair-a',
          bookId: 'compare-a',
          leftWordId: 'word-1',
          rightWordId: 'word-1',
          leftDescription: '',
          rightDescription: '',
          sourceOrder: 1,
        },
      ],
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'set', field: 'id' }),
        expect.objectContaining({ scope: 'word', field: 'setId' }),
        expect.objectContaining({ scope: 'word', field: 'difficulty' }),
        expect.objectContaining({ scope: 'themeTopic', field: 'wordIds' }),
        expect.objectContaining({ scope: 'themeWord', field: 'setId' }),
        expect.objectContaining({ scope: 'comparisonWord', field: 'setId' }),
        expect.objectContaining({ scope: 'comparisonWordbook', field: 'id' }),
        expect.objectContaining({ scope: 'comparisonWordbook', field: 'wordIdPrefix' }),
        expect.objectContaining({ scope: 'comparisonPair', field: 'bookId' }),
      ]),
    )
  })

  it('creates default set and word scaffolds', () => {
    const snapshot = normalizeEditorSnapshot(createSnapshot())
    const newSet = createEmptySet(snapshot)
    const newWord = createEmptyWord(snapshot, 'set-a')
    const newThemeWord = createEmptyThemeWord(snapshot, 'theme-a')
    const newComparisonWord = createEmptyComparisonWord(snapshot, 'compare-a')

    expect(newSet.id).toBe('set-3')
    expect(newWord.setId).toBe('set-a')
    expect(newWord.sourceOrder).toBe(2)
    expect(newThemeWord.setId).toBe('theme-a')
    expect(newThemeWord.sourceOrder).toBe(2)
    expect(newComparisonWord.setId).toBe('compare-a')
    expect(newComparisonWord.sourceOrder).toBe(2)
  })

  it('builds json and ts outputs together', () => {
    const outputs = buildEditorFileOutputs(normalizeEditorSnapshot(createSnapshot()))

    expect(outputs).toHaveLength(15)
    expect(outputs[0]?.path.join('/')).toContain('editor-data/vocabularySets.json')
    expect(outputs[0]?.content).toContain('"wordIdPrefix": "WordA"')
    expect(outputs[1]?.content).toContain('"id": "WordA_1"')
    expect(outputs[1]?.content).toContain('"smartReviewPrompt"')
    expect(outputs[2]?.content).toContain('"wordIdPrefix": "ThemeWord"')
    expect(outputs[3]?.content).toContain('"id": "ThemeWord_1"')
    expect(outputs[3]?.content).toContain('"translationSentence": "학교에 가다."')
    expect(outputs[4]?.content).toContain('"wordIdPrefix": "CompareWord"')
    expect(outputs[5]?.content).toContain('"id": "CompareWord_1"')
    expect(outputs[6]?.content).toContain('"id": "compare-a_pair_1"')
    expect(outputs[9]?.content).toContain("export const themeWordbooks")
    expect(outputs[12]?.content).toContain("export const comparisonWords")
    expect(outputs[13]?.content).toContain("export const comparisonPairs")
  })
})
