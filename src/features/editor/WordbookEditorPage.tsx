import {
  Fragment,
  memo,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import {
  ArrowDown,
  ArrowUp,
  Database,
  Download,
  FileText,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Save,
  ScanSearch,
  SquarePen,
  Trash2,
  Upload,
} from 'lucide-react'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import {
  editorComparisonPairs,
  editorComparisonWords,
  editorComparisonWordbooks,
  editorThemeWords,
  editorThemeWordbooks,
  editorVocabularySets,
  editorVocabularyWords,
  type EditorSnapshot,
  wordTypeOptions,
} from '@/features/editor/editorData'
import {
  buildEditorFileOutputs,
  createEmptyComparisonPair,
  createEmptyComparisonWord,
  createEmptyComparisonWordbook,
  createEmptySet,
  createEmptyThemeTopic,
  createEmptyThemeWord,
  createEmptyThemeWordbook,
  createEmptyWord,
  duplicateWord,
  normalizeEditorSnapshot,
  normalizeSmartReviewPrompt,
  validateEditorSnapshot,
} from '@/features/editor/editorSerializer'
import {
  downloadBlobFile,
  downloadTextFile,
  ensureReadWritePermission,
  getReadWritePermissionState,
  loadSavedWorkspaceHandle,
  pickWorkspaceDirectory,
  saveWorkspaceHandle,
  supportsDirectoryPicker,
  verifyWorkspaceDirectory,
  writeTextFile,
} from '@/features/editor/editorPersistence'
import { buildEditorWorkbook, editorWorkbookFileName, parseEditorWorkbook, type EditorWorkbookScope, type ParsedEditorWorkbook } from '@/features/editor/editorSpreadsheet'
import { matchesWordSearch } from '@/lib/search'
import styles from '@/features/editor/editor.module.css'

type EditorMode = 'basic' | 'theme' | 'compare'
type EditorTableMode = 'word' | 'prompt'
type EditorSaveState = 'idle' | 'saving' | 'saved' | 'error'
type SnapshotSetter = Dispatch<SetStateAction<EditorSnapshot>>
type SaveStateSetter = Dispatch<SetStateAction<EditorSaveState>>
type ChangeTickSetter = Dispatch<SetStateAction<number>>
type EditorWord = EditorSnapshot['words'][number]
type ThemeWord = EditorSnapshot['themeWords'][number]
type SmartReviewPromptField = 'japaneseSentence' | 'translationSentence'

const initialSnapshot = normalizeEditorSnapshot({
  sets: editorVocabularySets,
  words: editorVocabularyWords,
  themeWordbooks: editorThemeWordbooks,
  themeWords: editorThemeWords,
  comparisonWordbooks: editorComparisonWordbooks,
  comparisonWords: editorComparisonWords,
  comparisonPairs: editorComparisonPairs,
})

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    sets: snapshot.sets.map((set) => ({ ...set, wordIds: [...set.wordIds] })),
    words: snapshot.words.map((word) => ({ ...word })),
    themeWordbooks: snapshot.themeWordbooks.map((wordbook) => ({
      ...wordbook,
      topics: wordbook.topics.map((topic) => ({ ...topic, wordIds: [...topic.wordIds] })),
    })),
    themeWords: snapshot.themeWords.map((word) => ({ ...word })),
    comparisonWordbooks: snapshot.comparisonWordbooks.map((wordbook) => ({ ...wordbook, pairIds: [...wordbook.pairIds] })),
    comparisonWords: snapshot.comparisonWords.map((word) => ({ ...word })),
    comparisonPairs: snapshot.comparisonPairs.map((pair) => ({ ...pair })),
  }
}

function difficultyInputValue(value: number | null) {
  return value === null ? '' : String(value)
}

function textInputValue(value: string | null) {
  return value ?? ''
}

type ResizableColumn = {
  label: string
  ariaLabel?: string
  resizable?: boolean
  width?: number
  fixed?: boolean
}

const basicWordColumns: ResizableColumn[] = [
  { label: '#', width: 44, fixed: true },
  { label: 'JP', resizable: true },
  { label: '読', resizable: true },
  { label: 'KR', resizable: true },
  { label: '유형', resizable: true },
  { label: '난도', resizable: true },
  { label: '동사', resizable: true },
]

const themeWordColumns: ResizableColumn[] = [
  { label: '#', width: 44, fixed: true },
  { label: 'JP', resizable: true },
  { label: '読', resizable: true },
  { label: 'KR', resizable: true },
  { label: '유형', resizable: true },
  { label: '주제', resizable: true },
  { label: '난도', resizable: true },
  { label: '동사', resizable: true },
]

const smartReviewPromptColumns: ResizableColumn[] = [
  { label: '#', width: 44, fixed: true },
  { label: 'JP', width: 160, resizable: true },
  { label: '読', width: 150, resizable: true },
  { label: 'KR', width: 180, resizable: true },
  { label: '例JP', ariaLabel: '예문 일본어', width: 360, resizable: true },
  { label: '例KR', ariaLabel: '예문 한국어', width: 360, resizable: true },
]

const comparisonPairColumns: ResizableColumn[] = [
  { label: '#', width: 44, fixed: true },
  { label: 'JP', resizable: true },
  { label: '読', resizable: true },
  { label: 'KR', resizable: true },
  { label: '유형', resizable: true },
  { label: '난도', resizable: true },
  { label: '동사', resizable: true },
  { label: '설명', resizable: true },
]

function insertWordAfterAnchor(words: EditorSnapshot['words'], anchorId: string | null, nextWord: EditorSnapshot['words'][number]) {
  const siblingWords = words
    .filter((word) => word.setId === nextWord.setId)
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
  const anchorIndex = siblingWords.findIndex((word) => word.id === anchorId)
  const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : siblingWords.length
  const targetOrder = siblingWords[insertIndex]?.sourceOrder ?? siblingWords.length

  return words
    .map((word) => {
      if (word.setId !== nextWord.setId || word.sourceOrder < targetOrder) {
        return word
      }

      return {
        ...word,
        sourceOrder: word.sourceOrder + 1,
      }
    })
    .concat({
      ...nextWord,
      sourceOrder: targetOrder,
    })
}

function markEditorDirty(
  setSaveState: SaveStateSetter,
  setChangeTick: ChangeTickSetter,
  changeTickRef: MutableRefObject<number>,
) {
  setSaveState('idle')
  setChangeTick((current) => {
    const next = current + 1
    changeTickRef.current = next
    return next
  })
}

function updateWordFieldInSnapshot<K extends keyof EditorWord>(
  snapshot: EditorSnapshot,
  wordId: string,
  field: K,
  value: EditorWord[K],
) {
  let changed = false
  const words = snapshot.words.map((word) => {
    if (word.id !== wordId) {
      return word
    }

    if (word[field] === value) {
      return word
    }

    changed = true
    return {
      ...word,
      [field]: value,
    } as EditorWord
  })

  return changed ? { ...snapshot, words } : snapshot
}

function updateThemeWordFieldInSnapshot<K extends keyof ThemeWord>(
  snapshot: EditorSnapshot,
  wordId: string,
  field: K,
  value: ThemeWord[K],
) {
  let changed = false
  const themeWords = snapshot.themeWords.map((word) => {
    if (word.id !== wordId) {
      return word
    }

    if (word[field] === value) {
      return word
    }

    changed = true
    return {
      ...word,
      [field]: value,
    } as ThemeWord
  })

  return changed ? { ...snapshot, themeWords } : snapshot
}

function updatePromptField(
  current: EditorWord['smartReviewPrompt'],
  field: SmartReviewPromptField,
  value: string,
) {
  return normalizeSmartReviewPrompt({
    japaneseSentence: current?.japaneseSentence ?? '',
    translationSentence: current?.translationSentence ?? '',
    [field]: value,
  })
}

function updateWordSmartReviewPromptInSnapshot(
  snapshot: EditorSnapshot,
  wordId: string,
  field: SmartReviewPromptField,
  value: string,
) {
  let changed = false
  const words = snapshot.words.map((word) => {
    if (word.id !== wordId) {
      return word
    }

    const nextPrompt = updatePromptField(word.smartReviewPrompt, field, value)
    if (JSON.stringify(word.smartReviewPrompt ?? null) === JSON.stringify(nextPrompt ?? null)) {
      return word
    }

    changed = true
    return {
      ...word,
      smartReviewPrompt: nextPrompt,
    }
  })

  return changed ? { ...snapshot, words } : snapshot
}

function updateThemeWordSmartReviewPromptInSnapshot(
  snapshot: EditorSnapshot,
  wordId: string,
  field: SmartReviewPromptField,
  value: string,
) {
  let changed = false
  const themeWords = snapshot.themeWords.map((word) => {
    if (word.id !== wordId) {
      return word
    }

    const nextPrompt = updatePromptField(word.smartReviewPrompt, field, value)
    if (JSON.stringify(word.smartReviewPrompt ?? null) === JSON.stringify(nextPrompt ?? null)) {
      return word
    }

    changed = true
    return {
      ...word,
      smartReviewPrompt: nextPrompt,
    }
  })

  return changed ? { ...snapshot, themeWords } : snapshot
}

function moveBasicWordInSnapshot(snapshot: EditorSnapshot, wordId: string, direction: -1 | 1) {
  const target = snapshot.words.find((word) => word.id === wordId)
  if (!target) {
    return snapshot
  }

  const siblingWords = snapshot.words
    .filter((word) => word.setId === target.setId)
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
  const index = siblingWords.findIndex((word) => word.id === wordId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= siblingWords.length) {
    return snapshot
  }

  const nextOrders = new Map<string, number>()
  const orderedIds = siblingWords.map((word) => word.id)
  ;[orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]]
  orderedIds.forEach((id, orderIndex) => {
    nextOrders.set(id, orderIndex)
  })

  let changed = false
  const words = snapshot.words.map((word) => {
    const nextOrder = nextOrders.get(word.id)
    if (nextOrder === undefined || nextOrder === word.sourceOrder) {
      return word
    }

    changed = true
    return {
      ...word,
      sourceOrder: nextOrder,
    }
  })

  return changed ? { ...snapshot, words } : snapshot
}

