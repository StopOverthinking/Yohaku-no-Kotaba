import { describe, expect, it } from 'vitest'
import type { EditorSnapshot } from '@/features/editor/editorData'
import { buildEditorWorkbook, editorWorkbookFileName, parseEditorWorkbook } from '@/features/editor/editorSpreadsheet'

function createSnapshot(): EditorSnapshot {
  return {
    sets: [
      { id: 'set-a', name: 'A 세트', order: 0, wordIdPrefix: 'WordA', wordIds: [] },
      { id: 'set-b', name: 'B 세트', order: 1, wordIdPrefix: 'WordB', wordIds: [] },
    ],
    words: [
      {
        id: 'WordA_1',
        setId: 'set-a',
        japanese: '食べる',
        reading: 'たべる',
        meaning: '먹다',
        type: 'verb',
        difficulty: 2,
        verbInfo: '1단',
        sourceOrder: 0,
      },
      {
        id: 'WordB_1',
        setId: 'set-b',
        japanese: '静か',
        reading: 'しずか',
        meaning: '조용함',
        type: 'na_adj',
        difficulty: null,
        verbInfo: null,
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
          {
            id: 'topic-a',
            name: '움직임',
            order: 0,
            wordIds: ['ThemeWord_1'],
          },
          {
            id: 'topic-b',
            name: '감정',
            order: 1,
            wordIds: [],
          },
        ],
      },
    ],
    themeWords: [
      {
        id: 'ThemeWord_1',
        setId: 'theme-a',
        japanese: '走る',
        reading: 'はしる',
        meaning: '달리다',
        type: 'verb',
        difficulty: 1,
        verbInfo: '1자',
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
        id: 'compare-word-1',
        setId: 'compare-a',
        japanese: '固い',
        reading: 'かたい',
        meaning: '단단하다',
        type: 'i_adj',
        difficulty: 11,
        verbInfo: null,
        sourceOrder: 0,
      },
      {
        id: 'compare-word-2',
        setId: 'compare-a',
        japanese: '硬い',
        reading: 'かたい',
        meaning: '굳다',
        type: 'i_adj',
        difficulty: 12,
        verbInfo: null,
        sourceOrder: 1,
      },
    ],
    comparisonPairs: [
      {
        id: 'pair-a',
        bookId: 'compare-a',
        leftWordId: 'compare-word-1',
        rightWordId: 'compare-word-2',
        leftDescription: '왼쪽 설명',
        rightDescription: '오른쪽 설명',
        sourceOrder: 0,
      },
    ],
  }
}

