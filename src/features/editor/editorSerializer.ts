import type { ComparisonPair, ComparisonWordbook, ThemeWordbook, ThemeWordbookTopic, VocabularySet, VocabularyWord } from '@/features/vocab/model/types'
import type { EditorSnapshot } from '@/features/editor/editorData'

export const editorWorkspaceFiles = {
  setsJson: ['src', 'features', 'vocab', 'editor-data', 'vocabularySets.json'],
  wordsJson: ['src', 'features', 'vocab', 'editor-data', 'vocabularyWords.json'],
  themeWordbooksJson: ['src', 'features', 'vocab', 'editor-data', 'themeWordbooks.json'],
  themeWordsJson: ['src', 'features', 'vocab', 'editor-data', 'themeWords.json'],
  comparisonWordbooksJson: ['src', 'features', 'vocab', 'editor-data', 'comparisonWordbooks.json'],
  comparisonWordsJson: ['src', 'features', 'vocab', 'editor-data', 'comparisonWords.json'],
  comparisonPairsJson: ['src', 'features', 'vocab', 'editor-data', 'comparisonPairs.json'],
  setsTs: ['src', 'features', 'vocab', 'data', 'vocabularySets.ts'],
  wordsTs: ['src', 'features', 'vocab', 'data', 'vocabularyWords.ts'],
  themeWordbooksTs: ['src', 'features', 'vocab', 'data', 'themeWordbooks.ts'],
  themeWordsTs: ['src', 'features', 'vocab', 'data', 'themeWords.ts'],
  comparisonWordbooksTs: ['src', 'features', 'vocab', 'data', 'comparisonWordbooks.ts'],
  comparisonWordsTs: ['src', 'features', 'vocab', 'data', 'comparisonWords.ts'],
  comparisonPairsTs: ['src', 'features', 'vocab', 'data', 'comparisonPairs.ts'],
  indexTs: ['src', 'features', 'vocab', 'data', 'index.ts'],
} as const

export type EditorIssue = {
  scope: 'set' | 'word' | 'themeWordbook' | 'themeTopic' | 'themeWord' | 'comparisonWordbook' | 'comparisonWord' | 'comparisonPair'
  id: string
  field: string
  message: string
}

function cloneSets(sets: VocabularySet[]) {
  return sets.map((set) => ({ ...set, wordIds: [...set.wordIds] }))
}

function cloneWords(words: VocabularyWord[]) {
  return words.map((word) => ({ ...word }))
}

function cloneThemeWordbooks(themeWordbooks: ThemeWordbook[]) {
  return themeWordbooks.map((wordbook) => ({
    ...wordbook,
    topics: wordbook.topics.map((topic) => ({ ...topic, wordIds: [...topic.wordIds] })),
  }))
}

function cloneComparisonWordbooks(comparisonWordbooks: ComparisonWordbook[]) {
  return comparisonWordbooks.map((wordbook) => ({ ...wordbook, pairIds: [...wordbook.pairIds] }))
}

function cloneComparisonPairs(comparisonPairs: ComparisonPair[]) {
  return comparisonPairs.map((pair) => ({ ...pair }))
}

function compareWords(left: VocabularyWord, right: VocabularyWord) {
  if (left.sourceOrder !== right.sourceOrder) {
    return left.sourceOrder - right.sourceOrder
  }

  return left.id.localeCompare(right.id)
}

function compareTopics(left: ThemeWordbookTopic, right: ThemeWordbookTopic) {
  if (left.order !== right.order) {
    return left.order - right.order
  }

  return left.id.localeCompare(right.id)
}

function comparePairs(left: ComparisonPair, right: ComparisonPair) {
  if (left.sourceOrder !== right.sourceOrder) {
    return left.sourceOrder - right.sourceOrder
  }

  return left.id.localeCompare(right.id)
}

function toTsLiteral(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function formatThemeTopicId(wordbookId: string, index: number) {
  return `${wordbookId}_theme_${index}`
}

function formatComparisonPairId(wordbookId: string, index: number) {
  return `${wordbookId}_pair_${index}`
}

function sanitizeWordIdPrefix(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9가-힣_-]+/g, '')
    .replace(/^[_-]+|[_-]+$/g, '')
}

