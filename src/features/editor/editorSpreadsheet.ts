import type { ColInfo, Range, WorkBook } from 'xlsx'
import type { EditorSnapshot } from '@/features/editor/editorData'
import { buildPublishedEditorSnapshot, normalizeEditorSnapshot } from '@/features/editor/editorSerializer'
import type { ComparisonPair, ComparisonWordbook, ThemeWordbook, ThemeWordbookTopic, VocabularySet, VocabularyWord, WordType } from '@/features/vocab/model/types'

const basicInfoSheetName = 'basic_book'
const basicWordsSheetName = 'basic_words'
const themeInfoSheetName = 'theme_book'
const themeTopicsSheetName = 'theme_topics'
const themeWordsSheetName = 'theme_words'
const compareInfoSheetName = 'compare_book'
const comparePairsSheetName = 'compare_pairs'

const wordbookInfoColumns = ['세트 이름', '세트 ID', '단어 ID 접두사'] as const
const basicWordColumns = ['#', 'JP', '読', 'KR', '유형', '난도', '동사', '_wordId'] as const
const themeTopicColumns = ['#', '주제', '_topicId'] as const
const themeWordColumns = ['#', 'JP', '読', 'KR', '유형', '주제', '난도', '동사', '_wordId', '_topicId'] as const
const comparePairColumns = ['#', 'JP', '読', 'KR', '유형', '난도', '동사', '설명', '_pairId', '_side', '_wordId'] as const

type WordbookInfoColumn = (typeof wordbookInfoColumns)[number]
type BasicWordColumn = (typeof basicWordColumns)[number]
type ThemeTopicColumn = (typeof themeTopicColumns)[number]
type ThemeWordColumn = (typeof themeWordColumns)[number]
type ComparePairColumn = (typeof comparePairColumns)[number]

type WordbookInfoRow = Record<WordbookInfoColumn, string>
type BasicWordRow = Record<BasicWordColumn, string | number>
type ThemeTopicRow = Record<ThemeTopicColumn, string | number>
type ThemeWordRow = Record<ThemeWordColumn, string | number>
type ComparePairRow = Record<ComparePairColumn, string | number>

export type EditorWorkbookMode = 'basic' | 'theme' | 'compare'

export type EditorWorkbookScope =
  | { mode: 'basic'; setId: string }
  | { mode: 'theme'; wordbookId: string }
  | { mode: 'compare'; wordbookId: string }

export type ParsedEditorWorkbook =
  | { mode: 'basic'; set: VocabularySet; words: VocabularyWord[] }
  | { mode: 'theme'; wordbook: ThemeWordbook; words: VocabularyWord[] }
  | { mode: 'compare'; wordbook: ComparisonWordbook; words: VocabularyWord[]; pairs: ComparisonPair[] }

const wordTypes = new Set<WordType>(['verb', 'noun', 'i_adj', 'na_adj', 'adv', 'expression', 'other'])

async function loadXlsx() {
  return import('xlsx')
}

function createEmptySnapshot(): EditorSnapshot {
  return {
    sets: [],
    words: [],
    themeWordbooks: [],
    themeWords: [],
    comparisonWordbooks: [],
    comparisonWords: [],
    comparisonPairs: [],
  }
}

function parseWordType(value: unknown): WordType {
  if (typeof value === 'string') {
    const trimmed = value.trim() as WordType
    if (wordTypes.has(trimmed)) {
      return trimmed
    }
  }

  return 'noun'
}