describe('editorSpreadsheet', () => {
  it('builds mode-specific workbook file names', () => {
    expect(editorWorkbookFileName('basic', 'JLPT N3/기본')).toBe('wordbook-basic-JLPT-N3-기본.xlsx')
  })

  it('exports and imports only the selected basic wordbook', async () => {
    const workbookBuffer = await buildEditorWorkbook(createSnapshot(), { mode: 'basic', setId: 'set-a' })
    const xlsx = await import('xlsx')
    const workbook = xlsx.read(workbookBuffer, { type: 'array' })

    expect(workbook.SheetNames).toEqual(['basic_book', 'basic_words'])

    const infoRows = xlsx.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.basic_book, { defval: '' })
    const wordRows = xlsx.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.basic_words, { defval: '' })

    expect(infoRows[0]?.['세트 이름']).toBe('A 세트')
    expect(wordRows).toHaveLength(1)
    expect(wordRows[0]?.JP).toBe('食べる')
    expect(wordRows[0]).not.toHaveProperty('例JP')
    expect(wordRows[0]).not.toHaveProperty('例KR')

    const parsed = await parseEditorWorkbook(workbookBuffer, 'basic')
    expect(parsed.mode).toBe('basic')
    if (parsed.mode !== 'basic') {
      throw new Error('basic parse failed')
    }
    expect(parsed.set).toEqual({
      id: 'set-a',
      name: 'A 세트',
      order: 0,
      wordIdPrefix: 'WordA',
      wordIds: ['WordA_1'],
    })
    expect(parsed.words).toEqual([
      expect.objectContaining({
        id: 'WordA_1',
        setId: 'set-a',
        japanese: '食べる',
      }),
    ])
  })

  it('ignores metadata-only basic rows when importing', async () => {
    const xlsx = await import('xlsx')
    const workbook = xlsx.utils.book_new()

    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([{
      '세트 이름': '동사대박살',
      '세트 ID': 'AbsoluteVerb',
      '단어 ID 접두사': 'AbsoluteVerb',
    }]), 'basic_book')

    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([
      {
        '#': 1,
        JP: '寝る',
        読: 'ねる',
        KR: '자다',
        유형: 'verb',
        난도: '',
        동사: '',
        _wordId: 'AbsoluteVerb_1',
      },
      {
        '#': 393,
        JP: '',
        読: '',
        KR: '',
        유형: 'noun',
        난도: '',
        동사: '',
        _wordId: 'AbsoluteVerb_393',
      },
    ]), 'basic_words')

    const workbookBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const parsed = await parseEditorWorkbook(workbookBuffer, 'basic')

    expect(parsed.mode).toBe('basic')
    if (parsed.mode !== 'basic') {
      throw new Error('basic parse failed')
    }

    expect(parsed.set.wordIds).toEqual(['AbsoluteVerb_1'])
    expect(parsed.words).toHaveLength(1)
    expect(parsed.words[0]).toEqual(
      expect.objectContaining({
        id: 'AbsoluteVerb_1',
        japanese: '寝る',
      }),
    )
  })

  it('exports and imports theme workbook sheets that mirror the editor structure', async () => {
    const workbookBuffer = await buildEditorWorkbook(createSnapshot(), { mode: 'theme', wordbookId: 'theme-a' })
    const xlsx = await import('xlsx')
    const workbook = xlsx.read(workbookBuffer, { type: 'array' })

    expect(workbook.SheetNames).toEqual(['theme_book', 'theme_topics', 'theme_words'])

    const topicRows = xlsx.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.theme_topics, { defval: '' })
    const wordRows = xlsx.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.theme_words, { defval: '' })

    expect(topicRows.map((row) => row['주제'])).toEqual(['움직임', '감정'])
    expect(wordRows[0]?.['주제']).toBe('움직임')
    expect(wordRows[0]).not.toHaveProperty('例JP')

    const parsed = await parseEditorWorkbook(workbookBuffer, 'theme')
    expect(parsed.mode).toBe('theme')
    if (parsed.mode !== 'theme') {
      throw new Error('theme parse failed')
    }
    expect(parsed.wordbook.topics.map((topic) => topic.name)).toEqual(['움직임', '감정'])
    expect(parsed.words).toEqual([
      expect.objectContaining({
        japanese: '走る',
        setId: 'theme-a',
      }),
    ])
  })

  it('exports and imports compare workbook as a two-row pair sheet with merged description cells', async () => {
    const workbookBuffer = await buildEditorWorkbook(createSnapshot(), { mode: 'compare', wordbookId: 'compare-a' })
    const xlsx = await import('xlsx')
    const workbook = xlsx.read(workbookBuffer, { type: 'array' })

    expect(workbook.SheetNames).toEqual(['compare_book', 'compare_pairs'])

    const pairSheet = workbook.Sheets.compare_pairs
    const pairRows = xlsx.utils.sheet_to_json<Record<string, string>>(pairSheet, { defval: '' })

    expect(pairRows).toHaveLength(2)
    expect(pairRows[0]?.JP).toBe('固い')
    expect(pairRows[1]?.JP).toBe('硬い')
    expect(pairRows[0]?.['설명']).toContain('왼쪽 설명')
    expect(pairSheet['!merges']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }),
        expect.objectContaining({ s: { r: 1, c: 7 }, e: { r: 2, c: 7 } }),
      ]),
    )

    const parsed = await parseEditorWorkbook(workbookBuffer, 'compare')
    expect(parsed.mode).toBe('compare')
    if (parsed.mode !== 'compare') {
      throw new Error('compare parse failed')
    }
    expect(parsed.words.map((word) => word.japanese)).toEqual(['固い', '硬い'])
    expect(parsed.pairs).toEqual([
      expect.objectContaining({
        leftDescription: expect.stringContaining('왼쪽 설명'),
        rightDescription: expect.stringContaining('왼쪽 설명'),
      }),
    ])
  })
})