function extractWordIdPrefix(wordId: string) {
  const trimmed = wordId.trim()
  const match = trimmed.match(/^(.*?)(?:[_-]?)(\d+)$/)
  if (!match) {
    return ''
  }

  return sanitizeWordIdPrefix(match[1] ?? '')
}

function inferWordIdPrefix(words: VocabularyWord[], fallback: string) {
  for (const word of words) {
    const prefix = extractWordIdPrefix(word.id)
    if (prefix) {
      return prefix
    }
  }

  return sanitizeWordIdPrefix(fallback) || 'Word'
}

function normalizeWordIdPrefix(value: string | undefined, fallback: string) {
  return sanitizeWordIdPrefix(value ?? '') || sanitizeWordIdPrefix(fallback) || 'Word'
}

function normalizeComparisonDescription(value: string | undefined) {
  return (value ?? '').replace(/\r\n?/g, '\n')
}

function formatGeneratedWordId(prefix: string, index: number) {
  return `${prefix.replace(/[_-]+$/g, '')}_${index}`
}

export function createUniqueWordIdPrefix(existingPrefixes: Iterable<string>, base = 'Word') {
  const taken = new Set(
    [...existingPrefixes]
      .map((prefix) => sanitizeWordIdPrefix(prefix))
      .filter((prefix) => prefix.length > 0),
  )
  const normalizedBase = sanitizeWordIdPrefix(base) || 'Word'

  if (!taken.has(normalizedBase)) {
    return normalizedBase
  }

  let index = 2
  while (taken.has(`${normalizedBase}${index}`)) {
    index += 1
  }

  return `${normalizedBase}${index}`
}

function normalizeWordsForParents(words: VocabularyWord[], orderedParentIds: string[]) {
  const parentOrder = new Map(orderedParentIds.map((id, index) => [id, index]))
  const normalizedWords = [...cloneWords(words)]
    .sort((left, right) => {
      const leftParentOrder = parentOrder.get(left.setId) ?? Number.MAX_SAFE_INTEGER
      const rightParentOrder = parentOrder.get(right.setId) ?? Number.MAX_SAFE_INTEGER
      if (leftParentOrder !== rightParentOrder) {
        return leftParentOrder - rightParentOrder
      }

      return compareWords(left, right)
    })
    .map((word) => ({ ...word }))

  const perParentOrder = new Map<string, number>()
  normalizedWords.forEach((word) => {
    const nextOrder = perParentOrder.get(word.setId) ?? 0
    word.sourceOrder = nextOrder
    perParentOrder.set(word.setId, nextOrder + 1)
  })

  return normalizedWords
}