function parseDifficulty(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function parseOptionalText(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function sanitizeFileSegment(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function getSharedComparisonDescription(pair: ComparisonPair) {
  const left = pair.leftDescription.trim()
  const right = pair.rightDescription.trim()
  if (!left) return right
  if (!right) return left
  if (left === right) return left
  return `${left}\n\n${right}`
}

function readRequiredSheet(workbook: WorkBook, name: string) {
  const sheet = workbook.Sheets[name]
  if (!sheet) {
    throw new Error(`${name} 시트 없음`)
  }

  return sheet
}

function readRows<T extends string>(
  workbook: WorkBook,
  name: string,
  xlsx: Awaited<ReturnType<typeof loadXlsx>>,
) {
  const sheet = readRequiredSheet(workbook, name)
  return xlsx.utils.sheet_to_json<Record<T, unknown>>(sheet, { defval: '' })
}

function hasRowValue(row: Record<string, unknown>) {
  return Object.values(row).some((value) => String(value ?? '').trim() !== '')
}

function hasTextValue(value: unknown) {
  return String(value ?? '').trim() !== ''
}

function hasBasicWordContent(row: Record<BasicWordColumn, unknown>) {
  return hasTextValue(row.JP) || hasTextValue(row['読']) || hasTextValue(row.KR)
}

function hasThemeWordContent(row: Record<ThemeWordColumn, unknown>) {
  return hasTextValue(row.JP) || hasTextValue(row['読']) || hasTextValue(row.KR)
}

function createSheet<T extends string>(
  xlsx: Awaited<ReturnType<typeof loadXlsx>>,
  rows: Array<Record<T, string | number>>,
  headers: readonly T[],
  cols: ColInfo[],
) {
  const sheet = xlsx.utils.json_to_sheet(rows, { header: [...headers] })
  sheet['!cols'] = cols
  return sheet
}

function buildInfoRows(name: string, id: string, wordIdPrefix?: string): WordbookInfoRow[] {
  return [{
    '세트 이름': name,
    '세트 ID': id,
    '단어 ID 접두사': wordIdPrefix ?? '',
  }]
}

function buildBasicSubset(snapshot: EditorSnapshot, setId: string) {
  const targetSet = snapshot.sets.find((set) => set.id === setId)
  if (!targetSet) {
    throw new Error('기본 단어장 없음')
  }

  return buildPublishedEditorSnapshot({
    ...createEmptySnapshot(),
    sets: [{ ...targetSet, wordIds: [] }],
    words: snapshot.words.filter((word) => word.setId === setId).map((word) => ({ ...word })),
  })
}

function buildThemeSubset(snapshot: EditorSnapshot, wordbookId: string) {
  const targetBook = snapshot.themeWordbooks.find((wordbook) => wordbook.id === wordbookId)
  if (!targetBook) {
    throw new Error('주제형 단어장 없음')
  }

  return buildPublishedEditorSnapshot({
    ...createEmptySnapshot(),
    themeWordbooks: [{
      ...targetBook,
      topics: targetBook.topics.map((topic) => ({ ...topic, wordIds: [...topic.wordIds] })),
    }],
    themeWords: snapshot.themeWords.filter((word) => word.setId === wordbookId).map((word) => ({ ...word })),
  })
}

function buildCompareSubset(snapshot: EditorSnapshot, wordbookId: string) {
  const targetBook = snapshot.comparisonWordbooks.find((wordbook) => wordbook.id === wordbookId)
  if (!targetBook) {
    throw new Error('비교형 단어장 없음')
  }

  return buildPublishedEditorSnapshot({
    ...createEmptySnapshot(),
    comparisonWordbooks: [{ ...targetBook, pairIds: [] }],
    comparisonWords: snapshot.comparisonWords.filter((word) => word.setId === wordbookId).map((word) => ({ ...word })),
    comparisonPairs: snapshot.comparisonPairs.filter((pair) => pair.bookId === wordbookId).map((pair) => ({ ...pair })),
  })
}

function buildBasicWorkbook(
  xlsx: Awaited<ReturnType<typeof loadXlsx>>,
  snapshot: EditorSnapshot,
  setId: string,
) {
  const subset = buildBasicSubset(snapshot, setId)
  const targetSet = subset.sets[0]
  const words = subset.words

  const workbook = xlsx.utils.book_new()
  const infoSheet = createSheet(
    xlsx,
    buildInfoRows(targetSet.name, targetSet.id, targetSet.wordIdPrefix),
    wordbookInfoColumns,
    [{ wch: 24 }, { wch: 24 }, { wch: 20 }],
  )

  const wordRows: BasicWordRow[] = words.map((word, index) => ({
    '#': index + 1,
    JP: word.japanese,
    読: word.reading,
    KR: word.meaning,
    유형: word.type,
    난도: word.difficulty ?? '',
    동사: word.verbInfo ?? '',
    _wordId: word.id,
  }))

  const wordsSheet = createSheet(
    xlsx,
    wordRows,
    basicWordColumns,
    [
      { wch: 6 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { hidden: true, wch: 18 },
    ],
  )

  xlsx.utils.book_append_sheet(workbook, infoSheet, basicInfoSheetName)
  xlsx.utils.book_append_sheet(workbook, wordsSheet, basicWordsSheetName)

  return workbook
}

function buildThemeWorkbook(
  xlsx: Awaited<ReturnType<typeof loadXlsx>>,
  snapshot: EditorSnapshot,
  wordbookId: string,
) {
  const subset = buildThemeSubset(snapshot, wordbookId)
  const targetBook = subset.themeWordbooks[0]
  const words = subset.themeWords
  const topicByWordId = new Map<string, ThemeWordbookTopic>()
  targetBook.topics.forEach((topic) => {
    topic.wordIds.forEach((wordId) => topicByWordId.set(wordId, topic))
  })

  const workbook = xlsx.utils.book_new()
  const infoSheet = createSheet(
    xlsx,
    buildInfoRows(targetBook.name, targetBook.id, targetBook.wordIdPrefix),
    wordbookInfoColumns,
    [{ wch: 24 }, { wch: 24 }, { wch: 20 }],
  )

  const topicRows: ThemeTopicRow[] = targetBook.topics.map((topic, index) => ({
    '#': index + 1,
    주제: topic.name,
    _topicId: topic.id,
  }))

  const topicsSheet = createSheet(
    xlsx,
    topicRows,
    themeTopicColumns,
    [{ wch: 6 }, { wch: 24 }, { hidden: true, wch: 18 }],
  )

  const wordRows: ThemeWordRow[] = words.map((word, index) => {
    const topic = topicByWordId.get(word.id)
    return {
      '#': index + 1,
      JP: word.japanese,
      読: word.reading,
      KR: word.meaning,
      유형: word.type,
      주제: topic?.name ?? '',
      난도: word.difficulty ?? '',
      동사: word.verbInfo ?? '',
      _wordId: word.id,
      _topicId: topic?.id ?? '',
    }
  })

  const wordsSheet = createSheet(
    xlsx,
    wordRows,
    themeWordColumns,
    [
      { wch: 6 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 12 },
      { wch: 18 },
      { wch: 10 },
      { wch: 12 },
      { hidden: true, wch: 18 },
      { hidden: true, wch: 18 },
    ],
  )

  xlsx.utils.book_append_sheet(workbook, infoSheet, themeInfoSheetName)
  xlsx.utils.book_append_sheet(workbook, topicsSheet, themeTopicsSheetName)
  xlsx.utils.book_append_sheet(workbook, wordsSheet, themeWordsSheetName)

  return workbook
}

function buildCompareWorkbook(
  xlsx: Awaited<ReturnType<typeof loadXlsx>>,
  snapshot: EditorSnapshot,
  wordbookId: string,
) {
  const subset = buildCompareSubset(snapshot, wordbookId)
  const targetBook = subset.comparisonWordbooks[0]
  const pairRows: ComparePairRow[] = []
  const merges: Range[] = []
  const wordMap = new Map(subset.comparisonWords.map((word) => [word.id, word]))

  subset.comparisonPairs.forEach((pair, index) => {
    const leftWord = wordMap.get(pair.leftWordId)
    const rightWord = wordMap.get(pair.rightWordId)
    const sharedDescription = getSharedComparisonDescription(pair)
    const topRowIndex = 1 + pairRows.length

    pairRows.push({
      '#': index + 1,
      JP: leftWord?.japanese ?? '',
      読: leftWord?.reading ?? '',
      KR: leftWord?.meaning ?? '',
      유형: leftWord?.type ?? 'noun',
      난도: leftWord?.difficulty ?? '',
      동사: leftWord?.verbInfo ?? '',
      설명: sharedDescription,
      _pairId: pair.id,
      _side: 'left',
      _wordId: leftWord?.id ?? '',
    })
    pairRows.push({
      '#': '',
      JP: rightWord?.japanese ?? '',
      読: rightWord?.reading ?? '',
      KR: rightWord?.meaning ?? '',
      유형: rightWord?.type ?? 'noun',
      난도: rightWord?.difficulty ?? '',
      동사: rightWord?.verbInfo ?? '',
      설명: '',
      _pairId: pair.id,
      _side: 'right',
      _wordId: rightWord?.id ?? '',
    })

    merges.push(
      { s: { r: topRowIndex, c: 0 }, e: { r: topRowIndex + 1, c: 0 } },
      { s: { r: topRowIndex, c: 7 }, e: { r: topRowIndex + 1, c: 7 } },
    )
  })

  const workbook = xlsx.utils.book_new()
  const infoSheet = createSheet(
    xlsx,
    buildInfoRows(targetBook.name, targetBook.id, targetBook.wordIdPrefix),
    wordbookInfoColumns,
    [{ wch: 24 }, { wch: 24 }, { wch: 20 }],
  )

  const pairsSheet = createSheet(
    xlsx,
    pairRows,
    comparePairColumns,
    [
      { wch: 6 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 42 },
      { hidden: true, wch: 18 },
      { hidden: true, wch: 10 },
      { hidden: true, wch: 18 },
    ],
  )
  pairsSheet['!merges'] = merges

  xlsx.utils.book_append_sheet(workbook, infoSheet, compareInfoSheetName)
  xlsx.utils.book_append_sheet(workbook, pairsSheet, comparePairsSheetName)

  return workbook
}

function parseInfoRow(rows: Array<Record<WordbookInfoColumn, unknown>>) {
  const row = rows.find((candidate) => hasRowValue(candidate)) ?? {
    '세트 이름': '',
    '세트 ID': '',
    '단어 ID 접두사': '',
  }

  return {
    name: String(row['세트 이름'] ?? '').trim(),
    id: String(row['세트 ID'] ?? '').trim(),
    wordIdPrefix: String(row['단어 ID 접두사'] ?? '').trim() || undefined,
  }
}

function normalizeBasicImport(set: VocabularySet, words: VocabularyWord[]) {
  const normalized = normalizeEditorSnapshot({
    ...createEmptySnapshot(),
    sets: [set],
    words,
  })

  return {
    mode: 'basic' as const,
    set: normalized.sets[0],
    words: normalized.words,
  }
}

function normalizeThemeImport(wordbook: ThemeWordbook, words: VocabularyWord[]) {
  const normalized = normalizeEditorSnapshot({
    ...createEmptySnapshot(),
    themeWordbooks: [wordbook],
    themeWords: words,
  })

  return {
    mode: 'theme' as const,
    wordbook: normalized.themeWordbooks[0],
    words: normalized.themeWords,
  }
}

function normalizeCompareImport(wordbook: ComparisonWordbook, words: VocabularyWord[], pairs: ComparisonPair[]) {
  const normalized = normalizeEditorSnapshot({
    ...createEmptySnapshot(),
    comparisonWordbooks: [wordbook],
    comparisonWords: words,
    comparisonPairs: pairs,
  })

  return {
    mode: 'compare' as const,
    wordbook: normalized.comparisonWordbooks[0],
    words: normalized.comparisonWords,
    pairs: normalized.comparisonPairs,
  }
}

function parseBasicWorkbook(workbook: WorkBook, xlsx: Awaited<ReturnType<typeof loadXlsx>>): ParsedEditorWorkbook {
  const info = parseInfoRow(readRows<WordbookInfoColumn>(workbook, basicInfoSheetName, xlsx))
  const rawWords = readRows<BasicWordColumn>(workbook, basicWordsSheetName, xlsx)
  const words = rawWords
    .filter((row) => hasRowValue(row) && hasBasicWordContent(row))
    .map((row, index) => ({
      id: String(row._wordId ?? '').trim() || `${info.id || 'set'}_${index + 1}`,
      setId: info.id,
      japanese: String(row.JP ?? ''),
      reading: String(row['読'] ?? ''),
      meaning: String(row.KR ?? ''),
      type: parseWordType(row['유형']),
      difficulty: parseDifficulty(row['난도']),
      verbInfo: parseOptionalText(row['동사']),
      sourceOrder: index,
    }))

  return normalizeBasicImport({
    id: info.id,
    name: info.name,
    order: 0,
    wordIdPrefix: info.wordIdPrefix,
    wordIds: [],
  }, words)
}

function parseThemeWorkbook(workbook: WorkBook, xlsx: Awaited<ReturnType<typeof loadXlsx>>): ParsedEditorWorkbook {
  const info = parseInfoRow(readRows<WordbookInfoColumn>(workbook, themeInfoSheetName, xlsx))
  const rawTopics = readRows<ThemeTopicColumn>(workbook, themeTopicsSheetName, xlsx)
  const rawWords = readRows<ThemeWordColumn>(workbook, themeWordsSheetName, xlsx)
  const topics: ThemeWordbookTopic[] = rawTopics
    .filter((row) => hasRowValue(row))
    .map((row, index) => ({
      id: String(row._topicId ?? '').trim() || `${info.id}_topic_${index + 1}`,
      name: String(row['주제'] ?? '').trim(),
      order: index,
      wordIds: [],
    }))

  const topicNameToId = new Map(topics.map((topic) => [topic.name, topic.id]))
  const words: VocabularyWord[] = []
  const wordTopicAssignments = new Map<string, string>()

  rawWords
    .filter((row) => hasRowValue(row) && hasThemeWordContent(row))
    .forEach((row, index) => {
      const topicName = String(row['주제'] ?? '').trim()
      let topicId = String(row._topicId ?? '').trim()

      if (!topicId && topicName) {
        topicId = topicNameToId.get(topicName) ?? ''
      }

      if (!topicId && topicName) {
        topicId = `${info.id}_topic_${topics.length + 1}`
        topics.push({
          id: topicId,
          name: topicName,
          order: topics.length,
          wordIds: [],
        })
        topicNameToId.set(topicName, topicId)
      }

      const word: VocabularyWord = {
        id: String(row._wordId ?? '').trim() || `${info.id}_${index + 1}`,
        setId: info.id,
        japanese: String(row.JP ?? ''),
        reading: String(row['読'] ?? ''),
        meaning: String(row.KR ?? ''),
        type: parseWordType(row['유형']),
        difficulty: parseDifficulty(row['난도']),
        verbInfo: parseOptionalText(row['동사']),
        sourceOrder: index,
      }

      words.push(word)
      if (topicId) {
        wordTopicAssignments.set(word.id, topicId)
      }
    })

  const wordbook: ThemeWordbook = {
    id: info.id,
    name: info.name,
    order: 0,
    wordIdPrefix: info.wordIdPrefix,
    kind: 'theme',
    topics: topics.map((topic) => ({
      ...topic,
      wordIds: words.filter((word) => wordTopicAssignments.get(word.id) === topic.id).map((word) => word.id),
    })),
  }

  return normalizeThemeImport(wordbook, words)
}

function parseCompareWorkbook(workbook: WorkBook, xlsx: Awaited<ReturnType<typeof loadXlsx>>): ParsedEditorWorkbook {
  const info = parseInfoRow(readRows<WordbookInfoColumn>(workbook, compareInfoSheetName, xlsx))
  const rawRows = readRows<ComparePairColumn>(workbook, comparePairsSheetName, xlsx)
    .filter((row) => hasRowValue(row))

  const pairBuckets = new Map<string, Array<Record<ComparePairColumn, unknown>>>()
  rawRows.forEach((row, index) => {
    const pairId = String(row._pairId ?? '').trim() || `${info.id}_pair_${Math.floor(index / 2) + 1}`
    if (!pairBuckets.has(pairId)) {
      pairBuckets.set(pairId, [])
    }
    pairBuckets.get(pairId)!.push(row)
  })

  const words: VocabularyWord[] = []
  const pairs: ComparisonPair[] = []

  ;[...pairBuckets.entries()].forEach(([pairId, rows], pairIndex) => {
    const leftRow = rows.find((row) => String(row._side ?? '').trim() === 'left') ?? rows[0]
    const rightRow = rows.find((row) => String(row._side ?? '').trim() === 'right') ?? rows[1] ?? rows[0]
    const sharedDescription = String(leftRow['설명'] ?? rightRow['설명'] ?? '').trim()

    const leftWordId = String(leftRow._wordId ?? '').trim() || `${info.id}_left_${pairIndex + 1}`
    const rightWordId = String(rightRow._wordId ?? '').trim() || `${info.id}_right_${pairIndex + 1}`

    words.push({
      id: leftWordId,
      setId: info.id,
      japanese: String(leftRow.JP ?? ''),
      reading: String(leftRow['読'] ?? ''),
      meaning: String(leftRow.KR ?? ''),
      type: parseWordType(leftRow['유형']),
      difficulty: parseDifficulty(leftRow['난도']),
      verbInfo: parseOptionalText(leftRow['동사']),
      sourceOrder: pairIndex * 2,
    })
    words.push({
      id: rightWordId,
      setId: info.id,
      japanese: String(rightRow.JP ?? ''),
      reading: String(rightRow['読'] ?? ''),
      meaning: String(rightRow.KR ?? ''),
      type: parseWordType(rightRow['유형']),
      difficulty: parseDifficulty(rightRow['난도']),
      verbInfo: parseOptionalText(rightRow['동사']),
      sourceOrder: pairIndex * 2 + 1,
    })

    pairs.push({
      id: pairId,
      bookId: info.id,
      leftWordId,
      rightWordId,
      leftDescription: sharedDescription,
      rightDescription: sharedDescription,
      sourceOrder: pairIndex,
    })
  })

  return normalizeCompareImport({
    id: info.id,
    name: info.name,
    order: 0,
    wordIdPrefix: info.wordIdPrefix,
    kind: 'compare',
    pairIds: [],
  }, words, pairs)
}

export function editorWorkbookFileName(mode: EditorWorkbookMode, wordbookName: string) {
  const safeName = sanitizeFileSegment(wordbookName) || 'wordbook'
  return `wordbook-${mode}-${safeName}.xlsx`
}

export async function buildEditorWorkbook(snapshot: EditorSnapshot, scope: EditorWorkbookScope) {
  const xlsx = await loadXlsx()
  const workbook = scope.mode === 'basic'
    ? buildBasicWorkbook(xlsx, snapshot, scope.setId)
    : scope.mode === 'theme'
      ? buildThemeWorkbook(xlsx, snapshot, scope.wordbookId)
      : buildCompareWorkbook(xlsx, snapshot, scope.wordbookId)

  return xlsx.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

export async function parseEditorWorkbook(buffer: ArrayBuffer, mode: EditorWorkbookMode): Promise<ParsedEditorWorkbook> {
  const xlsx = await loadXlsx()
  const workbook = xlsx.read(buffer, { type: 'array' })

  if (mode === 'basic') {
    return parseBasicWorkbook(workbook, xlsx)
  }

  if (mode === 'theme') {
    return parseThemeWorkbook(workbook, xlsx)
  }

  return parseCompareWorkbook(workbook, xlsx)
}