function moveThemeWordInSnapshot(snapshot: EditorSnapshot, wordId: string, direction: -1 | 1) {
  const target = snapshot.themeWords.find((word) => word.id === wordId)
  if (!target) {
    return snapshot
  }

  const siblingWords = snapshot.themeWords
    .filter((word) => word.setId === target.setId)
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
  const index = siblingWords.findIndex((word) => word.id === wordId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= siblingWords.length) {
    return snapshot
  }

  const nextOrders = new Map<string, number>()
  const orderedIds = siblingWords.map((word) => word.id)
  ;[orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]]
  orderedIds.forEach((id, orderIndex) => {
    nextOrders.set(id, orderIndex)
  })

  let changed = false
  const themeWords = snapshot.themeWords.map((word) => {
    const nextOrder = nextOrders.get(word.id)
    if (nextOrder === undefined || nextOrder === word.sourceOrder) {
      return word
    }

    changed = true
    return {
      ...word,
      sourceOrder: nextOrder,
    }
  })

  return changed ? { ...snapshot, themeWords } : snapshot
}

function updateThemeWordTopicInSnapshot(
  snapshot: EditorSnapshot,
  wordbookId: string,
  wordId: string,
  nextTopicId: string,
) {
  let changed = false
  const themeWordbooks = snapshot.themeWordbooks.map((wordbook) => {
    if (wordbook.id !== wordbookId) {
      return wordbook
    }

    const topics = wordbook.topics.map((topic) => {
      const hasWord = topic.wordIds.includes(wordId)
      const shouldHaveWord = topic.id === nextTopicId
      if (hasWord === shouldHaveWord) {
        return topic
      }

      changed = true
      return {
        ...topic,
        wordIds: shouldHaveWord
          ? [...topic.wordIds.filter((candidateId) => candidateId !== wordId), wordId]
          : topic.wordIds.filter((candidateId) => candidateId !== wordId),
      }
    })

    return changed ? { ...wordbook, topics } : wordbook
  })

  return changed ? { ...snapshot, themeWordbooks } : snapshot
}

function applyUpdatedAtToAllWordbooks(snapshot: EditorSnapshot, updatedAt: string) {
  return {
    ...snapshot,
    sets: snapshot.sets.map((set) => ({ ...set, updatedAt })),
    themeWordbooks: snapshot.themeWordbooks.map((wordbook) => ({ ...wordbook, updatedAt })),
    comparisonWordbooks: snapshot.comparisonWordbooks.map((wordbook) => ({ ...wordbook, updatedAt })),
  }
}

type BasicWordRowProps = {
  active: boolean
  changeTickRef: MutableRefObject<number>
  setChangeTick: ChangeTickSetter
  setSaveState: SaveStateSetter
  setSelectedWordId: Dispatch<SetStateAction<string | null>>
  setSnapshot: SnapshotSetter
  word: EditorWord
}