export function slugifyEditorId(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function createUniqueId(existingIds: Iterable<string>, base: string) {
  const taken = new Set(existingIds)
  const normalizedBase = slugifyEditorId(base) || 'item'

  if (!taken.has(normalizedBase)) {
    return normalizedBase
  }

  let index = 2
  while (taken.has(`${normalizedBase}-${index}`)) {
    index += 1
  }

  return `${normalizedBase}-${index}`
}

export function normalizeEditorSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  const sets = cloneSets(snapshot.sets)
    .map((set, index) => ({
      ...set,
      order: index,
      wordIdPrefix: normalizeWordIdPrefix(
        set.wordIdPrefix,
        inferWordIdPrefix(
          snapshot.words.filter((word) => word.setId === set.id),
          set.id,
        ),
      ),
      wordIds: [] as string[],
    }))

  const normalizedWords = normalizeWordsForParents(snapshot.words, sets.map((set) => set.id))
  sets.forEach((set) => {
    set.wordIds = normalizedWords.filter((word) => word.setId === set.id).map((word) => word.id)
  })

  const themeWordbooks = cloneThemeWordbooks(snapshot.themeWordbooks)
    .map((wordbook, index) => ({
      ...wordbook,
      order: index,
      wordIdPrefix: normalizeWordIdPrefix(
        wordbook.wordIdPrefix,
        inferWordIdPrefix(
          snapshot.themeWords.filter((word) => word.setId === wordbook.id),
          wordbook.id,
        ),
      ),
      topics: [...wordbook.topics]
        .sort(compareTopics)
        .map((topic, topicIndex) => ({
          ...topic,
          id: formatThemeTopicId(wordbook.id, topicIndex + 1),
          order: topicIndex,
        })),
    }))
  const normalizedThemeWords = normalizeWordsForParents(snapshot.themeWords, themeWordbooks.map((wordbook) => wordbook.id))
  const themeWordIdSet = new Set(normalizedThemeWords.map((word) => word.id))
  themeWordbooks.forEach((wordbook) => {
    wordbook.topics = wordbook.topics.map((topic) => ({
      ...topic,
      wordIds: topic.wordIds.filter((wordId) => themeWordIdSet.has(wordId)),
    }))
  })

  const comparisonWordbooks = cloneComparisonWordbooks(snapshot.comparisonWordbooks)
    .map((wordbook, index) => ({
      ...wordbook,
      order: index,
      wordIdPrefix: normalizeWordIdPrefix(
        wordbook.wordIdPrefix,
        inferWordIdPrefix(
          snapshot.comparisonWords.filter((word) => word.setId === wordbook.id),
          wordbook.id,
        ),
      ),
      pairIds: [] as string[],
    }))
  const normalizedComparisonWords = normalizeWordsForParents(snapshot.comparisonWords, comparisonWordbooks.map((wordbook) => wordbook.id))

  const comparisonBookOrder = new Map(comparisonWordbooks.map((wordbook, index) => [wordbook.id, index]))
  const normalizedPairs = [...cloneComparisonPairs(snapshot.comparisonPairs)]
    .sort((left, right) => {
      const leftBookOrder = comparisonBookOrder.get(left.bookId) ?? Number.MAX_SAFE_INTEGER
      const rightBookOrder = comparisonBookOrder.get(right.bookId) ?? Number.MAX_SAFE_INTEGER
      if (leftBookOrder !== rightBookOrder) {
        return leftBookOrder - rightBookOrder
      }

      return comparePairs(left, right)
    })
    .map((pair) => ({
      ...pair,
      leftDescription: normalizeComparisonDescription(pair.leftDescription),
      rightDescription: normalizeComparisonDescription(pair.rightDescription),
    }))

  const perBookPairOrder = new Map<string, number>()
  normalizedPairs.forEach((pair) => {
    const nextOrder = perBookPairOrder.get(pair.bookId) ?? 0
    pair.sourceOrder = nextOrder
    perBookPairOrder.set(pair.bookId, nextOrder + 1)
  })

  comparisonWordbooks.forEach((wordbook) => {
    wordbook.pairIds = normalizedPairs.filter((pair) => pair.bookId === wordbook.id).map((pair) => pair.id)
  })

  return {
    sets,
    words: normalizedWords,
    themeWordbooks,
    themeWords: normalizedThemeWords,
    comparisonWordbooks,
    comparisonWords: normalizedComparisonWords,
    comparisonPairs: normalizedPairs,
  }
}

export function createEmptySet(snapshot: EditorSnapshot) {
  const id = createUniqueId(
    snapshot.sets.map((set) => set.id),
    `set-${snapshot.sets.length + 1}`,
  )

  return {
    id,
    name: `세트 ${snapshot.sets.length + 1}`,
    order: snapshot.sets.length,
    wordIdPrefix: createUniqueWordIdPrefix(snapshot.sets.map((set) => set.wordIdPrefix ?? ''), 'Word'),
    wordIds: [],
  } satisfies VocabularySet
}

export function createEmptyWord(snapshot: EditorSnapshot, setId: string) {
  const id = createUniqueId(
    snapshot.words.map((word) => word.id),
    `${setId}-word-${snapshot.words.filter((word) => word.setId === setId).length + 1}`,
  )

  return {
    id,
    setId,
    japanese: '',
    reading: '',
    meaning: '',
    type: 'noun',
    difficulty: null,
    verbInfo: null,
    sourceOrder: snapshot.words.filter((word) => word.setId === setId).length,
  } satisfies VocabularyWord
}

export function createEmptyThemeWordbook(snapshot: EditorSnapshot) {
  const id = createUniqueId(
    snapshot.themeWordbooks.map((wordbook) => wordbook.id),
    `theme-book-${snapshot.themeWordbooks.length + 1}`,
  )

  return {
    id,
    name: `주제형 ${snapshot.themeWordbooks.length + 1}`,
    order: snapshot.themeWordbooks.length,
    wordIdPrefix: createUniqueWordIdPrefix(
      [
        ...snapshot.sets.map((set) => set.wordIdPrefix ?? ''),
        ...snapshot.themeWordbooks.map((wordbook) => wordbook.wordIdPrefix ?? ''),
      ],
      'Word',
    ),
    kind: 'theme',
    topics: [],
  } satisfies ThemeWordbook
}

