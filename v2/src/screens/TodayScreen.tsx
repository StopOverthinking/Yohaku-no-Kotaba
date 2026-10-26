import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CircleHelp, Heart, ListChecks, MoonStar, Play, Plus, RotateCcw, SunMedium, TextSelect, Trash2, X } from 'lucide-react'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { useContextStore } from '@/features/learn/contextStore'
import { formatScore, formatScoreChange } from '@/features/learn/reviewList'
import { jlptGradeLabel } from '@/features/learn/jlptEstimate'
import { useLearnPlan } from '@v2/lib/useLearnPlan'
import { IconButton, Sheet, Stepper, Switch, useConfirm } from '@v2/ui/primitives'
import { RulesContent } from '@v2/screens/RulesContent'
import '@v2/styles/today.css'

const PRESETS = [5, 10, 20, 30]
const todayLabel = () => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

export function TodayScreen() {
  const navigate = useNavigate()
  const plan = useLearnPlan()
  const confirm = useConfirm()
  const session = useContextStore((state) => state.data.session)
  const level = useContextStore((state) => state.data.level)
  const lastScoreChange = useContextStore((state) => state.data.lastScoreChange)
  const storeError = useContextStore((state) => state.error)
  const discard = useContextStore((state) => state.discard)
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const toggleThemeMode = usePreferencesStore((state) => state.toggleThemeMode)
  const [rulesOpen, setRulesOpen] = useState(false)
  const d = plan.learnDefaults
  const assessed = level.assessedWordIds.length
  const delta = lastScoreChange ? formatScoreChange(lastScoreChange.before, lastScoreChange.after) : null
  const grade = jlptGradeLabel(level.value, assessed)

  const discardSession = async () => {
    const ok = await confirm({ title: '학습을 닫을까요?', body: '이미 학습한 기록은 유지됩니다.', confirmLabel: '닫기' })
    if (ok) await discard()
  }

  const updateRequired = (index: number, field: 'start' | 'end', value: number) =>
    plan.updateLearnDefaults({ requiredRanges: d.requiredRanges.map((range, i) => (i === index ? { ...range, [field]: value } : range)) })

  return (
    <div className="page today">
      <header className="topbar">
        <div className="today__title">
          <p className="eyebrow">{todayLabel()}</p>
          <h1>여백의 말</h1>
        </div>
        <IconButton icon={CircleHelp} label="점수와 복습 규칙" onClick={() => setRulesOpen(true)} />
        <IconButton
          icon={themeMode === 'dark' ? SunMedium : MoonStar}
          label={themeMode === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          onClick={toggleThemeMode}
        />
      </header>

      {storeError && <p className="alert" role="alert">{storeError}</p>}

      <section className="stats" aria-label="학습 현황">
        <div className="stat">
          <span className="stat__label">점수</span>
          {/* The change hangs off the score itself so it never reads as part of the grade. */}
          <span className="stat__score">
            <strong className="stat__value">{formatScore(level.value)}</strong>
            {delta && (
              <span className="stat__delta" data-sign={delta.startsWith('-') ? 'down' : delta === '0.0' ? 'flat' : 'up'}>
                {delta}
              </span>
            )}
          </span>
        </div>
        <button type="button" className="stat stat--link" onClick={() => navigate('/learn/review')}>
          <span className="stat__label">오늘 복습</span>
          <strong className="stat__value">{plan.dueCount}</strong>
          <ArrowRight size={16} className="stat__go" />
        </button>
        {grade ? (
          <div className="stat">
            <span className="stat__label">JLPT</span>
            <strong className="stat__value" title="JLPT 어휘 환산">
              {grade}
            </strong>
          </div>
        ) : (
          <div className="stat">
            <span className="stat__label">수준 측정</span>
            <strong className="stat__value">
              {assessed}
              <small>/20</small>
            </strong>
            <span className="meter" aria-hidden="true">
              <span style={{ transform: `scaleX(${assessed / 20})` }} />
            </span>
          </div>
        )}
      </section>

      {session ? (
        <section className="card resume">
          <div className="resume__body">
            <p className="eyebrow">이어서 학습</p>
            <h2>{session.setName}</h2>
            <div className="progress" aria-label={`진행 ${session.cards.length}/${session.targetCount}`}>
              <span style={{ transform: `scaleX(${Math.min(1, session.cards.length / Math.max(1, session.targetCount))})` }} />
            </div>
            <p className="muted">
              {session.round > 1 ? `${session.round}회차 · ` : ''}
              {session.cards.length}/{session.targetCount}
            </p>
          </div>
          <div className="resume__actions">
            <IconButton icon={X} label="학습 닫기" tone="danger" onClick={discardSession} disabled={plan.busy} />
            <button type="button" className="btn btn--primary" onClick={() => navigate('/learn/session')}>
              <RotateCcw size={18} />
              이어하기
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="card setup" aria-label="학습 조건">
            <div className="section">
              <div className="section__head">
                <h2 className="section__title">단어장</h2>
              </div>
              <div className="chips" role="radiogroup" aria-label="단어장">
                {[
                  { id: 'all', name: '자동 추천' },
                  { id: 'favorites', name: '즐겨찾기' },
                  ...plan.wordbooks.map((book) => ({ id: book.id, name: book.name })),
                ].map((book) => (
                  <button
                    key={book.id}
                    type="button"
                    role="radio"
                    className="chip"
                    aria-checked={plan.selectedSetId === book.id}
                    onClick={() => plan.setSelectedSetId(book.id)}
                  >
                    {book.id === 'favorites' && <Heart size={14} />}
                    {book.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="section">
              <div className="section__head">
                <h2 className="section__title">학습 수</h2>
                <span className="muted">최대 {plan.maxAvailable}</span>
              </div>
              <Stepper
                label="학습 수"
                value={d.wordCount}
                min={plan.minimumCount}
                step={5}
                onChange={(wordCount) => plan.updateLearnDefaults({ wordCount })}
              />
              <div className="presets" role="group" aria-label="빠른 선택">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="chip"
                    aria-pressed={d.wordCount === preset}
                    disabled={preset < plan.minimumCount}
                    onClick={() => plan.updateLearnDefaults({ wordCount: preset })}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="rows">
              <div className="row">
                <span className="row__icon">
                  <Heart size={16} />
                </span>
                <span className="row__label">즐겨찾기만</span>
                <Switch label="즐겨찾기만" checked={d.favoritesOnly} onChange={(favoritesOnly) => plan.updateLearnDefaults({ favoritesOnly })} />
              </div>
              <div className="row row--stack">
                <div className="row__line">
                  <span className="row__icon">
                    <TextSelect size={16} />
                  </span>
                  <span className="row__label">범위</span>
                  {d.rangeEnabled && <span className="row__value">{plan.baseCount}개 중</span>}
                  <Switch label="범위 지정" checked={d.rangeEnabled} onChange={(rangeEnabled) => plan.updateLearnDefaults({ rangeEnabled })} />
                </div>
                {d.rangeEnabled && (
                  <RangeInputs
                    start={d.rangeStart}
                    end={d.rangeEnd}
                    label="범위"
                    onChange={(field, value) => plan.updateLearnDefaults(field === 'start' ? { rangeStart: value } : { rangeEnd: value })}
                  />
                )}
              </div>
              <div className="row row--stack">
                <div className="row__line">
                  <span className="row__icon">
                    <ListChecks size={16} />
                  </span>
                  <span className="row__label">반드시 포함</span>
                  {d.requiredRangesEnabled && <span className="row__value">{plan.requiredCount}개</span>}
                  <Switch
                    label="반드시 포함할 범위"
                    checked={d.requiredRangesEnabled}
                    onChange={(on) =>
                      plan.updateLearnDefaults(
                        on && d.requiredRanges.length === 0 ? { requiredRangesEnabled: true, requiredRanges: [{ start: 1, end: 10 }] } : { requiredRangesEnabled: on },
                      )
                    }
                  />
                </div>
                {d.requiredRangesEnabled && (
                  <div className="ranges">
                    {d.requiredRanges.map((range, index) => (
                      <div className="ranges__item" key={index}>
                        <RangeInputs start={range.start} end={range.end} label={`필수 범위 ${index + 1}`} onChange={(field, value) => updateRequired(index, field, value)} />
                        <IconButton
                          icon={Trash2}
                          size="sm"
                          tone="danger"
                          label={`필수 범위 ${index + 1} 삭제`}
                          onClick={() => plan.updateLearnDefaults({ requiredRanges: d.requiredRanges.filter((_, i) => i !== index) })}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="ranges__add"
                      onClick={() => {
                        const end = d.requiredRanges.at(-1)?.end ?? 0
                        plan.updateLearnDefaults({ requiredRanges: [...d.requiredRanges, { start: end + 1, end: end + 10 }] })
                      }}
                    >
                      <Plus size={16} /> 범위 추가
                    </button>
                  </div>
                )}
              </div>
            </div>
            {plan.nextDue && <p className="muted">다음 복습 · {plan.nextDue}</p>}
          </section>

          <div className="startbar">
            {plan.error && (
              <p className="alert" role="alert">
                {plan.error}
              </p>
            )}
            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              disabled={plan.busy || !plan.ready}
              onClick={async () => {
                if (await plan.startSession()) navigate('/learn/session')
              }}
            >
              <Play size={18} fill="currentColor" />
              {plan.setName} · {d.wordCount}개 시작
            </button>
          </div>
        </>
      )}

      {rulesOpen && (
        <Sheet title="점수와 복습" onClose={() => setRulesOpen(false)}>
          <RulesContent />
        </Sheet>
      )}
    </div>
  )
}

function RangeInputs({ start, end, label, onChange }: { start: number; end: number; label: string; onChange: (field: 'start' | 'end', value: number) => void }) {
  return (
    <div className="range">
      <NumberField value={start} label={`${label} 시작`} onCommit={(value) => onChange('start', value)} />
      <span aria-hidden="true">–</span>
      <NumberField value={end} label={`${label} 끝`} onCommit={(value) => onChange('end', value)} />
    </div>
  )
}

function NumberField({ value, label, onCommit }: { value: number; label: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="field field--sm"
      type="number"
      inputMode="numeric"
      min={1}
      aria-label={label}
      value={draft ?? String(value)}
      onFocus={(event) => {
        setDraft(String(value))
        event.currentTarget.select()
      }}
      onChange={(event) => {
        setDraft(event.target.value)
        const parsed = Math.floor(Number(event.target.value))
        if (event.target.value !== '' && Number.isFinite(parsed)) onCommit(Math.max(1, parsed))
      }}
      onBlur={() => setDraft(null)}
    />
  )
}