const BasicWordRow = memo(function BasicWordRow({
  active,
  changeTickRef,
  setChangeTick,
  setSaveState,
  setSelectedWordId,
  setSnapshot,
  word,
}: BasicWordRowProps) {
  return (
    <tr data-active={active} onClick={() => setSelectedWordId(word.id)}>
      <td>
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.rowAction}
            aria-label="위로"
            onClick={(event) => {
              event.stopPropagation()
              setSnapshot((current) => moveBasicWordInSnapshot(current, word.id, -1))
              markEditorDirty(setSaveState, setChangeTick, changeTickRef)
            }}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className={styles.rowAction}
            aria-label="아래로"
            onClick={(event) => {
              event.stopPropagation()
              setSnapshot((current) => moveBasicWordInSnapshot(current, word.id, 1))
              markEditorDirty(setSaveState, setChangeTick, changeTickRef)
            }}
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </td>
      <td>
        <input
          className={`${styles.cellInput} ${styles.cellInputJapanese}`}
          value={word.japanese}
          lang="ja-JP"
          onChange={(event) => {
            setSnapshot((current) => updateWordFieldInSnapshot(current, word.id, 'japanese', event.target.value))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        />
      </td>
      <td>
        <input
          className={`${styles.cellInput} ${styles.cellInputJapanese}`}
          value={word.reading}
          lang="ja-JP"
          onChange={(event) => {
            setSnapshot((current) => updateWordFieldInSnapshot(current, word.id, 'reading', event.target.value))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        />
      </td>
      <td>
        <input
          className={styles.cellInput}
          value={word.meaning}
          onChange={(event) => {
            setSnapshot((current) => updateWordFieldInSnapshot(current, word.id, 'meaning', event.target.value))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        />
      </td>
      <td>
        <select
          className={styles.cellSelect}
          value={word.type}
          onChange={(event) => {
            setSnapshot((current) => updateWordFieldInSnapshot(current, word.id, 'type', event.target.value as EditorWord['type']))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        >
          {wordTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          className={styles.cellInput}
          value={difficultyInputValue(word.difficulty)}
          inputMode="numeric"
          onChange={(event) => {
            const raw = event.target.value.trim()
            setSnapshot((current) => updateWordFieldInSnapshot(current, word.id, 'difficulty', raw ? Number(raw) : null))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        />
      </td>
      <td>
        <input
          className={styles.cellInput}
          value={textInputValue(word.verbInfo)}
          onChange={(event) => {
            setSnapshot((current) => updateWordFieldInSnapshot(current, word.id, 'verbInfo', event.target.value || null))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        />
      </td>
    </tr>
  )
})

type ThemeWordRowProps = {
  active: boolean
  changeTickRef: MutableRefObject<number>
  setChangeTick: ChangeTickSetter
  setSaveState: SaveStateSetter
  setSelectedThemeWordId: Dispatch<SetStateAction<string | null>>
  setSnapshot: SnapshotSetter
  topicId: string
  topics: Array<{ id: string; name: string }>
  word: ThemeWord
  wordbookId: string
}

const ThemeWordRow = memo(function ThemeWordRow({
  active,
  changeTickRef,
  setChangeTick,
  setSaveState,
  setSelectedThemeWordId,
  setSnapshot,
  topicId,
  topics,
  word,
  wordbookId,
}: ThemeWordRowProps) {
  return (
    <tr data-active={active} onClick={() => setSelectedThemeWordId(word.id)}>
      <td>
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.rowAction}
            aria-label="위로"
            onClick={(event) => {
              event.stopPropagation()
              setSnapshot((current) => moveThemeWordInSnapshot(current, word.id, -1))
              markEditorDirty(setSaveState, setChangeTick, changeTickRef)
            }}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className={styles.rowAction}
            aria-label="아래로"
            onClick={(event) => {
              event.stopPropagation()
              setSnapshot((current) => moveThemeWordInSnapshot(current, word.id, 1))
              markEditorDirty(setSaveState, setChangeTick, changeTickRef)
            }}
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </td>
      <td>
        <input
          className={`${styles.cellInput} ${styles.cellInputJapanese}`}
          value={word.japanese}
          lang="ja-JP"
          onChange={(event) => {
            setSnapshot((current) => updateThemeWordFieldInSnapshot(current, word.id, 'japanese', event.target.value))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        />
      </td>
      <td>
        <input
          className={`${styles.cellInput} ${styles.cellInputJapanese}`}
          value={word.reading}
          lang="ja-JP"
          onChange={(event) => {
            setSnapshot((current) => updateThemeWordFieldInSnapshot(current, word.id, 'reading', event.target.value))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        />
      </td>
      <td>
        <input
          className={styles.cellInput}
          value={word.meaning}
          onChange={(event) => {
            setSnapshot((current) => updateThemeWordFieldInSnapshot(current, word.id, 'meaning', event.target.value))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        />
      </td>
      <td>
        <select
          className={styles.cellSelect}
          value={word.type}
          onChange={(event) => {
            setSnapshot((current) => updateThemeWordFieldInSnapshot(current, word.id, 'type', event.target.value as ThemeWord['type']))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        >
          {wordTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </td>
      <td>
        <select
          className={styles.cellSelect}
          value={topicId}
          onChange={(event) => {
            setSnapshot((current) => updateThemeWordTopicInSnapshot(current, wordbookId, word.id, event.target.value.trim()))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        >
          <option value="" />
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>{topic.name}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          className={styles.cellInput}
          value={difficultyInputValue(word.difficulty)}
          inputMode="numeric"
          onChange={(event) => {
            const raw = event.target.value.trim()
            setSnapshot((current) => updateThemeWordFieldInSnapshot(current, word.id, 'difficulty', raw ? Number(raw) : null))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        />
      </td>
      <td>
        <input
          className={styles.cellInput}
          value={textInputValue(word.verbInfo)}
          onChange={(event) => {
            setSnapshot((current) => updateThemeWordFieldInSnapshot(current, word.id, 'verbInfo', event.target.value || null))
            markEditorDirty(setSaveState, setChangeTick, changeTickRef)
          }}
        />
      </td>
    </tr>
  )
})

type SmartReviewPromptRowProps = {
  active: boolean
  changeTickRef: MutableRefObject<number>
  mode: 'basic' | 'theme'
  rowIndex: number
  setChangeTick: ChangeTickSetter
  setSaveState: SaveStateSetter
  setSelectedThemeWordId: Dispatch<SetStateAction<string | null>>
  setSelectedWordId: Dispatch<SetStateAction<string | null>>
  setSnapshot: SnapshotSetter
  word: EditorWord | ThemeWord
}

const SmartReviewPromptRow = memo(function SmartReviewPromptRow({
  active,
  changeTickRef,
  mode,
  rowIndex,
  setChangeTick,
  setSaveState,
  setSelectedThemeWordId,
  setSelectedWordId,
  setSnapshot,
  word,
}: SmartReviewPromptRowProps) {
  function updatePrompt(field: SmartReviewPromptField, value: string) {
    setSnapshot((current) => (
      mode === 'basic'
        ? updateWordSmartReviewPromptInSnapshot(current, word.id, field, value)
        : updateThemeWordSmartReviewPromptInSnapshot(current, word.id, field, value)
    ))
    markEditorDirty(setSaveState, setChangeTick, changeTickRef)
  }

  return (
    <tr
      data-active={active}
      onClick={() => {
        if (mode === 'basic') {
          setSelectedWordId(word.id)
          return
        }

        setSelectedThemeWordId(word.id)
      }}
    >
      <td>
        <span className="miniChip">{rowIndex + 1}</span>
      </td>
      <td>
        <span className={`${styles.readOnlyCell} ${styles.cellInputJapanese}`} lang="ja-JP">{word.japanese}</span>
      </td>
      <td>
        <span className={`${styles.readOnlyCell} ${styles.cellInputJapanese}`} lang="ja-JP">{word.reading}</span>
      </td>
      <td>
        <span className={styles.readOnlyCell}>{word.meaning}</span>
      </td>
      <td>
        <textarea
          className={`${styles.tableTextarea} ${styles.cellInputJapanese}`}
          value={word.smartReviewPrompt?.japaneseSentence ?? ''}
          lang="ja-JP"
          onChange={(event) => updatePrompt('japaneseSentence', event.target.value)}
        />
      </td>
      <td>
        <textarea
          className={styles.tableTextarea}
          value={word.smartReviewPrompt?.translationSentence ?? ''}
          onChange={(event) => updatePrompt('translationSentence', event.target.value)}
        />
      </td>
    </tr>
  )
})

export function WordbookEditorPage() {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [mode, setMode] = useState<EditorMode>('basic')
  const [tableMode, setTableMode] = useState<EditorTableMode>('word')
  const [selectedSetId, setSelectedSetId] = useState<string | null>(initialSnapshot.sets[0]?.id ?? null)
  const [selectedWordId, setSelectedWordId] = useState<string | null>(initialSnapshot.words[0]?.id ?? null)
  const [selectedThemeWordbookId, setSelectedThemeWordbookId] = useState<string | null>(initialSnapshot.themeWordbooks[0]?.id ?? null)
  const [selectedThemeTopicId, setSelectedThemeTopicId] = useState<string | null>(initialSnapshot.themeWordbooks[0]?.topics[0]?.id ?? null)
  const [selectedThemeWordId, setSelectedThemeWordId] = useState<string | null>(initialSnapshot.themeWords[0]?.id ?? null)
  const [selectedComparisonWordbookId, setSelectedComparisonWordbookId] = useState<string | null>(initialSnapshot.comparisonWordbooks[0]?.id ?? null)
  const [selectedComparisonPairId, setSelectedComparisonPairId] = useState<string | null>(initialSnapshot.comparisonPairs[0]?.id ?? null)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery)
  const [workspaceHandle, setWorkspaceHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [workspaceState, setWorkspaceState] = useState<'idle' | 'linked' | 'remembered' | 'invalid'>('idle')
  const [saveState, setSaveState] = useState<EditorSaveState>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [columnWidths, setColumnWidths] = useState<Record<string, number[]>>({})
  const [pendingThemeTopicDeleteId, setPendingThemeTopicDeleteId] = useState<string | null>(null)
  const [changeTick, setChangeTick] = useState(0)
  const [savedChangeTick, setSavedChangeTick] = useState(0)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const changeTickRef = useRef(0)
  const resizeStateRef = useRef<{
    tableKey: string
    columnIndex: number
    startX: number
    startWidth: number
  } | null>(null)
  const deferredSnapshot = useDeferredValue(snapshot)

  useEffect(() => {
    void (async () => {
      const savedHandle = await loadSavedWorkspaceHandle()
      if (!savedHandle) {
        return
      }

      setWorkspaceHandle(savedHandle)

      const permissionState = await getReadWritePermissionState(savedHandle)
      if (permissionState !== 'granted') {
        setWorkspaceState('remembered')
        return
      }

      const isWorkspace = await verifyWorkspaceDirectory(savedHandle)
      setWorkspaceState(isWorkspace ? 'linked' : 'invalid')
    })()
  }, [])

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const activeResize = resizeStateRef.current
      if (!activeResize) {
        return
      }

      const nextWidth = Math.max(72, activeResize.startWidth + event.clientX - activeResize.startX)
      setColumnWidths((current) => {
        const nextTableWidths = [...(current[activeResize.tableKey] ?? [])]
        nextTableWidths[activeResize.columnIndex] = nextWidth
        return {
          ...current,
          [activeResize.tableKey]: nextTableWidths,
        }
      })
    }

    function handleMouseUp() {
      if (!resizeStateRef.current) {
        return
      }

      resizeStateRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    if (selectedSetId === null || !snapshot.sets.some((set) => set.id === selectedSetId)) {
      setSelectedSetId(snapshot.sets[0]?.id ?? null)
    }
  }, [selectedSetId, snapshot.sets])

  useEffect(() => {
    if (selectedThemeWordbookId === null || !snapshot.themeWordbooks.some((wordbook) => wordbook.id === selectedThemeWordbookId)) {
      setSelectedThemeWordbookId(snapshot.themeWordbooks[0]?.id ?? null)
    }
  }, [selectedThemeWordbookId, snapshot.themeWordbooks])

  useEffect(() => {
    if (
      selectedComparisonWordbookId === null
      || !snapshot.comparisonWordbooks.some((wordbook) => wordbook.id === selectedComparisonWordbookId)
    ) {
      setSelectedComparisonWordbookId(snapshot.comparisonWordbooks[0]?.id ?? null)
    }
  }, [selectedComparisonWordbookId, snapshot.comparisonWordbooks])

  useEffect(() => {
    if (mode === 'compare' && tableMode !== 'word') {
      setTableMode('word')
    }
  }, [mode, tableMode])

  const selectedSetWords = useMemo(
    () =>
      snapshot.words.filter((word) => {
        if (selectedSetId === null) {
          return false
        }

        if (word.setId !== selectedSetId) {
          return false
        }

        return matchesWordSearch(word, deferredSearch)
      }),
    [deferredSearch, selectedSetId, snapshot.words],
  )

  const selectedThemeWordbook = useMemo(
    () => snapshot.themeWordbooks.find((wordbook) => wordbook.id === selectedThemeWordbookId) ?? null,
    [selectedThemeWordbookId, snapshot.themeWordbooks],
  )

  const selectedThemeTopics = useMemo(
    () => selectedThemeWordbook?.topics ?? [],
    [selectedThemeWordbook],
  )

  const selectedThemeWords = useMemo(
    () =>
      snapshot.themeWords.filter((word) => {
        if (selectedThemeWordbookId === null || word.setId !== selectedThemeWordbookId) {
          return false
        }

        return matchesWordSearch(word, deferredSearch)
      }),
    [deferredSearch, selectedThemeWordbookId, snapshot.themeWords],
  )

  const selectedComparisonWordbook = useMemo(
    () => snapshot.comparisonWordbooks.find((wordbook) => wordbook.id === selectedComparisonWordbookId) ?? null,
    [selectedComparisonWordbookId, snapshot.comparisonWordbooks],
  )

  const comparisonWordMap = useMemo(
    () => new Map(snapshot.comparisonWords.map((word) => [word.id, word])),
    [snapshot.comparisonWords],
  )

  const selectedComparisonPairs = useMemo(
    () =>
      snapshot.comparisonPairs.filter((pair) => {
        if (selectedComparisonWordbookId === null || pair.bookId !== selectedComparisonWordbookId) {
          return false
        }

        return [
          pair.id,
          comparisonWordMap.get(pair.leftWordId)?.japanese ?? '',
          comparisonWordMap.get(pair.leftWordId)?.reading ?? '',
          comparisonWordMap.get(pair.leftWordId)?.meaning ?? '',
          pair.leftDescription,
          comparisonWordMap.get(pair.rightWordId)?.japanese ?? '',
          comparisonWordMap.get(pair.rightWordId)?.reading ?? '',
          comparisonWordMap.get(pair.rightWordId)?.meaning ?? '',
          pair.rightDescription,
        ].join(' ').toLowerCase().includes(deferredSearch.trim().toLowerCase())
      }),
    [comparisonWordMap, deferredSearch, selectedComparisonWordbookId, snapshot.comparisonPairs],
  )

  const selectedComparisonRows = useMemo(
    () =>
      selectedComparisonPairs.map((pair) => ({
        pair,
        leftWord: comparisonWordMap.get(pair.leftWordId) ?? null,
        rightWord: comparisonWordMap.get(pair.rightWordId) ?? null,
      })),
    [comparisonWordMap, selectedComparisonPairs],
  )

  useEffect(() => {
    if (selectedSetId === null) {
      setSelectedWordId(null)
      return
    }

    const candidate = selectedSetWords[0]?.id ?? snapshot.words.find((word) => word.setId === selectedSetId)?.id ?? null
    if (selectedWordId === null || !selectedSetWords.some((word) => word.id === selectedWordId)) {
      setSelectedWordId(candidate)
    }
  }, [selectedSetId, selectedSetWords, selectedWordId, snapshot.words])

  useEffect(() => {
    const candidate = selectedThemeTopics[0]?.id ?? selectedThemeWordbook?.topics[0]?.id ?? null
    if (selectedThemeTopicId === null || !selectedThemeTopics.some((topic) => topic.id === selectedThemeTopicId)) {
      setSelectedThemeTopicId(candidate)
    }
  }, [selectedThemeTopicId, selectedThemeTopics, selectedThemeWordbook])

  useEffect(() => {
    const candidate = selectedThemeWords[0]?.id ?? snapshot.themeWords.find((word) => word.setId === selectedThemeWordbookId)?.id ?? null
    if (selectedThemeWordId === null || !selectedThemeWords.some((word) => word.id === selectedThemeWordId)) {
      setSelectedThemeWordId(candidate)
    }
  }, [selectedThemeWordId, selectedThemeWords, selectedThemeWordbookId, snapshot.themeWords])

  useEffect(() => {
    const candidate = selectedComparisonPairs[0]?.id ?? snapshot.comparisonPairs.find((pair) => pair.bookId === selectedComparisonWordbookId)?.id ?? null
    if (selectedComparisonPairId === null || !selectedComparisonPairs.some((pair) => pair.id === selectedComparisonPairId)) {
      setSelectedComparisonPairId(candidate)
    }
  }, [selectedComparisonPairId, selectedComparisonPairs, selectedComparisonWordbookId, snapshot.comparisonPairs])

  const selectedSet = useMemo(
    () => snapshot.sets.find((set) => set.id === selectedSetId) ?? null,
    [selectedSetId, snapshot.sets],
  )

  const selectedWord = useMemo(
    () => snapshot.words.find((word) => word.id === selectedWordId) ?? null,
    [selectedWordId, snapshot.words],
  )

  const selectedThemeTopic = useMemo(
    () => selectedThemeWordbook?.topics.find((topic) => topic.id === selectedThemeTopicId) ?? null,
    [selectedThemeTopicId, selectedThemeWordbook],
  )

  const pendingThemeTopicDelete = useMemo(
    () => selectedThemeWordbook?.topics.find((topic) => topic.id === pendingThemeTopicDeleteId) ?? null,
    [pendingThemeTopicDeleteId, selectedThemeWordbook],
  )

  const selectedThemeWord = useMemo(
    () => snapshot.themeWords.find((word) => word.id === selectedThemeWordId) ?? null,
    [selectedThemeWordId, snapshot.themeWords],
  )

  const selectedComparisonPair = useMemo(
    () => snapshot.comparisonPairs.find((pair) => pair.id === selectedComparisonPairId) ?? null,
    [selectedComparisonPairId, snapshot.comparisonPairs],
  )

  const validationIssues = useMemo(() => validateEditorSnapshot(deferredSnapshot), [deferredSnapshot])
  const dirty = changeTick !== savedChangeTick

  const stats = useMemo(() => ({
    setCount: snapshot.sets.length,
    wordCount: snapshot.words.length,
    issueCount: validationIssues.length,
  }), [snapshot.sets.length, snapshot.words.length, validationIssues.length])

  function toggleSidebarCollapsed(nextCollapsed: boolean) {
    const shell = shellRef.current
    if (!shell) {
      return
    }

    shell.dataset.sidebarCollapsed = nextCollapsed ? 'true' : 'false'
  }

  function commit(nextSnapshot: EditorSnapshot) {
    setSnapshot(normalizeEditorSnapshot(nextSnapshot))
    markEditorDirty(setSaveState, setChangeTick, changeTickRef)
  }

  function mutate(mutator: (draft: EditorSnapshot) => void) {
    setSnapshot((current) => {
      const draft = cloneSnapshot(current)
      mutator(draft)
      return normalizeEditorSnapshot(draft)
    })
    markEditorDirty(setSaveState, setChangeTick, changeTickRef)
  }

  function updateSetField(setId: string, field: 'id' | 'name' | 'wordIdPrefix', value: string) {
    mutate((draft) => {
      const target = draft.sets.find((set) => set.id === setId)
      if (!target) {
        return
      }

      if (field === 'id') {
        const nextId = value.trim()
        const previousId = target.id
        target.id = nextId
        draft.words.forEach((word) => {
          if (word.setId === previousId) {
            word.setId = nextId
          }
        })
        if (selectedSetId === previousId) {
          setSelectedSetId(nextId)
        }
        return
      }

      if (field === 'wordIdPrefix') {
        target.wordIdPrefix = value
        return
      }

      target.name = value
    })
  }

  function updateThemeWordbookField(wordbookId: string, field: 'id' | 'name' | 'wordIdPrefix', value: string) {
    mutate((draft) => {
      const target = draft.themeWordbooks.find((wordbook) => wordbook.id === wordbookId)
      if (!target) {
        return
      }

      if (field === 'id') {
        const nextId = value.trim()
        const previousId = target.id
        target.id = nextId
        draft.themeWords.forEach((word) => {
          if (word.setId === previousId) {
            word.setId = nextId
          }
        })
        if (selectedThemeWordbookId === previousId) {
          setSelectedThemeWordbookId(nextId)
        }
        return
      }

      if (field === 'wordIdPrefix') {
        target.wordIdPrefix = value
        return
      }

      target.name = value
    })
  }

  function updateThemeTopicField(topicId: string, value: string) {
    mutate((draft) => {
      for (const wordbook of draft.themeWordbooks) {
        const target = wordbook.topics.find((topic) => topic.id === topicId)
        if (!target) {
          continue
        }

        target.name = value
        return
      }
    })
  }

  function updateComparisonWordbookField(wordbookId: string, field: 'id' | 'name' | 'wordIdPrefix', value: string) {
    mutate((draft) => {
      const target = draft.comparisonWordbooks.find((wordbook) => wordbook.id === wordbookId)
      if (!target) {
        return
      }

      if (field === 'id') {
        const nextId = value.trim()
        const previousId = target.id
        target.id = nextId
        draft.comparisonWords.forEach((word) => {
          if (word.setId === previousId) {
            word.setId = nextId
          }
        })
        draft.comparisonPairs.forEach((pair) => {
          if (pair.bookId === previousId) {
            pair.bookId = nextId
          }
        })
        if (selectedComparisonWordbookId === previousId) {
          setSelectedComparisonWordbookId(nextId)
        }
        return
      }

      if (field === 'wordIdPrefix') {
        target.wordIdPrefix = value
        return
      }

      target.name = value
    })
  }

  function updateComparisonPairWordField<K extends keyof EditorSnapshot['comparisonWords'][number]>(
    pairId: string,
    side: 'left' | 'right',
    field: K,
    value: EditorSnapshot['comparisonWords'][number][K],
  ) {
    mutate((draft) => {
      const pair = draft.comparisonPairs.find((candidate) => candidate.id === pairId)
      if (!pair) {
        return
      }

      const wordIdField = side === 'left' ? 'leftWordId' : 'rightWordId'
      let target = draft.comparisonWords.find((word) => word.id === pair[wordIdField])

      if (!target) {
        const nextWord = createEmptyComparisonWord(draft, pair.bookId)
        draft.comparisonWords = insertWordAfterAnchor(draft.comparisonWords, null, nextWord)
        pair[wordIdField] = nextWord.id
        target = draft.comparisonWords.find((word) => word.id === nextWord.id) ?? nextWord
      }

      target[field] = value
    })
  }

  function moveSet(setId: string, direction: -1 | 1) {
    mutate((draft) => {
      const index = draft.sets.findIndex((set) => set.id === setId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= draft.sets.length) {
        return
      }

      const [item] = draft.sets.splice(index, 1)
      draft.sets.splice(nextIndex, 0, item)
    })
  }

  function moveThemeWordbook(wordbookId: string, direction: -1 | 1) {
    mutate((draft) => {
      const index = draft.themeWordbooks.findIndex((wordbook) => wordbook.id === wordbookId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= draft.themeWordbooks.length) {
        return
      }

      const [item] = draft.themeWordbooks.splice(index, 1)
      draft.themeWordbooks.splice(nextIndex, 0, item)
    })
  }

  function moveComparisonWordbook(wordbookId: string, direction: -1 | 1) {
    mutate((draft) => {
      const index = draft.comparisonWordbooks.findIndex((wordbook) => wordbook.id === wordbookId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= draft.comparisonWordbooks.length) {
        return
      }

      const [item] = draft.comparisonWordbooks.splice(index, 1)
      draft.comparisonWordbooks.splice(nextIndex, 0, item)
    })
  }

  function moveComparisonPair(pairId: string, direction: -1 | 1) {
    mutate((draft) => {
      const target = draft.comparisonPairs.find((pair) => pair.id === pairId)
      if (!target) {
        return
      }

      const bookPairs = draft.comparisonPairs.filter((pair) => pair.bookId === target.bookId)
      const index = bookPairs.findIndex((pair) => pair.id === pairId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= bookPairs.length) {
        return
      }

      const orderedIds = bookPairs.map((pair) => pair.id)
      ;[orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]]
      orderedIds.forEach((id, orderIndex) => {
        const pair = draft.comparisonPairs.find((candidate) => candidate.id === id)
        if (pair) {
          pair.sourceOrder = orderIndex
        }
      })
    })
  }

  function handleAddSet() {
    const newSet = createEmptySet(snapshot)
    commit({
      ...snapshot,
      sets: [...snapshot.sets, newSet],
    })
    setSelectedSetId(newSet.id)
    setSelectedWordId(null)
  }

  function handleDeleteSet() {
    if (!selectedSet) {
      return
    }

    if (!window.confirm('세트를 지울까요? 포함된 단어도 함께 삭제됩니다.')) {
      return
    }

    const nextSnapshot = normalizeEditorSnapshot({
      ...snapshot,
      sets: snapshot.sets.filter((set) => set.id !== selectedSet.id),
      words: snapshot.words.filter((word) => word.setId !== selectedSet.id),
    })
    commit(nextSnapshot)
    setSelectedSetId(nextSnapshot.sets[0]?.id ?? null)
    setSelectedWordId(nextSnapshot.words[0]?.id ?? null)
  }

  function handleAddWord() {
    if (!selectedSetId) {
      return
    }

    const newWord = createEmptyWord(snapshot, selectedSetId)
    commit({
      ...snapshot,
      words: insertWordAfterAnchor(snapshot.words, selectedWordId, newWord),
    })
    setSelectedWordId(newWord.id)
  }

  function handleDuplicateWord() {
    if (!selectedWord) {
      return
    }

    const nextWord = duplicateWord(snapshot.words, selectedWord)
    commit({
      ...snapshot,
      words: [...snapshot.words, nextWord],
    })
    setSelectedWordId(nextWord.id)
  }

  function handleDeleteWord() {
    if (!selectedWord) {
      return
    }

    const nextSnapshot = normalizeEditorSnapshot({
      ...snapshot,
      words: snapshot.words.filter((word) => word.id !== selectedWord.id),
    })
    commit(nextSnapshot)
    setSelectedWordId(nextSnapshot.words.find((word) => word.setId === selectedSetId)?.id ?? null)
  }

  function handleAddThemeWordbook() {
    const next = createEmptyThemeWordbook(snapshot)
    commit({
      ...snapshot,
      themeWordbooks: [...snapshot.themeWordbooks, next],
    })
    setSelectedThemeWordbookId(next.id)
    setSelectedThemeTopicId(null)
  }

  function handleDeleteThemeWordbook() {
    if (!selectedThemeWordbook) {
      return
    }

    if (!window.confirm('주제형 단어장을 지울까요? 포함된 주제도 함께 삭제됩니다.')) {
      return
    }

    const nextSnapshot = normalizeEditorSnapshot({
      ...snapshot,
      themeWordbooks: snapshot.themeWordbooks.filter((wordbook) => wordbook.id !== selectedThemeWordbook.id),
      themeWords: snapshot.themeWords.filter((word) => word.setId !== selectedThemeWordbook.id),
    })
    commit(nextSnapshot)
    setSelectedThemeWordbookId(nextSnapshot.themeWordbooks[0]?.id ?? null)
    setSelectedThemeTopicId(nextSnapshot.themeWordbooks[0]?.topics[0]?.id ?? null)
    setSelectedThemeWordId(nextSnapshot.themeWords.find((word) => word.setId === nextSnapshot.themeWordbooks[0]?.id)?.id ?? null)
  }

  function handleAddThemeTopic() {
    if (!selectedThemeWordbookId) {
      return
    }

    const nextTopic = createEmptyThemeTopic(snapshot, selectedThemeWordbookId)
    mutate((draft) => {
      const wordbook = draft.themeWordbooks.find((item) => item.id === selectedThemeWordbookId)
      if (!wordbook) {
        return
      }

      wordbook.topics.push(nextTopic)
    })
    setSelectedThemeTopicId(nextTopic.id)
  }

  function handleDeleteThemeTopic() {
    if (!selectedThemeWordbookId || !selectedThemeTopic) {
      return
    }

    setPendingThemeTopicDeleteId(selectedThemeTopic.id)
  }

  function closeThemeTopicDeleteDialog() {
    setPendingThemeTopicDeleteId(null)
  }

  function confirmDeleteThemeTopic(deleteWords: boolean) {
    if (!selectedThemeWordbookId || !pendingThemeTopicDelete) {
      return
    }

    const removedWordIds = new Set(pendingThemeTopicDelete.wordIds)
    const nextSnapshot = normalizeEditorSnapshot({
      ...snapshot,
      themeWordbooks: snapshot.themeWordbooks.map((wordbook) => {
        if (wordbook.id !== selectedThemeWordbookId) {
          return wordbook
        }

        return {
          ...wordbook,
          topics: wordbook.topics.filter((topic) => topic.id !== pendingThemeTopicDelete.id),
        }
      }),
      themeWords: deleteWords
        ? snapshot.themeWords.filter((word) => !removedWordIds.has(word.id))
        : snapshot.themeWords,
    })

    commit(nextSnapshot)
    closeThemeTopicDeleteDialog()
    setSelectedThemeTopicId(nextSnapshot.themeWordbooks.find((wordbook) => wordbook.id === selectedThemeWordbookId)?.topics[0]?.id ?? null)
    setSelectedThemeWordId(nextSnapshot.themeWords.find((word) => word.setId === selectedThemeWordbookId)?.id ?? null)
  }

  function handleAddThemeWord() {
    if (!selectedThemeWordbookId) {
      return
    }

    const nextWord = createEmptyThemeWord(snapshot, selectedThemeWordbookId)
    mutate((draft) => {
      draft.themeWords = insertWordAfterAnchor(draft.themeWords, selectedThemeWordId, nextWord)

      const sourceTopicId = selectedThemeWordId
        ? draft.themeWordbooks
          .find((wordbook) => wordbook.id === selectedThemeWordbookId)
          ?.topics.find((topic) => topic.wordIds.includes(selectedThemeWordId))
          ?.id ?? null
        : selectedThemeTopicId

      if (!sourceTopicId) {
        return
      }

      const wordbook = draft.themeWordbooks.find((item) => item.id === selectedThemeWordbookId)
      const topic = wordbook?.topics.find((item) => item.id === sourceTopicId)
      if (topic) {
        topic.wordIds = [...topic.wordIds, nextWord.id]
      }
    })
    setSelectedThemeWordId(nextWord.id)
  }

  function handleDeleteThemeWord() {
    if (!selectedThemeWord) {
      return
    }

    mutate((draft) => {
      draft.themeWords = draft.themeWords.filter((word) => word.id !== selectedThemeWord.id)
      draft.themeWordbooks.forEach((wordbook) => {
        wordbook.topics.forEach((topic) => {
          topic.wordIds = topic.wordIds.filter((wordId) => wordId !== selectedThemeWord.id)
        })
      })
    })
    setSelectedThemeWordId(null)
  }

  function handleAddComparisonWordbook() {
    const next = createEmptyComparisonWordbook(snapshot)
    commit({
      ...snapshot,
      comparisonWordbooks: [...snapshot.comparisonWordbooks, next],
    })
    setSelectedComparisonWordbookId(next.id)
    setSelectedComparisonPairId(null)
  }

  function handleDeleteComparisonWordbook() {
    if (!selectedComparisonWordbook) {
      return
    }

    if (!window.confirm('비교형 단어장을 지울까요? 포함된 비교 카드도 함께 삭제됩니다.')) {
      return
    }

    const nextSnapshot = normalizeEditorSnapshot({
      ...snapshot,
      comparisonWordbooks: snapshot.comparisonWordbooks.filter((wordbook) => wordbook.id !== selectedComparisonWordbook.id),
      comparisonWords: snapshot.comparisonWords.filter((word) => word.setId !== selectedComparisonWordbook.id),
      comparisonPairs: snapshot.comparisonPairs.filter((pair) => pair.bookId !== selectedComparisonWordbook.id),
    })
    commit(nextSnapshot)
    setSelectedComparisonWordbookId(nextSnapshot.comparisonWordbooks[0]?.id ?? null)
    setSelectedComparisonPairId(nextSnapshot.comparisonPairs[0]?.id ?? null)
  }

  function handleAddComparisonPair() {
    if (!selectedComparisonWordbookId) {
      return
    }

    const leftWord = createEmptyComparisonWord(snapshot, selectedComparisonWordbookId)
    const snapshotWithLeftWord = {
      ...snapshot,
      comparisonWords: [...snapshot.comparisonWords, leftWord],
    }
    const rightWord = createEmptyComparisonWord(snapshotWithLeftWord, selectedComparisonWordbookId)
    const nextSnapshot = {
      ...snapshot,
      comparisonWords: [...snapshot.comparisonWords, leftWord, rightWord],
    }
    const next = createEmptyComparisonPair(nextSnapshot, selectedComparisonWordbookId)
    next.leftWordId = leftWord.id
    next.rightWordId = rightWord.id

    commit({
      ...nextSnapshot,
      comparisonPairs: [...snapshot.comparisonPairs, next],
    })
    setSelectedComparisonPairId(next.id)
  }

  function handleDeleteComparisonPair() {
    if (!selectedComparisonPair) {
      return
    }

    const remainingPairs = snapshot.comparisonPairs.filter((pair) => pair.id !== selectedComparisonPair.id)
    const referencedWordIds = new Set(
      remainingPairs.flatMap((pair) => [pair.leftWordId, pair.rightWordId]).filter((wordId) => wordId.trim().length > 0),
    )
    const removableWordIds = [selectedComparisonPair.leftWordId, selectedComparisonPair.rightWordId]
      .filter((wordId, index, ids) => wordId.trim().length > 0 && ids.indexOf(wordId) === index && !referencedWordIds.has(wordId))

    const nextSnapshot = normalizeEditorSnapshot({
      ...snapshot,
      comparisonPairs: remainingPairs,
      comparisonWords: snapshot.comparisonWords.filter((word) => !removableWordIds.includes(word.id)),
    })
    commit(nextSnapshot)
    setSelectedComparisonPairId(nextSnapshot.comparisonPairs.find((pair) => pair.bookId === selectedComparisonWordbookId)?.id ?? null)
  }

  function handleReset() {
    if (!window.confirm('편집 중인 변경을 모두 버릴까요?')) {
      return
    }

    setSnapshot(initialSnapshot)
    setSelectedSetId(initialSnapshot.sets[0]?.id ?? null)
    setSelectedWordId(initialSnapshot.words[0]?.id ?? null)
    setSelectedThemeWordbookId(initialSnapshot.themeWordbooks[0]?.id ?? null)
    setSelectedThemeTopicId(initialSnapshot.themeWordbooks[0]?.topics[0]?.id ?? null)
    setSelectedThemeWordId(initialSnapshot.themeWords[0]?.id ?? null)
    setSelectedComparisonWordbookId(initialSnapshot.comparisonWordbooks[0]?.id ?? null)
    setSelectedComparisonPairId(initialSnapshot.comparisonPairs[0]?.id ?? null)
    changeTickRef.current = 0
    setChangeTick(0)
    setSavedChangeTick(0)
    setSaveState('idle')
    setStatusMessage('')
  }

  async function handleDownloadTemplate() {
    const scope = getActiveWorkbookScope()
    if (!scope) {
      setSaveState('error')
      setStatusMessage('단어장 선택 필요')
      return
    }

    const workbook = await buildEditorWorkbook(snapshot, scope)
    downloadBlobFile(
      editorWorkbookFileName(scope.mode, getActiveWorkbookName()),
      new Blob([workbook], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    )
    setStatusMessage('xlsx 다운로드')
  }

  async function handleImportWorkbook(file: File) {
    try {
      const scope = getActiveWorkbookScope()
      if (!scope) {
        throw new Error('단어장 선택 필요')
      }

      const importedSnapshot = await parseEditorWorkbook(await file.arrayBuffer(), scope.mode)
      applyImportedWorkbook(importedSnapshot)
      setStatusMessage('xlsx 반영')
    } catch (error) {
      setSaveState('error')
      setStatusMessage(error instanceof Error ? error.message : 'xlsx 오류')
    }
  }

  async function resolveWorkspaceHandle(forcePick: boolean) {
    if (!supportsDirectoryPicker()) {
      return null
    }

    if (!forcePick && workspaceHandle) {
      const permitted = await ensureReadWritePermission(workspaceHandle)
      if (permitted) {
        return workspaceHandle
      }

      setWorkspaceState('remembered')
      throw new Error('저장 경로 권한 필요')
    }

    const pickedHandle = await pickWorkspaceDirectory()
    if (!pickedHandle) {
      return null
    }

    const permitted = await ensureReadWritePermission(pickedHandle)
    if (!permitted) {
      return null
    }

    const isWorkspace = await verifyWorkspaceDirectory(pickedHandle)
    setWorkspaceHandle(pickedHandle)
    setWorkspaceState(isWorkspace ? 'linked' : 'invalid')
    await saveWorkspaceHandle(pickedHandle)
    return pickedHandle
  }

  async function saveToWorkspace(forcePick: boolean) {
    const normalized = normalizeEditorSnapshot(snapshot)
    const stampedSnapshot = applyUpdatedAtToAllWordbooks(normalized, new Date().toISOString())
    const issues = validateEditorSnapshot(stampedSnapshot)
    if (issues.length > 0) {
      setSaveState('error')
      setStatusMessage('검사 필요')
      return
    }

    setSaveState('saving')
    setStatusMessage('저장 중')

    try {
      const directoryHandle = await resolveWorkspaceHandle(forcePick)
      const files = buildEditorFileOutputs(stampedSnapshot)

      if (!directoryHandle) {
        files.forEach((file) => {
          downloadTextFile(file.path[file.path.length - 1] ?? 'export.txt', file.content)
        })
        setSnapshot(stampedSnapshot)
        setSavedChangeTick(changeTickRef.current)
        setSaveState('saved')
        setStatusMessage('다운로드 완료')
        return
      }

      const isWorkspace = await verifyWorkspaceDirectory(directoryHandle)
      if (!isWorkspace) {
        setWorkspaceState('invalid')
        throw new Error('프로젝트 루트가 아닙니다.')
      }

      for (const file of files) {
        await writeTextFile(directoryHandle, file.path, file.content)
      }

      setWorkspaceState('linked')
      setSnapshot(stampedSnapshot)
      setSavedChangeTick(changeTickRef.current)
      setSaveState('saved')
      setStatusMessage('프로젝트 반영 완료')
    } catch (error) {
      setSaveState('error')
      setStatusMessage(error instanceof Error ? error.message : '저장 실패')
    }
  }

  const sidebarItems = mode === 'basic'
    ? snapshot.sets.map((set) => ({ id: set.id, label: set.name, count: set.wordIds.length }))
    : mode === 'theme'
      ? snapshot.themeWordbooks.map((wordbook) => ({ id: wordbook.id, label: wordbook.name, count: wordbook.topics.length }))
      : snapshot.comparisonWordbooks.map((wordbook) => ({ id: wordbook.id, label: wordbook.name, count: wordbook.pairIds.length }))

  const activeSidebarId = mode === 'basic' ? selectedSetId : mode === 'theme' ? selectedThemeWordbookId : selectedComparisonWordbookId
  const getThemeWordTopicId = (wordId: string) =>
    selectedThemeWordbook?.topics.find((topic) => topic.wordIds.includes(wordId))?.id ?? ''

  function startColumnResize(tableKey: string, columnIndex: number, event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()

    const headerCell = event.currentTarget.parentElement
    if (!headerCell) {
      return
    }

    resizeStateRef.current = {
      tableKey,
      columnIndex,
      startX: event.clientX,
      startWidth: headerCell.getBoundingClientRect().width,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function renderColGroup(tableKey: string, columns: ResizableColumn[]) {
    const widths = columnWidths[tableKey] ?? []

    return (
      <colgroup>
        {columns.map((column, index) => {
          const width = widths[index] ?? column.width
          return (
            <col
              key={`${tableKey}-col-${column.ariaLabel ?? column.label}-${index}`}
              style={width
                ? column.fixed
                  ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }
                  : { width: `${width}px`, minWidth: `${width}px` }
                : undefined}
            />
          )
        })}
      </colgroup>
    )
  }

  function renderTableHeader(tableKey: string, columns: ResizableColumn[]) {
    const widths = columnWidths[tableKey] ?? []

    return (
      <tr>
        {columns.map((column, index) => {
          const width = widths[index] ?? column.width
          const label = column.ariaLabel ?? column.label
          return (
            <th
              key={`${tableKey}-header-${label}-${index}`}
              className={styles.headerCell}
              aria-label={column.ariaLabel}
              style={width
                ? column.fixed
                  ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }
                  : { width: `${width}px`, minWidth: `${width}px` }
                : undefined}
            >
              <span className={styles.headerLabel}>{column.label}</span>
              {column.resizable ? (
                <button
                  type="button"
                  className={styles.columnResizeHandle}
                  aria-label={`${label} 열 너비 조절`}
                  onMouseDown={(event) => startColumnResize(tableKey, index, event)}
                />
              ) : null}
            </th>
          )
        })}
      </tr>
    )
  }

  function renderComparisonWordCells(
    pairId: string,
    side: 'left' | 'right',
    word: EditorSnapshot['comparisonWords'][number] | null,
  ) {
    return (
      <>
        <td>
          <input
            className={`${styles.cellInput} ${styles.cellInputJapanese}`}
            value={word?.japanese ?? ''}
            lang="ja-JP"
            onChange={(event) => updateComparisonPairWordField(pairId, side, 'japanese', event.target.value)}
          />
        </td>
        <td>
          <input
            className={`${styles.cellInput} ${styles.cellInputJapanese}`}
            value={word?.reading ?? ''}
            lang="ja-JP"
            onChange={(event) => updateComparisonPairWordField(pairId, side, 'reading', event.target.value)}
          />
        </td>
        <td>
          <input
            className={styles.cellInput}
            value={word?.meaning ?? ''}
            onChange={(event) => updateComparisonPairWordField(pairId, side, 'meaning', event.target.value)}
          />
        </td>
        <td>
          <select
            className={styles.cellSelect}
            value={word?.type ?? 'noun'}
            onChange={(event) => updateComparisonPairWordField(pairId, side, 'type', event.target.value as EditorSnapshot['comparisonWords'][number]['type'])}
          >
            {wordTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </td>
        <td>
          <input
            className={styles.cellInput}
            value={difficultyInputValue(word?.difficulty ?? null)}
            inputMode="numeric"
            onChange={(event) => {
              const raw = event.target.value.trim()
              updateComparisonPairWordField(pairId, side, 'difficulty', raw ? Number(raw) : null)
            }}
          />
        </td>
        <td>
          <input
            className={styles.cellInput}
            value={textInputValue(word?.verbInfo ?? null)}
            onChange={(event) => updateComparisonPairWordField(pairId, side, 'verbInfo', event.target.value || null)}
          />
        </td>
      </>
    )
  }

  function getComparisonSharedDescription(pair: EditorSnapshot['comparisonPairs'][number]) {
    const left = pair.leftDescription
    const right = pair.rightDescription
    if (!left) return right
    if (!right) return left
    if (left === right) return left
    return `${left}\n\n${right}`
  }

  function updateComparisonSharedDescription(pairId: string, value: string) {
    mutate((draft) => {
      const target = draft.comparisonPairs.find((pair) => pair.id === pairId)
      if (!target) {
        return
      }

      target.leftDescription = value
      target.rightDescription = value
    })
  }

  function getActiveWorkbookScope(): EditorWorkbookScope | null {
    if (mode === 'basic') {
      return selectedSetId ? { mode: 'basic', setId: selectedSetId } : null
    }

    if (mode === 'theme') {
      return selectedThemeWordbookId ? { mode: 'theme', wordbookId: selectedThemeWordbookId } : null
    }

    return selectedComparisonWordbookId ? { mode: 'compare', wordbookId: selectedComparisonWordbookId } : null
  }

  function getActiveWorkbookName() {
    if (mode === 'basic') return selectedSet?.name ?? 'basic'
    if (mode === 'theme') return selectedThemeWordbook?.name ?? 'theme'
    return selectedComparisonWordbook?.name ?? 'compare'
  }

  function applyImportedWorkbook(imported: ParsedEditorWorkbook) {
    if (imported.mode === 'basic' && selectedSetId) {
      const targetIndex = snapshot.sets.findIndex((set) => set.id === selectedSetId)
      if (targetIndex < 0) {
        throw new Error('기본 단어장 없음')
      }

      const nextSet = {
        ...imported.set,
        order: snapshot.sets[targetIndex]?.order ?? imported.set.order,
      }
      const nextSnapshot = normalizeEditorSnapshot({
        ...snapshot,
        sets: snapshot.sets.map((set, index) => (index === targetIndex ? nextSet : set)),
        words: snapshot.words
          .filter((word) => word.setId !== selectedSetId)
          .concat(imported.words.map((word) => ({ ...word, setId: nextSet.id }))),
      })

      commit(nextSnapshot)
      setSelectedSetId(nextSet.id)
      setSelectedWordId(nextSnapshot.words.find((word) => word.setId === nextSet.id)?.id ?? null)
      return
    }

    if (imported.mode === 'theme' && selectedThemeWordbookId) {
      const targetIndex = snapshot.themeWordbooks.findIndex((wordbook) => wordbook.id === selectedThemeWordbookId)
      if (targetIndex < 0) {
        throw new Error('주제형 단어장 없음')
      }

      const nextWordbook = {
        ...imported.wordbook,
        order: snapshot.themeWordbooks[targetIndex]?.order ?? imported.wordbook.order,
      }
      const nextSnapshot = normalizeEditorSnapshot({
        ...snapshot,
        themeWordbooks: snapshot.themeWordbooks.map((wordbook, index) => (index === targetIndex ? nextWordbook : wordbook)),
        themeWords: snapshot.themeWords
          .filter((word) => word.setId !== selectedThemeWordbookId)
          .concat(imported.words.map((word) => ({ ...word, setId: nextWordbook.id }))),
      })

      commit(nextSnapshot)
      setSelectedThemeWordbookId(nextWordbook.id)
      setSelectedThemeTopicId(nextSnapshot.themeWordbooks.find((wordbook) => wordbook.id === nextWordbook.id)?.topics[0]?.id ?? null)
      setSelectedThemeWordId(nextSnapshot.themeWords.find((word) => word.setId === nextWordbook.id)?.id ?? null)
      return
    }

    if (imported.mode === 'compare' && selectedComparisonWordbookId) {
      const targetIndex = snapshot.comparisonWordbooks.findIndex((wordbook) => wordbook.id === selectedComparisonWordbookId)
      if (targetIndex < 0) {
        throw new Error('비교형 단어장 없음')
      }

      const nextWordbook = {
        ...imported.wordbook,
        order: snapshot.comparisonWordbooks[targetIndex]?.order ?? imported.wordbook.order,
      }
      const nextSnapshot = normalizeEditorSnapshot({
        ...snapshot,
        comparisonWordbooks: snapshot.comparisonWordbooks.map((wordbook, index) => (index === targetIndex ? nextWordbook : wordbook)),
        comparisonWords: snapshot.comparisonWords
          .filter((word) => word.setId !== selectedComparisonWordbookId)
          .concat(imported.words.map((word) => ({ ...word, setId: nextWordbook.id }))),
        comparisonPairs: snapshot.comparisonPairs
          .filter((pair) => pair.bookId !== selectedComparisonWordbookId)
          .concat(imported.pairs.map((pair) => ({ ...pair, bookId: nextWordbook.id }))),
      })

      commit(nextSnapshot)
      setSelectedComparisonWordbookId(nextWordbook.id)
      setSelectedComparisonPairId(nextSnapshot.comparisonPairs.find((pair) => pair.bookId === nextWordbook.id)?.id ?? null)
      return
    }

    throw new Error('현재 단어장 없음')
  }

  return (
    <div className={styles.root} lang="ko-KR">
      <GlassPanel className={styles.hero} padding="lg" variant="strong">
        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <p className="section-kicker">Editor</p>
            <h1 className="section-title">단어장 DB</h1>
          </div>

          <div className={styles.heroActions}>
            <Tooltip label="저장">
              <span>
                <IconButton
                  icon={Save}
                  label="현재 프로젝트에 저장"
                  active={saveState === 'saved'}
                  onClick={() => void saveToWorkspace(false)}
                />
              </span>
            </Tooltip>
            <Tooltip label="동기화된 위치와 다른 위치에 저장">
              <span>
                <IconButton icon={FolderOpen} label="다른 위치 선택" onClick={() => void saveToWorkspace(true)} />
              </span>
            </Tooltip>
            <Tooltip label="편집 중인 에디터 내용 초기화">
              <span>
                <IconButton icon={Database} label="편집 초기화" tone="danger" onClick={handleReset} />
              </span>
            </Tooltip>
          </div>
        </div>

        <div className={styles.modeSwitch} role="tablist" aria-label="편집 모드">
          <button type="button" className="pill" data-active={mode === 'basic'} onClick={() => setMode('basic')}>기본</button>
          <button type="button" className="pill" data-active={mode === 'theme'} onClick={() => setMode('theme')}>주제형</button>
          <button type="button" className="pill" data-active={mode === 'compare'} onClick={() => setMode('compare')}>비교형</button>
        </div>

        <div className={styles.metaRow}>
          <span className="miniChip">{stats.setCount}세트</span>
          <span className="miniChip">{stats.wordCount}단어</span>
          <span className="miniChip" data-tone={validationIssues.length > 0 ? 'danger' : 'ok'}>
            {validationIssues.length > 0 ? `${stats.issueCount}오류` : '정상'}
          </span>
          <span className="miniChip" data-tone={dirty ? 'dirty' : 'ok'}>
            {dirty ? '수정됨' : '동기화'}
          </span>
          <span className="miniChip" data-tone={workspaceState === 'invalid' ? 'danger' : 'neutral'}>
            {workspaceState === 'linked' || workspaceState === 'remembered' ? '경로 기억됨' : workspaceState === 'invalid' ? '경로 확인' : '경로 미연결'}
          </span>
          {statusMessage ? <span className="miniChip">{statusMessage}</span> : null}
        </div>
      </GlassPanel>

      <div ref={shellRef} className={styles.shell} data-sidebar-collapsed="false">
        <GlassPanel className={styles.sidebar} padding="md">
          <div className={styles.collapsedSidebar}>
            <Tooltip label="사이드바 펼치기">
              <span>
                <IconButton icon={PanelLeftOpen} label="사이드바 펼치기" size="sm" onClick={() => toggleSidebarCollapsed(false)} />
              </span>
            </Tooltip>
          </div>

          <div className={styles.sidebarContent}>
            <div className={styles.panelTop}>
              <h2 className="page-header__title">{mode === 'basic' ? '세트' : mode === 'theme' ? '주제형' : '비교형'}</h2>
              <div className={styles.inlineActions}>
                <Tooltip label="사이드바 접기">
                  <span>
                    <IconButton icon={PanelLeftClose} label="사이드바 접기" size="sm" onClick={() => toggleSidebarCollapsed(true)} />
                  </span>
                </Tooltip>
                <Tooltip label={mode === 'basic' ? '세트 추가' : mode === 'theme' ? '주제형 추가' : '비교형 추가'}>
                  <span>
                    <IconButton
                      icon={Plus}
                      label={mode === 'basic' ? '세트 추가' : mode === 'theme' ? '주제형 추가' : '비교형 추가'}
                      size="sm"
                      onClick={() => {
                        if (mode === 'basic') handleAddSet()
                        if (mode === 'theme') handleAddThemeWordbook()
                        if (mode === 'compare') handleAddComparisonWordbook()
                      }}
                    />
                  </span>
                </Tooltip>
              </div>
            </div>

            <div className={styles.setList}>
              {sidebarItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.setButton}
                  data-active={item.id === activeSidebarId}
                  onClick={() => {
                    if (mode === 'basic') setSelectedSetId(item.id)
                    if (mode === 'theme') setSelectedThemeWordbookId(item.id)
                    if (mode === 'compare') setSelectedComparisonWordbookId(item.id)
                    startTransition(() => setSearchQuery(''))
                  }}
                >
                  <span className={styles.setButtonName}>{item.label}</span>
                  <span className="miniChip">{item.count}</span>
                </button>
              ))}
            </div>

            {mode === 'basic' && selectedSet ? (
              <div className={styles.detailBlock}>
                <div className={styles.panelTop}>
                  <h3 className={styles.detailTitle}>세트 정보</h3>
                  <div className={styles.inlineActions}>
                    <IconButton icon={ArrowUp} label="세트 위로" size="sm" onClick={() => moveSet(selectedSet.id, -1)} />
                    <IconButton icon={ArrowDown} label="세트 아래로" size="sm" onClick={() => moveSet(selectedSet.id, 1)} />
                    <IconButton icon={Trash2} label="세트 삭제" size="sm" tone="danger" onClick={handleDeleteSet} />
                  </div>
                </div>

                <label className="form-field">
                  <span className={styles.fieldLabel}>세트 이름</span>
                  <input className="glass-input" value={selectedSet.name} onChange={(event) => updateSetField(selectedSet.id, 'name', event.target.value)} />
                </label>

                <label className="form-field">
                  <span className={styles.fieldLabel}>세트 ID</span>
                  <input className="glass-input" value={selectedSet.id} onChange={(event) => updateSetField(selectedSet.id, 'id', event.target.value)} />
                </label>

                <label className="form-field">
                  <span className={styles.fieldLabel}>단어 ID 접두사</span>
                  <input
                    className="glass-input"
                    value={selectedSet.wordIdPrefix ?? ''}
                    onChange={(event) => updateSetField(selectedSet.id, 'wordIdPrefix', event.target.value)}
                  />
                </label>
              </div>
            ) : null}

            {mode === 'theme' && selectedThemeWordbook ? (
              <>
                <div className={styles.detailBlock}>
                  <div className={styles.panelTop}>
                    <h3 className={styles.detailTitle}>세트 정보</h3>
                    <div className={styles.inlineActions}>
                      <IconButton icon={ArrowUp} label="주제형 위로" size="sm" onClick={() => moveThemeWordbook(selectedThemeWordbook.id, -1)} />
                      <IconButton icon={ArrowDown} label="주제형 아래로" size="sm" onClick={() => moveThemeWordbook(selectedThemeWordbook.id, 1)} />
                      <IconButton icon={Trash2} label="주제형 삭제" size="sm" tone="danger" onClick={handleDeleteThemeWordbook} />
                    </div>
                  </div>

                  <label className="form-field">
                    <span className={styles.fieldLabel}>세트 이름</span>
                    <input className="glass-input" value={selectedThemeWordbook.name} onChange={(event) => updateThemeWordbookField(selectedThemeWordbook.id, 'name', event.target.value)} />
                  </label>

                  <label className="form-field">
                    <span className={styles.fieldLabel}>세트 ID</span>
                    <input className="glass-input" value={selectedThemeWordbook.id} onChange={(event) => updateThemeWordbookField(selectedThemeWordbook.id, 'id', event.target.value)} />
                  </label>

                  <label className="form-field">
                    <span className={styles.fieldLabel}>단어 ID 접두사</span>
                    <input
                      className="glass-input"
                      value={selectedThemeWordbook.wordIdPrefix ?? ''}
                      onChange={(event) => updateThemeWordbookField(selectedThemeWordbook.id, 'wordIdPrefix', event.target.value)}
                    />
                  </label>
                </div>

                <div className={styles.detailBlock}>
                  <div className={styles.panelTop}>
                    <h3 className={styles.detailTitle}>주제</h3>
                    <div className={styles.inlineActions}>
                      <IconButton icon={Plus} label="주제 추가" size="sm" onClick={handleAddThemeTopic} disabled={!selectedThemeWordbookId} />
                      <IconButton icon={Trash2} label="선택 주제 삭제" size="sm" tone="danger" onClick={handleDeleteThemeTopic} disabled={!selectedThemeTopic} />
                    </div>
                  </div>
                  <div className={styles.topicList}>
                    {selectedThemeTopics.map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        className={styles.topicItem}
                        data-active={topic.id === selectedThemeTopicId}
                        onClick={() => setSelectedThemeTopicId(topic.id)}
                      >
                        <input
                          className={styles.topicInput}
                          value={topic.name}
                          onClick={(event) => event.stopPropagation()}
                          onFocus={() => setSelectedThemeTopicId(topic.id)}
                          onChange={(event) => updateThemeTopicField(topic.id, event.target.value)}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {mode === 'compare' && selectedComparisonWordbook ? (
              <div className={styles.detailBlock}>
                <div className={styles.panelTop}>
                  <h3 className={styles.detailTitle}>세트 정보</h3>
                  <div className={styles.inlineActions}>
                    <IconButton icon={ArrowUp} label="비교형 위로" size="sm" onClick={() => moveComparisonWordbook(selectedComparisonWordbook.id, -1)} />
                    <IconButton icon={ArrowDown} label="비교형 아래로" size="sm" onClick={() => moveComparisonWordbook(selectedComparisonWordbook.id, 1)} />
                    <IconButton icon={Trash2} label="비교형 삭제" size="sm" tone="danger" onClick={handleDeleteComparisonWordbook} />
                  </div>
                </div>

                <label className="form-field">
                  <span className={styles.fieldLabel}>세트 이름</span>
                  <input className="glass-input" value={selectedComparisonWordbook.name} onChange={(event) => updateComparisonWordbookField(selectedComparisonWordbook.id, 'name', event.target.value)} />
                </label>

                <label className="form-field">
                  <span className={styles.fieldLabel}>세트 ID</span>
                  <input className="glass-input" value={selectedComparisonWordbook.id} onChange={(event) => updateComparisonWordbookField(selectedComparisonWordbook.id, 'id', event.target.value)} />
                </label>

                <label className="form-field">
                  <span className={styles.fieldLabel}>단어 ID 접두사</span>
                  <input
                    className="glass-input"
                    value={selectedComparisonWordbook.wordIdPrefix ?? ''}
                    onChange={(event) => updateComparisonWordbookField(selectedComparisonWordbook.id, 'wordIdPrefix', event.target.value)}
                  />
                </label>
              </div>
            ) : null}
          </div>
        </GlassPanel>

        <GlassPanel className={styles.tablePanel} padding="md">
          <div className={styles.panelTop}>
            <div className={styles.searchWrap}>
              <ScanSearch size={16} />
              <input
                className={styles.searchInput}
                value={searchQuery}
                onChange={(event) => {
                  const nextValue = event.target.value
                  startTransition(() => setSearchQuery(nextValue))
                }}
                placeholder={mode === 'basic' ? '단어 검색' : mode === 'theme' ? '단어 검색' : '비교/단어 검색'}
              />
            </div>

            <div className={styles.inlineActions}>
              {mode !== 'compare' ? (
                <>
                  <Tooltip label="단어 편집">
                    <span>
                      <IconButton
                        icon={SquarePen}
                        label="단어 편집"
                        size="sm"
                        active={tableMode === 'word'}
                        onClick={() => setTableMode('word')}
                      />
                    </span>
                  </Tooltip>
                  <Tooltip label="예문 편집">
                    <span>
                      <IconButton
                        icon={FileText}
                        label="예문 편집"
                        size="sm"
                        active={tableMode === 'prompt'}
                        onClick={() => setTableMode('prompt')}
                      />
                    </span>
                  </Tooltip>
                </>
              ) : null}
              <Tooltip label="양식 다운로드">
                <span>
                  <IconButton icon={Download} label="양식 다운로드" size="sm" onClick={() => void handleDownloadTemplate()} />
                </span>
              </Tooltip>
              <Tooltip label="업로드">
                <span>
                  <IconButton icon={Upload} label="xlsx 업로드" size="sm" onClick={() => importInputRef.current?.click()} />
                </span>
              </Tooltip>
              {mode === 'basic' && tableMode === 'word' ? (
                <>
                  <Tooltip label="단어 추가">
                    <span>
                      <IconButton icon={Plus} label="단어 추가" size="sm" onClick={handleAddWord} disabled={!selectedSetId} />
                    </span>
                  </Tooltip>
                  <Tooltip label="복제">
                    <span>
                      <IconButton icon={SquarePen} label="선택 단어 복제" size="sm" onClick={handleDuplicateWord} disabled={!selectedWord} />
                    </span>
                  </Tooltip>
                  <Tooltip label="삭제">
                    <span>
                      <IconButton icon={Trash2} label="선택 단어 삭제" size="sm" tone="danger" onClick={handleDeleteWord} disabled={!selectedWord} />
                    </span>
                  </Tooltip>
                </>
              ) : null}

              {mode === 'theme' && tableMode === 'word' ? (
                <>
                  <Tooltip label="단어 추가">
                    <span>
                      <IconButton icon={Plus} label="주제형 단어 추가" size="sm" onClick={handleAddThemeWord} disabled={!selectedThemeWordbookId} />
                    </span>
                  </Tooltip>
                  <Tooltip label="단어 삭제">
                    <span>
                      <IconButton icon={Trash2} label="선택 주제형 단어 삭제" size="sm" tone="danger" onClick={handleDeleteThemeWord} disabled={!selectedThemeWord} />
                    </span>
                  </Tooltip>
                </>
              ) : null}

              {mode === 'compare' ? (
                <>
                  <Tooltip label="행 추가">
                    <span>
                      <IconButton icon={Plus} label="비교 카드 추가" size="sm" onClick={handleAddComparisonPair} disabled={!selectedComparisonWordbookId} />
                    </span>
                  </Tooltip>
                  <Tooltip label="삭제">
                    <span>
                      <IconButton icon={Trash2} label="선택 비교 카드 삭제" size="sm" tone="danger" onClick={handleDeleteComparisonPair} disabled={!selectedComparisonPair} />
                    </span>
                  </Tooltip>
                </>
              ) : null}
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.currentTarget.value = ''
                if (!file) {
                  return
                }

                void handleImportWorkbook(file)
              }}
            />
          </div>

          <div className={styles.tableWrap}>
            {mode === 'basic' && tableMode === 'word' ? (
              <table className={styles.table}>
                {renderColGroup('basic-words', basicWordColumns)}
                <thead>
                  {renderTableHeader('basic-words', basicWordColumns)}
                </thead>
                <tbody>
                  {selectedSetWords.map((word) => (
                    <BasicWordRow
                      key={word.id}
                      active={word.id === selectedWordId}
                      changeTickRef={changeTickRef}
                      setChangeTick={setChangeTick}
                      setSaveState={setSaveState}
                      setSelectedWordId={setSelectedWordId}
                      setSnapshot={setSnapshot}
                      word={word}
                    />
                  ))}
                </tbody>
              </table>
            ) : null}

            {mode === 'basic' && tableMode === 'prompt' ? (
              <table className={styles.table}>
                {renderColGroup('basic-prompts', smartReviewPromptColumns)}
                <thead>
                  {renderTableHeader('basic-prompts', smartReviewPromptColumns)}
                </thead>
                <tbody>
                  {selectedSetWords.map((word, index) => (
                    <SmartReviewPromptRow
                      key={word.id}
                      active={word.id === selectedWordId}
                      changeTickRef={changeTickRef}
                      mode="basic"
                      rowIndex={index}
                      setChangeTick={setChangeTick}
                      setSaveState={setSaveState}
                      setSelectedThemeWordId={setSelectedThemeWordId}
                      setSelectedWordId={setSelectedWordId}
                      setSnapshot={setSnapshot}
                      word={word}
                    />
                  ))}
                </tbody>
              </table>
            ) : null}

            {mode === 'theme' && tableMode === 'word' ? (
              <>
                <table className={styles.table}>
                  {renderColGroup('theme-words', themeWordColumns)}
                  <thead>
                    {renderTableHeader('theme-words', themeWordColumns)}
                  </thead>
                  <tbody>
                    {selectedThemeWords.map((word) => (
                      <ThemeWordRow
                        key={word.id}
                        active={word.id === selectedThemeWordId}
                        changeTickRef={changeTickRef}
                        setChangeTick={setChangeTick}
                        setSaveState={setSaveState}
                        setSelectedThemeWordId={setSelectedThemeWordId}
                        setSnapshot={setSnapshot}
                        topicId={getThemeWordTopicId(word.id)}
                        topics={selectedThemeWordbook?.topics ?? []}
                        word={word}
                        wordbookId={selectedThemeWordbookId ?? ''}
                      />
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}

            {mode === 'theme' && tableMode === 'prompt' ? (
              <table className={styles.table}>
                {renderColGroup('theme-prompts', smartReviewPromptColumns)}
                <thead>
                  {renderTableHeader('theme-prompts', smartReviewPromptColumns)}
                </thead>
                <tbody>
                  {selectedThemeWords.map((word, index) => (
                    <SmartReviewPromptRow
                      key={word.id}
                      active={word.id === selectedThemeWordId}
                      changeTickRef={changeTickRef}
                      mode="theme"
                      rowIndex={index}
                      setChangeTick={setChangeTick}
                      setSaveState={setSaveState}
                      setSelectedThemeWordId={setSelectedThemeWordId}
                      setSelectedWordId={setSelectedWordId}
                      setSnapshot={setSnapshot}
                      word={word}
                    />
                  ))}
                </tbody>
              </table>
            ) : null}

            {mode === 'compare' ? (
              <>
                <div className={styles.panelTop}>
                  <h3 className={styles.detailTitle}>비교</h3>
                </div>
                <table className={styles.table}>
                  {renderColGroup('comparison-pairs', comparisonPairColumns)}
                  <thead>
                    {renderTableHeader('comparison-pairs', comparisonPairColumns)}
                  </thead>
                  <tbody>
                    {selectedComparisonRows.map(({ pair, leftWord, rightWord }) => (
                      <Fragment key={pair.id}>
                        <tr
                          className={styles.comparePairRow}
                          data-active={pair.id === selectedComparisonPairId}
                          data-compare-row="top"
                          onClick={() => setSelectedComparisonPairId(pair.id)}
                        >
                          <td rowSpan={2} className={styles.comparePairActionCell}>
                            <div className={styles.rowActions}>
                              <button type="button" className={styles.rowAction} aria-label="위로" onClick={(event) => { event.stopPropagation(); moveComparisonPair(pair.id, -1) }}>
                                <ArrowUp size={14} />
                              </button>
                              <button type="button" className={styles.rowAction} aria-label="아래로" onClick={(event) => { event.stopPropagation(); moveComparisonPair(pair.id, 1) }}>
                                <ArrowDown size={14} />
                              </button>
                            </div>
                          </td>
                          {renderComparisonWordCells(pair.id, 'left', leftWord)}
                          <td rowSpan={2} className={styles.compareDescriptionCell}>
                            <textarea
                              aria-label="공통 설명"
                              className={styles.compareDescriptionInput}
                              value={getComparisonSharedDescription(pair)}
                              onChange={(event) => updateComparisonSharedDescription(pair.id, event.target.value)}
                            />
                          </td>
                        </tr>
                        <tr
                          className={styles.comparePairRow}
                          data-active={pair.id === selectedComparisonPairId}
                          data-compare-row="bottom"
                          onClick={() => setSelectedComparisonPairId(pair.id)}
                        >
                          {renderComparisonWordCells(pair.id, 'right', rightWord)}
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}

            {(mode === 'basic' && selectedSetWords.length === 0)
            || (mode === 'theme' && selectedThemeWords.length === 0)
            || (mode === 'compare' && selectedComparisonRows.length === 0)
              ? <div className={styles.empty}>없음</div>
              : null}
          </div>

        </GlassPanel>
      </div>

      {validationIssues.length > 0 ? (
        <GlassPanel className={styles.issuePanel} padding="md">
          <div className={styles.panelTop}>
            <h2 className="page-header__title">오류</h2>
          </div>
          <div className={styles.issueList}>
            {validationIssues.slice(0, 10).map((issue, index) => (
              <div key={`${issue.scope}-${issue.id}-${issue.field}-${index}`} className={styles.issueItem}>
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      ) : null}

      {pendingThemeTopicDelete ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="theme-topic-delete-title" onClick={closeThemeTopicDeleteDialog}>
          <GlassPanel className={styles.modal} padding="lg" variant="strong" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 id="theme-topic-delete-title" className="page-header__title">주제 삭제</h2>
            </div>
            <p className={styles.modalBody}>{pendingThemeTopicDelete.name}</p>
            <div className={styles.modalButtonRow}>
              <button type="button" className="pill" onClick={() => confirmDeleteThemeTopic(false)}>단어 남기기</button>
              <button type="button" className="pill" onClick={() => confirmDeleteThemeTopic(true)}>단어도 삭제</button>
              <button type="button" className="pill" onClick={closeThemeTopicDeleteDialog}>취소</button>
            </div>
          </GlassPanel>
        </div>
      ) : null}
    </div>
  )
}