export function createEmptyThemeTopic(snapshot: EditorSnapshot, wordbookId: string) {
  const wordbook = snapshot.themeWordbooks.find((item) => item.id === wordbookId)
  const nextIndex = (wordbook?.topics.length ?? 0) + 1

  return {
    id: formatThemeTopicId(wordbookId, nextIndex),
    name: `주제 ${nextIndex}`,
    order: wordbook?.topics.length ?? 0,
    wordIds: [],
  } satisfies ThemeWordbookTopic
}

export function createEmptyThemeWord(snapshot: EditorSnapshot, wordbookId: string) {
  const id = createUniqueId(
    snapshot.themeWords.map((word) => word.id),
    `${wordbookId}-word-${snapshot.themeWords.filter((word) => word.setId === wordbookId).length + 1}`,
  )

  return {
    id,
    setId: wordbookId,
    japanese: '',
    reading: '',
    meaning: '',
    type: 'noun',
    difficulty: null,
    verbInfo: null,
    sourceOrder: snapshot.themeWords.filter((word) => word.setId === wordbookId).length,
  } satisfies VocabularyWord
}

export function createEmptyComparisonWordbook(snapshot: EditorSnapshot) {
  const id = createUniqueId(
    snapshot.comparisonWordbooks.map((wordbook) => wordbook.id),
    `compare-book-${snapshot.comparisonWordbooks.length + 1}`,
  )

  return {
    id,
    name: `비교형 ${snapshot.comparisonWordbooks.length + 1}`,
    order: snapshot.comparisonWordbooks.length,
    wordIdPrefix: createUniqueWordIdPrefix(
      [
        ...snapshot.sets.map((set) => set.wordIdPrefix ?? ''),
        ...snapshot.themeWordbooks.map((wordbook) => wordbook.wordIdPrefix ?? ''),
        ...snapshot.comparisonWordbooks.map((wordbook) => wordbook.wordIdPrefix ?? ''),
      ],
      'Word',
    ),
    kind: 'compare',
    pairIds: [],
  } satisfies ComparisonWordbook
}

export function createEmptyComparisonWord(snapshot: EditorSnapshot, wordbookId: string) {
  const id = createUniqueId(
    snapshot.comparisonWords.map((word) => word.id),
    `${wordbookId}-word-${snapshot.comparisonWords.filter((word) => word.setId === wordbookId).length + 1}`,
  )

  return {
    id,
    setId: wordbookId,
    japanese: '',
    reading: '',
    meaning: '',
    type: 'noun',
    difficulty: null,
    verbInfo: null,
    sourceOrder: snapshot.comparisonWords.filter((word) => word.setId === wordbookId).length,
  } satisfies VocabularyWord
}

export function createEmptyComparisonPair(snapshot: EditorSnapshot, bookId: string) {
  const comparisonBookWords = snapshot.comparisonWords.filter((word) => word.setId === bookId)
  const id = createUniqueId(
    snapshot.comparisonPairs.map((pair) => pair.id),
    `${bookId}-pair-${snapshot.comparisonPairs.filter((pair) => pair.bookId === bookId).length + 1}`,
  )

  return {
    id,
    bookId,
    leftWordId: comparisonBookWords[0]?.id ?? '',
    rightWordId: comparisonBookWords[1]?.id ?? comparisonBookWords[0]?.id ?? '',
    leftDescription: '',
    rightDescription: '',
    sourceOrder: snapshot.comparisonPairs.filter((pair) => pair.bookId === bookId).length,
  } satisfies ComparisonPair
}

export function duplicateWord(snapshotWords: VocabularyWord[], source: VocabularyWord) {
  return {
    ...source,
    id: createUniqueId(
      snapshotWords.map((word) => word.id),
      `${source.id}-copy`,
    ),
  } satisfies VocabularyWord
}

