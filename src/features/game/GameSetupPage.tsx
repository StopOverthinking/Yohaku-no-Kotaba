import { useMemo, useState } from 'react'
import { Play, Undo2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import {
  calculateBotSettings,
  getGameLabel,
  getModeLabel,
  getQuestionCount,
  getQuizTypeLabel,
  getRomanNumeral,
  getTierInfo,
} from '@/features/game/gameEngine'
import {
  loadBotHistory,
  loadPlayerMmr,
  loadPlayerNickname,
  loadSingleModeRecords,
  loadTapMatchRushRecords,
  savePlayerNickname,
} from '@/features/game/gameStorage'
import { useGameStore } from '@/features/game/gameStore'
import type { GameKind, GameMode, GameQuizType } from '@/features/game/gameTypes'
import { allNonComparisonWords } from '@/features/vocab/model/selectors'
import styles from '@/features/game/game.module.css'

type SpeedQuizSelectionState = {
  gameKind: 'speed_quiz'
  mode: GameMode
  quizType: GameQuizType
}

type TapMatchRushSelectionState = {
  gameKind: 'tap_match_rush'
  pairCount: number
}

type SelectionState = SpeedQuizSelectionState | TapMatchRushSelectionState

const initialSelection: SelectionState = {
  gameKind: 'speed_quiz',
  mode: 'single',
  quizType: 'objective',
}

const gameCards: Array<{
  gameKind: GameKind
  title: string
  description: string
}> = [
  { gameKind: 'speed_quiz', title: '스피드 퀴즈', description: '빠르게 풀고 점수를 올립니다.' },
  { gameKind: 'tap_match_rush', title: '탭 매치 러시', description: '짝을 맞추고 시간을 줄입니다.' },
]

const modeCards: Array<{
  mode: GameMode
  quizType: GameQuizType
  title: string
  description: string
}> = [
  { mode: 'single', quizType: 'objective', title: '싱글 · 객관식', description: '30문제를 빠르게 풀고 최고 점수를 갱신합니다.' },
  { mode: 'single', quizType: 'pronunciation', title: '싱글 · 발음 입력', description: '일본어 단어를 보고 읽기를 직접 입력합니다.' },
  { mode: 'bot', quizType: 'objective', title: '멀티 · 객관식', description: '상대와 점수 레이스를 벌입니다.' },
  { mode: 'bot', quizType: 'pronunciation', title: '멀티 · 발음 입력', description: '발음 입력 속도와 정확도로 상대와 경쟁합니다.' },
]

const tapMatchPairCountOptions = [6, 8, 10]
const GAME_SOURCE_SET_NAME = '기본 · 주제형'

export function GameSetupPage() {
  const navigate = useNavigate()
  const startGame = useGameStore((state) => state.startGame)
  const [selection, setSelection] = useState(initialSelection)
  const [playerName, setPlayerName] = useState(loadPlayerNickname() || '플레이어')
  const [error, setError] = useState<string | null>(null)

  const availableWords = useMemo(() => allNonComparisonWords, [])

  const targetQuestionCount = selection.gameKind === 'speed_quiz'
    ? getQuestionCount(selection.quizType)
    : selection.pairCount
  const previewWords = useMemo(
    () => availableWords.slice(0, Math.min(targetQuestionCount, availableWords.length)),
    [availableWords, targetQuestionCount],
  )

  const singleRecords = useMemo(
    () => selection.gameKind === 'speed_quiz' ? loadSingleModeRecords(selection.quizType) : [],
    [selection],
  )

  const tapMatchRushRecords = useMemo(
    () => loadTapMatchRushRecords(),
    [],
  )

  const currentMmr = useMemo(
    () => selection.gameKind === 'speed_quiz' ? loadPlayerMmr(selection.quizType) : 0,
    [selection],
  )

  const tierInfo = useMemo(
    () => getTierInfo(currentMmr),
    [currentMmr],
  )

  const opponentPreview = useMemo(
    () => selection.gameKind === 'speed_quiz'
      ? calculateBotSettings(selection.quizType, loadBotHistory(selection.quizType), () => 0.5)
      : null,
    [selection],
  )

  const gameLabel = getGameLabel(selection.gameKind)
  const selectedLabel = selection.gameKind === 'speed_quiz'
    ? `${getModeLabel(selection.mode)} · ${getQuizTypeLabel(selection.quizType)}`
    : `${selection.pairCount}쌍`

  const handleStart = () => {
    if (selection.gameKind === 'speed_quiz' && selection.quizType === 'objective' && availableWords.length < 5) {
      setError('객관식 모드는 최소 5개의 단어가 필요합니다.')
      return
    }

    if (selection.gameKind === 'tap_match_rush' && availableWords.length < selection.pairCount) {
      setError(`탭 매치 러시는 최소 ${selection.pairCount}개의 단어가 필요합니다.`)
      return
    }

    if (previewWords.length === 0) {
      setError('선택한 조건으로는 게임을 시작할 수 없습니다.')
      return
    }

    const normalizedName = playerName.trim() || '플레이어'
    savePlayerNickname(normalizedName)
    setError(null)

    if (selection.gameKind === 'speed_quiz') {
      startGame({
        gameKind: 'speed_quiz',
        setId: 'all',
        setName: GAME_SOURCE_SET_NAME,
        mode: selection.mode,
        quizType: selection.quizType,
        playerName: normalizedName,
        sourceWords: availableWords,
      })
    } else {
      startGame({
        gameKind: 'tap_match_rush',
        setId: 'all',
        setName: GAME_SOURCE_SET_NAME,
        playerName: normalizedName,
        sourceWords: availableWords,
        pairCount: selection.pairCount,
      })
    }

    navigate('/game/session')
  }

  return (
    <div className={styles.root}>
      <div className="page-header page-header--inline-action">
        <div className="page-header__left">
          <Tooltip label="홈으로 돌아가기">
            <span>
              <IconButton icon={Undo2} label="홈으로 돌아가기" onClick={() => navigate('/')} />
            </span>
          </Tooltip>
          <div className="page-header__meta">
            <p className="page-header__caption">Game Mode</p>
            <h1 className="page-header__title">게임 설정</h1>
          </div>
        </div>
        <div className="page-header__right">
          <Tooltip label="게임 시작">
            <span>
              <IconButton icon={Play} label="게임 시작" size="lg" onClick={handleStart} />
            </span>
          </Tooltip>
        </div>
      </div>

      <div className={styles.setupGrid}>
        <GlassPanel className={`setup-panel-shell ${styles.setupMain}`} padding="lg" variant="strong">
          <div>
            <p className="section-kicker">{selection.gameKind === 'speed_quiz' ? 'Speed Quiz' : 'Tap Match Rush'}</p>
            <h2 className="section-title">{gameLabel} · {selectedLabel}</h2>
            <p className="section-copy">
              {selection.gameKind === 'speed_quiz' ? '속도와 정확도로 승부합니다.' : '탭 두 번으로 짝을 맞춥니다.'}
            </p>
          </div>

          <div className={styles.gameKindGrid}>
            {gameCards.map((card) => {
              const isActive = card.gameKind === selection.gameKind
              return (
                <button
                  key={card.gameKind}
                  type="button"
                  className={`${styles.modeCard} ${styles.gameKindCard}`}
                  data-active={isActive}
                  data-kind={card.gameKind}
                  onClick={() => setSelection(
                    card.gameKind === 'speed_quiz'
                      ? { gameKind: 'speed_quiz', mode: 'single', quizType: 'objective' }
                      : { gameKind: 'tap_match_rush', pairCount: 8 },
                  )}
                >
                  <h3 className={styles.modeTitle}>{card.title}</h3>
                  <p className={styles.modeCopy}>{card.description}</p>
                  <span className={styles.statusPill}>{card.gameKind === 'speed_quiz' ? '점수형' : '기록형'}</span>
                </button>
              )
            })}
          </div>

          {selection.gameKind === 'speed_quiz' ? (
            <div className={styles.modeGrid}>
              {modeCards.map((card) => {
                const isActive = card.mode === selection.mode && card.quizType === selection.quizType
                return (
                  <button
                    key={`${card.mode}-${card.quizType}`}
                    type="button"
                    className={styles.modeCard}
                    data-active={isActive}
                    onClick={() => setSelection({ gameKind: 'speed_quiz', mode: card.mode, quizType: card.quizType })}
                  >
                    <h3 className={styles.modeTitle}>{card.title}</h3>
                    <p className={styles.modeCopy}>{card.description}</p>
                    <span className={styles.statusPill}>{getQuestionCount(card.quizType)}문제</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className={styles.summaryCard}>
              <div className="form-label">짝 수</div>
              <div className={styles.segmentRow}>
                {tapMatchPairCountOptions.map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={styles.segmentButton}
                    data-active={selection.pairCount === count}
                    onClick={() => setSelection({ gameKind: 'tap_match_rush', pairCount: count })}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="form-field">
            <label className="form-label" htmlFor="game-player-name">플레이어 이름</label>
            <input
              id="game-player-name"
              className="glass-input"
              type="text"
              maxLength={20}
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </div>

          {error ? <p className="page-header__caption" style={{ color: 'var(--accent-coral)' }}>{error}</p> : null}
        </GlassPanel>

        <div className={styles.setupAside}>
          <GlassPanel className={styles.recordsPanel} padding="lg">
            <div>
              <p className="section-kicker">
                {selection.gameKind === 'speed_quiz'
                  ? selection.mode === 'single' ? 'Records' : 'Ladder'
                  : 'Records'}
              </p>
              <h2 className="page-header__title">
                {selection.gameKind === 'speed_quiz'
                  ? selection.mode === 'single'
                    ? `${getQuizTypeLabel(selection.quizType)} 기록`
                    : `${getQuizTypeLabel(selection.quizType)} 티어`
                  : '탭 매치 기록'}
              </h2>
            </div>

            {selection.gameKind === 'tap_match_rush' ? (
              <>
                <div className={styles.summaryCard}>
                  <div className="form-label">규칙</div>
                  <p className={styles.summaryLine}>오답마다 +1초</p>
                  <p className={styles.summaryLine}>{selection.pairCount}쌍 완료까지 측정</p>
                </div>

                <div className={styles.recordList}>
                  {tapMatchRushRecords.length > 0 ? tapMatchRushRecords.map((record, index) => (
                    <div key={`${record.date}-${record.totalTime}-${index}`} className={styles.recordItem}>
                      <div className={styles.recordTop}>
                        <strong>#{index + 1}</strong>
                        <span>{record.date}</span>
                      </div>
                      <strong>{record.totalTime.toFixed(2)}초</strong>
                      <span>{record.pairCount}쌍 · 실수 {record.wrongAttempts}</span>
                    </div>
                  )) : <p className={styles.softText}>아직 저장된 기록이 없습니다.</p>}
                </div>
              </>
            ) : selection.mode === 'single' ? (
              <div className={styles.recordList}>
                {singleRecords.length > 0 ? singleRecords.map((record, index) => (
                  <div key={`${record.date}-${record.score}-${index}`} className={styles.recordItem}>
                    <div className={styles.recordTop}>
                      <strong>#{index + 1}</strong>
                      <span>{record.date}</span>
                    </div>
                    <strong>{record.score}점</strong>
                    <span>평균 {record.time.toFixed(2)}초</span>
                  </div>
                )) : <p className={styles.softText}>아직 저장된 기록이 없습니다.</p>}
              </div>
            ) : (
              <>
                <div className={styles.tierHero}>
                  <div className={styles.tierBadge} style={{ backgroundColor: tierInfo.color }}>
                    {tierInfo.name[0]}
                  </div>
                  <div>
                    <strong>{tierInfo.name} {getRomanNumeral(tierInfo.division)}</strong>
                    <p className={styles.softText}>
                      {tierInfo.name === 'Champion' ? `${tierInfo.lp} LP` : `${tierInfo.lp} / 100 LP`}
                    </p>
                    <p className={styles.softText}>현재 MMR {currentMmr}</p>
                  </div>
                </div>

                <div className={styles.summaryCard}>
                  <div className="form-label">상대 예상 전력</div>
                  <p className={styles.summaryLine}>평균 풀이 속도 기준: {opponentPreview?.baseTime.toFixed(2)}초</p>
                  <p className={styles.summaryLine}>예상 정답률: {((opponentPreview?.accuracy ?? 0) * 100).toFixed(0)}%</p>
                  <p className={styles.summaryLine}>예상 레이팅: {opponentPreview?.rating ?? 0}</p>
                </div>
              </>
            )}
          </GlassPanel>
        </div>
      </div>
    </div>
  )
}
