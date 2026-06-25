import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Heart, Play, RotateCcw, Sparkles, Undo2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import { useExamStore } from '@/features/exam/examStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import styles from '@/features/learn/learn.module.css'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { useLearnSessionStore } from '@/features/session/learnSessionStore'
import { buildCandidateWords, getFilteredWords } from '@/features/study/wordSelection'
import { getSetName, getStudySelectableWordbooks, isComparisonWordbook, normalizeSelectableSetId } from '@/features/vocab/model/selectors'
import type { FrontMode } from '@/features/vocab/model/types'

const MIN_WORD_COUNT = 1
const COUNT_STEPS = [-10, -5, 5, 10] as const
type RangeField = 'rangeStart' | 'rangeEnd'

function normalizeWordCount(wordCount: number) {
  return Math.max(MIN_WORD_COUNT, Math.floor(wordCount) || MIN_WORD_COUNT)
}

function parseRangeDraft(value: string) {
  if (value === '') return null
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) ? Math.max(1, parsed) : null
}

export function LearnSetupPage() {
  const navigate = useNavigate()
  const learnDefaults = usePreferencesStore((state) => state.learnDefaults)
  const updateLearnDefaults = usePreferencesStore((state) => state.updateLearnDefaults)
  const lastSelectedSetId = usePreferencesStore((state) => state.lastSelectedSetId)
  const setLastSelectedSetId = usePreferencesStore((state) => state.setLastSelectedSetId)
  const wrongAnswerIds = useExamStore((state) => state.wrongAnswerIds)
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds)
  const startSession = useLearnSessionStore((state) => state.startSession)
  const sessionRecord = useLearnSessionStore((state) => state.record)
  const discardSession = useLearnSessionStore((state) => state.discardSession)
  const [error, setError] = useState<string | null>(null)
  const [rangeDrafts, setRangeDrafts] = useState({
    rangeStart: String(learnDefaults.rangeStart),
    rangeEnd: String(learnDefaults.rangeEnd),
  })
  const activeRangeFieldRef = useRef<RangeField | null>(null)
  const rangeEditBaselineRef = useRef<Partial<Record<RangeField, number>>>({})
  const selectedSetId = lastSelectedSetId === 'wrong_answers'
    ? 'wrong_answers'
    : isComparisonWordbook(lastSelectedSetId)
      ? 'all'
      : normalizeSelectableSetId(lastSelectedSetId)
  const currentSetName = selectedSetId === 'wrong_answers' ? '오답 노트' : getSetName(selectedSetId)

  useEffect(() => {
    if (selectedSetId !== lastSelectedSetId) {
      setLastSelectedSetId(selectedSetId)
    }
  }, [lastSelectedSetId, selectedSetId, setLastSelectedSetId])

  useEffect(() => {
    setRangeDrafts((drafts) => ({
      rangeStart: activeRangeFieldRef.current === 'rangeStart' ? drafts.rangeStart : String(learnDefaults.rangeStart),
      rangeEnd: activeRangeFieldRef.current === 'rangeEnd' ? drafts.rangeEnd : String(learnDefaults.rangeEnd),
    }))
  }, [learnDefaults.rangeEnd, learnDefaults.rangeStart])

  const availableWords = useMemo(
    () =>
      getFilteredWords({
        setId: selectedSetId,
        favoritesOnly: learnDefaults.favoritesOnly,
        favoriteIds,
        wrongAnswerIds,
        rangeEnabled: learnDefaults.rangeEnabled,
        rangeStart: learnDefaults.rangeStart,
        rangeEnd: learnDefaults.rangeEnd,
      }),
    [
      favoriteIds,
      selectedSetId,
      learnDefaults.favoritesOnly,
      learnDefaults.rangeEnabled,
      learnDefaults.rangeEnd,
      learnDefaults.rangeStart,
      wrongAnswerIds,
    ],
  )

  const selectableWordbooks = useMemo(() => getStudySelectableWordbooks(), [])

  const handleCountAdjust = (delta: number) => {
    updateLearnDefaults({ wordCount: normalizeWordCount(learnDefaults.wordCount + delta) })
  }

  const handleCountChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateLearnDefaults({ wordCount: normalizeWordCount(Number(event.target.value)) })
  }

  const updateRangeDefault = (field: RangeField, value: number) => {
    if (field === 'rangeStart') {
      updateLearnDefaults({ rangeStart: value })
      return
    }

    updateLearnDefaults({ rangeEnd: value })
  }

  const handleRangeFocus = (field: RangeField) => {
    activeRangeFieldRef.current = field
    rangeEditBaselineRef.current[field] = learnDefaults[field]
  }

  const handleRangeChange = (field: RangeField, event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value
    setRangeDrafts((drafts) => ({ ...drafts, [field]: nextDraft }))

    const nextValue = parseRangeDraft(nextDraft)
    if (nextValue === null) return

    updateRangeDefault(field, nextValue)
  }

  const handleRangeBlur = (field: RangeField) => {
    const nextValue = parseRangeDraft(rangeDrafts[field])
    const fallbackValue = rangeEditBaselineRef.current[field] ?? learnDefaults[field]
    const committedValue = nextValue ?? fallbackValue

    updateRangeDefault(field, committedValue)
    setRangeDrafts((drafts) => ({ ...drafts, [field]: String(committedValue) }))

    delete rangeEditBaselineRef.current[field]
    if (activeRangeFieldRef.current === field) {
      activeRangeFieldRef.current = null
    }
  }

  const handleDiscardSession = () => {
    if (!window.confirm('진행 중이던 학습을 파기할까요? 지금까지의 학습 진행 내용은 삭제됩니다.')) {
      return
    }

    discardSession()
  }

  const handleStart = () => {
    if (learnDefaults.rangeEnabled && learnDefaults.rangeStart > learnDefaults.rangeEnd) {
      setError('범위 시작값이 끝값보다 클 수 없습니다.')
      return
    }

    const sessionWords = buildCandidateWords(
      getFilteredWords({
        setId: selectedSetId,
        favoritesOnly: learnDefaults.favoritesOnly,
        favoriteIds,
        wrongAnswerIds,
        rangeEnabled: learnDefaults.rangeEnabled,
        rangeStart: learnDefaults.rangeStart,
        rangeEnd: learnDefaults.rangeEnd,
      }),
      learnDefaults.wordCount,
    )

    if (sessionWords.length === 0) {
      setError('시작할 항목이 없습니다. 단어장과 필터를 다시 확인해 주세요.')
      return
    }

    setError(null)
    startSession({
      setId: selectedSetId,
      setName: currentSetName,
      frontMode: learnDefaults.frontMode,
      items: sessionWords,
    })
    navigate('/learn/session')
  }

  return (
    <div className={styles.root}>
      <div className="page-header page-header--inline-action">
        <div className="page-header__left">
          <Tooltip label="뒤로 이동">
            <span>
              <IconButton icon={Undo2} label="뒤로 이동" onClick={() => navigate('/')} />
            </span>
          </Tooltip>
          <div className="page-header__meta">
            <p className="page-header__caption">{currentSetName}</p>
            <h1 className="page-header__title">학습 설정</h1>
          </div>
        </div>
        <div className="page-header__right">
          <Tooltip label="세션 시작">
            <span>
              <IconButton icon={Play} label="세션 시작" size="lg" onClick={handleStart} />
            </span>
          </Tooltip>
        </div>
      </div>

      {sessionRecord ? (
        <GlassPanel className={styles.resumeBanner} variant="floating">
          <div>
            <p className="section-kicker">이어하기</p>
            <h2 className="page-header__title">{sessionRecord.setName} 세션을 이어서 진행할 수 있습니다.</h2>
          </div>
          <div className={styles.resumeActions}>
            <Tooltip label="학습 이어하기">
              <span>
                <IconButton icon={RotateCcw} label="학습 이어하기" size="lg" onClick={() => navigate('/learn/session')} />
              </span>
            </Tooltip>
            <Tooltip label="학습 파기">
              <span>
                <IconButton icon={X} label="학습 파기" tone="danger" size="lg" onClick={handleDiscardSession} />
              </span>
            </Tooltip>
          </div>
        </GlassPanel>
      ) : null}

      <div className={styles.setupGrid}>
        <GlassPanel className={`setup-panel-shell ${styles.layout}`} padding="lg" variant="strong">
          <div>
            <p className="section-kicker">Setup</p>
            <p className="section-copy">세트와 조건을 정하고 바로 학습을 시작해 보세요.</p>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="set-select">학습 단어장</label>
            <select
              id="set-select"
              className="glass-select"
              value={selectedSetId}
              onChange={(event) => setLastSelectedSetId(event.target.value)}
            >
              <option value="all">전체 세트</option>
              <option value="favorites">즐겨찾기 단어</option>
              {wrongAnswerIds.length > 0 ? <option value="wrong_answers">오답 노트</option> : null}
              {selectableWordbooks.map((wordbook) => (
                <option key={wordbook.id} value={wordbook.id}>
                  {wordbook.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="count-input">학습 항목 수</label>
            <div className={styles.countControl}>
              <div className={styles.countStepColumn}>
                {COUNT_STEPS.filter((step) => step < 0).map((step) => (
                  <button key={step} type="button" className={`pill ${styles.countButton}`} onClick={() => handleCountAdjust(step)}>
                    {step}
                  </button>
                ))}
              </div>
              <input
                id="count-input"
                type="number"
                min={MIN_WORD_COUNT}
                className={`glass-input ${styles.countInput}`}
                value={learnDefaults.wordCount}
                onChange={handleCountChange}
              />
              <div className={styles.countStepColumn}>
                {COUNT_STEPS.filter((step) => step > 0).map((step) => (
                  <button key={step} type="button" className={`pill ${styles.countButton}`} onClick={() => handleCountAdjust(step)}>
                    +{step}
                  </button>
                ))}
              </div>
            </div>
            <p className="page-header__caption">현재 조건에서 최대 {availableWords.length}개까지 선택됩니다.</p>
          </div>

          <div className="toggle-row">
            <div>
              <div className="form-label">앞면 기준</div>
              <p className="page-header__caption">카드의 앞면에 보여줄 정보를 선택합니다.</p>
            </div>
            <div className="action-row">
              <button
                className="pill"
                data-active={learnDefaults.frontMode === 'japanese'}
                onClick={() => updateLearnDefaults({ frontMode: 'japanese' satisfies FrontMode })}
              >
                일본어
              </button>
              <button
                className="pill"
                data-active={learnDefaults.frontMode === 'meaning'}
                onClick={() => updateLearnDefaults({ frontMode: 'meaning' satisfies FrontMode })}
              >
                뜻
              </button>
            </div>
          </div>

          <div className="toggle-row">
            <div>
              <div className="form-label">즐겨찾기만 학습</div>
              <p className="page-header__caption">표시 중인 즐겨찾기 단어만 세션에 포함합니다.</p>
            </div>
            <Tooltip label="즐겨찾기만 학습">
              <span>
                <IconButton
                  icon={Heart}
                  label="즐겨찾기만 학습"
                  active={learnDefaults.favoritesOnly}
                  onClick={() => updateLearnDefaults({ favoritesOnly: !learnDefaults.favoritesOnly })}
                />
              </span>
            </Tooltip>
          </div>

          <div className="toggle-row">
            <div>
              <div className="form-label">범위 지정</div>
              <p className="page-header__caption">현재 세트에서 원하는 구간만 골라 학습합니다.</p>
            </div>
            <Tooltip label="범위 지정">
              <span>
                <IconButton
                  icon={Sparkles}
                  label="범위 지정"
                  active={learnDefaults.rangeEnabled}
                  onClick={() => updateLearnDefaults({ rangeEnabled: !learnDefaults.rangeEnabled })}
                />
              </span>
            </Tooltip>
          </div>

          {learnDefaults.rangeEnabled ? (
            <div className="range-grid">
              <div className="form-field">
                <label className="form-label" htmlFor="range-start">시작</label>
                <input
                  id="range-start"
                  type="number"
                  min={1}
                  className="glass-input"
                  value={rangeDrafts.rangeStart}
                  onFocus={() => handleRangeFocus('rangeStart')}
                  onChange={(event) => handleRangeChange('rangeStart', event)}
                  onBlur={() => handleRangeBlur('rangeStart')}
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="range-end">끝</label>
                <input
                  id="range-end"
                  type="number"
                  min={1}
                  className="glass-input"
                  value={rangeDrafts.rangeEnd}
                  onFocus={() => handleRangeFocus('rangeEnd')}
                  onChange={(event) => handleRangeChange('rangeEnd', event)}
                  onBlur={() => handleRangeBlur('rangeEnd')}
                />
              </div>
            </div>
          ) : null}

          {error ? <p className="page-header__caption" style={{ color: 'var(--accent-coral)' }}>{error}</p> : null}
        </GlassPanel>
      </div>
    </div>
  )
}