export function validateEditorSnapshot(snapshot: EditorSnapshot) {
  const issues: EditorIssue[] = []
  const { sets: publishedSets, words: publishedWords } = buildPublishedBasicWordData(snapshot)
  const { wordbooks: publishedThemeWordbooks, words: publishedThemeWords, idMap: publishedThemeWordIds } = buildPublishedThemeWordData(snapshot)
  const setIds = new Set<string>()
  const setWordIdPrefixes = new Set<string>()
  const wordIds = new Set<string>()
  const themeWordbookIds = new Set<string>()
  const themeWordbookPrefixes = new Set<string>()
  const themeWordIds = new Set<string>()
  const comparisonWordbookIds = new Set<string>()
  const comparisonWordbookPrefixes = new Set<string>()
  const comparisonWordIds = new Set<string>()
  const comparisonPairIds = new Set<string>()

  publishedSets.forEach((set) => {
    if (!set.id.trim()) {
      issues.push({ scope: 'set', id: set.id, field: 'id', message: '세트 ID' })
    }

    if (setIds.has(set.id)) {
      issues.push({ scope: 'set', id: set.id, field: 'id', message: '세트 ID 중복' })
    }

    setIds.add(set.id)

    if (!set.wordIdPrefix?.trim()) {
      issues.push({ scope: 'set', id: set.id, field: 'wordIdPrefix', message: '단어 ID 접두사' })
    }

    if (set.wordIdPrefix && setWordIdPrefixes.has(set.wordIdPrefix)) {
      issues.push({ scope: 'set', id: set.id, field: 'wordIdPrefix', message: '단어 ID 접두사 중복' })
    }

    if (set.wordIdPrefix) {
      setWordIdPrefixes.add(set.wordIdPrefix)
    }
  })

  publishedWords.forEach((word) => {
    if (!word.id.trim()) {
      issues.push({ scope: 'word', id: word.id, field: 'id', message: '단어 ID' })
    }

    if (wordIds.has(word.id)) {
      issues.push({ scope: 'word', id: word.id, field: 'id', message: '단어 ID 중복' })
    }

    wordIds.add(word.id)

    if (!setIds.has(word.setId)) {
      issues.push({ scope: 'word', id: word.id, field: 'setId', message: '없는 세트' })
    }

    if (word.difficulty !== null && !Number.isFinite(word.difficulty)) {
      issues.push({ scope: 'word', id: word.id, field: 'difficulty', message: '난도 값 오류' })
    }
  })

  publishedThemeWordbooks.forEach((wordbook) => {
    if (!wordbook.id.trim()) {
      issues.push({ scope: 'themeWordbook', id: wordbook.id, field: 'id', message: '주제형 ID' })
    }

    if (themeWordbookIds.has(wordbook.id)) {
      issues.push({ scope: 'themeWordbook', id: wordbook.id, field: 'id', message: '주제형 ID 중복' })
    }

    themeWordbookIds.add(wordbook.id)

    if (!wordbook.wordIdPrefix?.trim()) {
      issues.push({ scope: 'themeWordbook', id: wordbook.id, field: 'wordIdPrefix', message: '단어 ID 접두사' })
    }

    if (
      wordbook.wordIdPrefix
      && (setWordIdPrefixes.has(wordbook.wordIdPrefix) || themeWordbookPrefixes.has(wordbook.wordIdPrefix))
    ) {
      issues.push({ scope: 'themeWordbook', id: wordbook.id, field: 'wordIdPrefix', message: '단어 ID 접두사 중복' })
    }

    if (wordbook.wordIdPrefix) {
      themeWordbookPrefixes.add(wordbook.wordIdPrefix)
    }
  })

  publishedThemeWords.forEach((word) => {
    if (!word.id.trim()) {
      issues.push({ scope: 'themeWord', id: word.id, field: 'id', message: '주제형 단어 ID' })
    }

    if (themeWordIds.has(word.id) || wordIds.has(word.id)) {
      issues.push({ scope: 'themeWord', id: word.id, field: 'id', message: '주제형 단어 ID 중복' })
    }

    themeWordIds.add(word.id)

    if (!themeWordbookIds.has(word.setId)) {
      issues.push({ scope: 'themeWord', id: word.id, field: 'setId', message: '없는 주제형' })
    }

    if (word.difficulty !== null && !Number.isFinite(word.difficulty)) {
      issues.push({ scope: 'themeWord', id: word.id, field: 'difficulty', message: '주제형 난도 값 오류' })
    }
  })

  snapshot.themeWordbooks.forEach((wordbook) => {
    wordbook.topics.forEach((topic) => {
      topic.wordIds.forEach((wordId) => {
        const publishedWordId = publishedThemeWordIds.get(wordId)
        if (!publishedWordId || !themeWordIds.has(publishedWordId)) {
          issues.push({ scope: 'themeTopic', id: topic.id, field: 'wordIds', message: '주제형 단어 ID 오류' })
        }
      })
    })
  })

  snapshot.comparisonWordbooks.forEach((wordbook) => {
    if (!wordbook.id.trim()) {
      issues.push({ scope: 'comparisonWordbook', id: wordbook.id, field: 'id', message: '비교형 ID' })
    }

    if (comparisonWordbookIds.has(wordbook.id)) {
      issues.push({ scope: 'comparisonWordbook', id: wordbook.id, field: 'id', message: '비교형 ID 중복' })
    }

    comparisonWordbookIds.add(wordbook.id)

    if (!wordbook.wordIdPrefix?.trim()) {
      issues.push({ scope: 'comparisonWordbook', id: wordbook.id, field: 'wordIdPrefix', message: '단어 ID 접두사' })
    }

    if (
      wordbook.wordIdPrefix
      && (
        setWordIdPrefixes.has(wordbook.wordIdPrefix)
        || themeWordbookPrefixes.has(wordbook.wordIdPrefix)
        || comparisonWordbookPrefixes.has(wordbook.wordIdPrefix)
      )
    ) {
      issues.push({ scope: 'comparisonWordbook', id: wordbook.id, field: 'wordIdPrefix', message: '단어 ID 접두사 중복' })
    }

    if (wordbook.wordIdPrefix) {
      comparisonWordbookPrefixes.add(wordbook.wordIdPrefix)
    }
  })

  snapshot.comparisonWords.forEach((word) => {
    if (!word.id.trim()) {
      issues.push({ scope: 'comparisonWord', id: word.id, field: 'id', message: '비교형 단어 ID' })
    }

    if (comparisonWordIds.has(word.id) || wordIds.has(word.id) || themeWordIds.has(word.id)) {
      issues.push({ scope: 'comparisonWord', id: word.id, field: 'id', message: '비교형 단어 ID 중복' })
    }

    comparisonWordIds.add(word.id)

    if (!comparisonWordbookIds.has(word.setId)) {
      issues.push({ scope: 'comparisonWord', id: word.id, field: 'setId', message: '없는 비교형' })
    }

    if (word.difficulty !== null && !Number.isFinite(word.difficulty)) {
      issues.push({ scope: 'comparisonWord', id: word.id, field: 'difficulty', message: '비교형 난도 값 오류' })
    }
  })

  snapshot.comparisonPairs.forEach((pair) => {
    if (!pair.id.trim()) {
      issues.push({ scope: 'comparisonPair', id: pair.id, field: 'id', message: '비교 카드 ID' })
    }

    if (comparisonPairIds.has(pair.id)) {
      issues.push({ scope: 'comparisonPair', id: pair.id, field: 'id', message: '비교 카드 ID 중복' })
    }

    comparisonPairIds.add(pair.id)

    if (!comparisonWordbookIds.has(pair.bookId)) {
      issues.push({ scope: 'comparisonPair', id: pair.id, field: 'bookId', message: '없는 비교형' })
    }

    if (!comparisonWordIds.has(pair.leftWordId) || !comparisonWordIds.has(pair.rightWordId)) {
      issues.push({ scope: 'comparisonPair', id: pair.id, field: 'wordId', message: '비교형 단어 ID 오류' })
    }
  })

  return issues
}

