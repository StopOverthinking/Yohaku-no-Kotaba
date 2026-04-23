import { useRef } from 'react'
import { Heart, House, RotateCcw, Swords } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { getGameLabel, getModeLabel, getQuizTypeLabel, getRomanNumeral } from '@/features/game/gameEngine'
import { useGameStore } from '@/features/game/gameStore'
import { getWordById } from '@/features/vocab/model/selectors'
import styles from '@/features/game/game.module.css'

export function GameResultPage() {
  const navigate = useNavigate()
  const session = useGameStore((state) => state.session)
  const lastResult = useGameStore((state) => state.lastResult)
  const clearResult = useGameStore((state) => state.clearResult)
  const restartLastGame = useGameStore((state) => state.restartLastGame)
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite)
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds)
  const hadResultOnMountRef = useRef(lastResult !== null)

  if (!lastResult && !hadResultOnMountRef.current) {
    return <Navigate to={session ? '/game/session' : '/game'} replace />
  }

  if (!lastResult) {
    return null
  }

  const wrongWords = lastResult.wrongWordIds
    .map((wordId) => getWordById(wordId))
    .filter((word): word is NonNullable<typeof word> => word !== undefined)

  const handleCloseResult = (path: '/' | '/game') => {
    clearResult()
    navigate(path)
  }

  const handleReplay = () => {
    if (!restartLastGame()) {
      clearResult()
      navigate('/game')
      return
    }

    navigate('/game/session')
  }

  return (
    <div className={styles.root}>
      <GlassPanel className={styles.resultHero} padding="lg" variant="strong">
        <div>
          <p className="section-kicker">Result</p>
          <h1 className="section-title">{getGameLabel(lastResult.gameKind)} · {lastResult.setName}</h1>
          <p className="section-copy">
            {lastResult.gameKind === 'speed_quiz'
              ? `${getModeLabel(lastResult.mode)} · ${getQuizTypeLabel(lastResult.quizType)} 결과를 정리했습니다.`
              : '짝 맞추기 기록을 정리했습니다.'}
          </p>
        </div>

        {lastResult.gameKind === 'speed_quiz' ? (
          <>
            <div className="meta-grid">
              <GlassPanel className="meta-card" padding="sm">
                <span className="form-label">플레이어 점수</span>
                <strong>{lastResult.playerScore}</strong>
              </GlassPanel>
              <GlassPanel className="meta-card" padding="sm">
                <span className="form-label">정답 수</span>
                <strong>{lastResult.playerCorrectCount}/{lastResult.totalQuestions}</strong>
              </GlassPanel>
              <GlassPanel className="meta-card" padding="sm">
                <span className="form-label">평균 시간</span>
                <strong>{lastResult.averageTime.toFixed(2)}초</strong>
              </GlassPanel>
            </div>

            {lastResult.bot ? (
              <GlassPanel className={styles.recordsPanel} padding="lg">
                <div className={styles.tierHero}>
                  <div className={styles.tierBadge} style={{ backgroundColor: lastResult.bot.tierInfo.color }}>
                    {lastResult.bot.tierInfo.name[0]}
                  </div>
                  <div>
                    <p className="section-kicker">Versus</p>
                    <h2 className="page-header__title">
                      {lastResult.bot.outcome === 'win' ? '승리' : lastResult.bot.outcome === 'lose' ? '패배' : '무승부'}
                    </h2>
                    <p className={styles.softText}>
                      {lastResult.bot.name} {lastResult.bot.score}점
                      {lastResult.bot.surrendered ? ' · 상대 기권' : ''}
                    </p>
                  </div>
                </div>

                <div className="meta-grid">
                  <GlassPanel className="meta-card" padding="sm">
                    <span className="form-label">MMR 변화</span>
                    <strong>{lastResult.bot.mmrChange >= 0 ? '+' : ''}{lastResult.bot.mmrChange}</strong>
                  </GlassPanel>
                  <GlassPanel className="meta-card" padding="sm">
                    <span className="form-label">현재 티어</span>
                    <strong>
                      {lastResult.bot.tierInfo.name} {getRomanNumeral(lastResult.bot.tierInfo.division)}
                    </strong>
                  </GlassPanel>
                  <GlassPanel className="meta-card" padding="sm">
                    <span className="form-label">상대 레이팅</span>
                    <strong>{lastResult.bot.rating}</strong>
                  </GlassPanel>
                </div>
              </GlassPanel>
            ) : (
              <GlassPanel className={styles.recordsPanel} padding="lg">
                <p className="section-kicker">Records</p>
                <div className={styles.recordList}>
                  {lastResult.singleRecords.length > 0 ? lastResult.singleRecords.map((record, index) => (
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
              </GlassPanel>
            )}
          </>
        ) : (
          <>
            <div className="meta-grid">
              <GlassPanel className="meta-card" padding="sm">
                <span className="form-label">완료 시간</span>
                <strong>{lastResult.totalTime.toFixed(2)}초</strong>
              </GlassPanel>
              <GlassPanel className="meta-card" padding="sm">
                <span className="form-label">실수</span>
                <strong>{lastResult.wrongAttempts}</strong>
              </GlassPanel>
              <GlassPanel className="meta-card" padding="sm">
                <span className="form-label">패널티</span>
                <strong>+{lastResult.penaltySeconds}s</strong>
              </GlassPanel>
            </div>

            <GlassPanel className={styles.recordsPanel} padding="lg">
              <p className="section-kicker">Records</p>
              <div className={styles.recordList}>
                {lastResult.tapMatchRushRecords.length > 0 ? lastResult.tapMatchRushRecords.map((record, index) => (
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
            </GlassPanel>
          </>
        )}

        <GlassPanel className={styles.wrongPanel} padding="lg">
          <div className={styles.recordTop}>
            <div>
              <p className="section-kicker">Review</p>
              <h2 className="page-header__title">오답 복습</h2>
            </div>
            <Swords size={22} />
          </div>

          <div className={styles.wrongList}>
            {wrongWords.length > 0 ? wrongWords.map((word) => {
              const isFavorite = favoriteIds.includes(word.id)

              return (
                <div key={word.id} className={styles.wrongItem}>
                  <div className={styles.wrongTop}>
                    <div>
                      <div className={styles.wrongWord}>{word.japanese}</div>
                      <div className={styles.wrongReading}>{word.reading}</div>
                    </div>
                    <Tooltip label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}>
                      <span>
                        <IconButton
                          icon={Heart}
                          label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                          active={isFavorite}
                          onClick={() => toggleFavorite(word.id)}
                        />
                      </span>
                    </Tooltip>
                  </div>
                  <p className={styles.softText}>{word.meaning}</p>
                </div>
              )
            }) : <p className={styles.softText}>틀린 문제가 없었습니다.</p>}
          </div>
        </GlassPanel>

        <div className="action-row">
          <Tooltip label="홈으로 이동">
            <span>
              <IconButton icon={House} label="홈으로 이동" size="lg" onClick={() => handleCloseResult('/')} />
            </span>
          </Tooltip>
          <Tooltip label="게임 설정으로 이동">
            <span>
              <IconButton icon={Swords} label="게임 설정으로 이동" size="lg" onClick={() => handleCloseResult('/game')} />
            </span>
          </Tooltip>
          <Tooltip label="같은 조건으로 다시 하기">
            <span>
              <IconButton icon={RotateCcw} label="같은 조건으로 다시 하기" size="lg" onClick={handleReplay} />
            </span>
          </Tooltip>
        </div>
      </GlassPanel>
    </div>
  )
}