function buildPublishedBasicWordData(snapshot: EditorSnapshot) {
  const sets = cloneSets(snapshot.sets)
    .map((set, index) => ({
      ...set,
      order: index,
      wordIdPrefix: normalizeWordIdPrefix(
        set.wordIdPrefix,
        inferWordIdPrefix(
          snapshot.words.filter((word) => word.setId === set.id),
          set.id,
        ),
      ),
      wordIds: [] as string[],
    }))
  const words = normalizeWordsForParents(snapshot.words, sets.map((set) => set.id))
  const nextWordIds = new Map<string, string>()

  sets.forEach((set) => {
    const prefix = normalizeWordIdPrefix(set.wordIdPrefix, set.id)
    const setWords = words.filter((word) => word.setId === set.id)
    set.wordIdPrefix = prefix
    setWords.forEach((word, index) => {
      nextWordIds.set(word.id, formatGeneratedWordId(prefix, index + 1))
    })
  })

  const publishedWords = words.map((word) => ({
    ...word,
    id: nextWordIds.get(word.id) ?? word.id,
  }))

  sets.forEach((set) => {
    set.wordIds = publishedWords.filter((word) => word.setId === set.id).map((word) => word.id)
  })

  return {
    sets,
    words: publishedWords,
  }
}

function buildPublishedThemeWordData(snapshot: EditorSnapshot) {
  const wordbooks = cloneThemeWordbooks(snapshot.themeWordbooks)
    .map((wordbook, index) => ({
      ...wordbook,
      order: index,
      wordIdPrefix: normalizeWordIdPrefix(
        wordbook.wordIdPrefix,
        inferWordIdPrefix(
          snapshot.themeWords.filter((word) => word.setId === wordbook.id),
          wordbook.id,
        ),
      ),
      topics: [...wordbook.topics]
        .sort(compareTopics)
        .map((topic, topicIndex) => ({
          ...topic,
          id: formatThemeTopicId(wordbook.id, topicIndex + 1),
          order: topicIndex,
        })),
    }))
  const words = normalizeWordsForParents(snapshot.themeWords, wordbooks.map((wordbook) => wordbook.id))
  const nextWordIds = new Map<string, string>()

  wordbooks.forEach((wordbook) => {
    const prefix = normalizeWordIdPrefix(wordbook.wordIdPrefix, wordbook.id)
    const bookWords = words.filter((word) => word.setId === wordbook.id)
    wordbook.wordIdPrefix = prefix
    bookWords.forEach((word, index) => {
      nextWordIds.set(word.id, formatGeneratedWordId(prefix, index + 1))
    })
  })

  const publishedWords = words.map((word) => ({
    ...word,
    id: nextWordIds.get(word.id) ?? word.id,
  }))

  wordbooks.forEach((wordbook) => {
    wordbook.topics = wordbook.topics.map((topic) => ({
      ...topic,
      wordIds: topic.wordIds
        .map((wordId) => nextWordIds.get(wordId))
        .filter((wordId): wordId is string => Boolean(wordId)),
    }))
  })

  return {
    wordbooks,
    words: publishedWords,
    idMap: nextWordIds,
  }
}

function buildPublishedComparisonWordData(snapshot: EditorSnapshot) {
  const wordbooks = cloneComparisonWordbooks(snapshot.comparisonWordbooks)
    .map((wordbook, index) => ({
      ...wordbook,
      order: index,
      wordIdPrefix: normalizeWordIdPrefix(
        wordbook.wordIdPrefix,
        inferWordIdPrefix(
          snapshot.comparisonWords.filter((word) => word.setId === wordbook.id),
          wordbook.id,
        ),
      ),
      pairIds: [] as string[],
    }))
  const words = normalizeWordsForParents(snapshot.comparisonWords, wordbooks.map((wordbook) => wordbook.id))
  const nextWordIds = new Map<string, string>()

  wordbooks.forEach((wordbook) => {
    const prefix = normalizeWordIdPrefix(wordbook.wordIdPrefix, wordbook.id)
    const bookWords = words.filter((word) => word.setId === wordbook.id)
    wordbook.wordIdPrefix = prefix
    bookWords.forEach((word, index) => {
      nextWordIds.set(word.id, formatGeneratedWordId(prefix, index + 1))
    })
  })

  const publishedWords = words.map((word) => ({
    ...word,
    id: nextWordIds.get(word.id) ?? word.id,
  }))

  const comparisonBookOrder = new Map(wordbooks.map((wordbook, index) => [wordbook.id, index]))
  const sortedPairs = [...cloneComparisonPairs(snapshot.comparisonPairs)]
    .sort((left, right) => {
      const leftBookOrder = comparisonBookOrder.get(left.bookId) ?? Number.MAX_SAFE_INTEGER
      const rightBookOrder = comparisonBookOrder.get(right.bookId) ?? Number.MAX_SAFE_INTEGER
      if (leftBookOrder !== rightBookOrder) {
        return leftBookOrder - rightBookOrder
      }

      return comparePairs(left, right)
    })
    .map((pair) => ({
      ...pair,
      leftDescription: normalizeComparisonDescription(pair.leftDescription),
      rightDescription: normalizeComparisonDescription(pair.rightDescription),
    }))

  const perBookPairOrder = new Map<string, number>()
  const publishedPairs = sortedPairs.map((pair) => {
    const nextOrder = perBookPairOrder.get(pair.bookId) ?? 0
    perBookPairOrder.set(pair.bookId, nextOrder + 1)

    return {
      ...pair,
      id: formatComparisonPairId(pair.bookId, nextOrder + 1),
      leftWordId: nextWordIds.get(pair.leftWordId) ?? pair.leftWordId,
      rightWordId: nextWordIds.get(pair.rightWordId) ?? pair.rightWordId,
      sourceOrder: nextOrder,
    }
  })

  wordbooks.forEach((wordbook) => {
    wordbook.pairIds = publishedPairs.filter((pair) => pair.bookId === wordbook.id).map((pair) => pair.id)
  })

  return {
    wordbooks,
    words: publishedWords,
    pairs: publishedPairs,
  }
}

export function buildPublishedEditorSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  const normalized = normalizeEditorSnapshot(snapshot)
  const { sets, words } = buildPublishedBasicWordData(normalized)
  const { wordbooks: themeWordbooks, words: themeWords } = buildPublishedThemeWordData(normalized)
  const { wordbooks: comparisonWordbooks, words: comparisonWords, pairs: comparisonPairs } = buildPublishedComparisonWordData(normalized)

  return {
    ...normalized,
    sets,
    words,
    themeWordbooks,
    themeWords,
    comparisonWordbooks,
    comparisonWords,
    comparisonPairs,
  }
}

export function buildEditorFileOutputs(snapshot: EditorSnapshot) {
  const normalized = buildPublishedEditorSnapshot(snapshot)

  return [
    {
      path: [...editorWorkspaceFiles.setsJson],
      content: `${JSON.stringify(normalized.sets, null, 2)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.wordsJson],
      content: `${JSON.stringify(normalized.words, null, 2)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.themeWordbooksJson],
      content: `${JSON.stringify(normalized.themeWordbooks, null, 2)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.themeWordsJson],
      content: `${JSON.stringify(normalized.themeWords, null, 2)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.comparisonWordbooksJson],
      content: `${JSON.stringify(normalized.comparisonWordbooks, null, 2)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.comparisonWordsJson],
      content: `${JSON.stringify(normalized.comparisonWords, null, 2)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.comparisonPairsJson],
      content: `${JSON.stringify(normalized.comparisonPairs, null, 2)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.setsTs],
      content: `import type { VocabularySet } from '../model/types'\n\nexport const vocabularySets: VocabularySet[] = ${toTsLiteral(normalized.sets)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.wordsTs],
      content: `import type { VocabularyWord } from '../model/types'\n\nexport const vocabularyWords: VocabularyWord[] = ${toTsLiteral(normalized.words)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.themeWordbooksTs],
      content: `import type { ThemeWordbook } from '../model/types'\n\nexport const themeWordbooks: ThemeWordbook[] = ${toTsLiteral(normalized.themeWordbooks)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.themeWordsTs],
      content: `import type { VocabularyWord } from '../model/types'\n\nexport const themeWords: VocabularyWord[] = ${toTsLiteral(normalized.themeWords)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.comparisonWordbooksTs],
      content: `import type { ComparisonWordbook } from '../model/types'\n\nexport const comparisonWordbooks: ComparisonWordbook[] = ${toTsLiteral(normalized.comparisonWordbooks)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.comparisonWordsTs],
      content: `import type { VocabularyWord } from '../model/types'\n\nexport const comparisonWords: VocabularyWord[] = ${toTsLiteral(normalized.comparisonWords)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.comparisonPairsTs],
      content: `import type { ComparisonPair } from '../model/types'\n\nexport const comparisonPairs: ComparisonPair[] = ${toTsLiteral(normalized.comparisonPairs)}\n`,
    },
    {
      path: [...editorWorkspaceFiles.indexTs],
      content: `export { comparisonPairs } from './comparisonPairs'\nexport { comparisonWords } from './comparisonWords'\nexport { comparisonWordbooks } from './comparisonWordbooks'\nexport { themeWords } from './themeWords'\nexport { themeWordbooks } from './themeWordbooks'\nexport { vocabularySets } from './vocabularySets'\nexport { vocabularyWords } from './vocabularyWords'\n`,
    },
  ]
}
