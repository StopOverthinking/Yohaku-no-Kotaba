import { Heart, House, X } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import styles from '@/features/exam/exam.module.css'
import { useExamStore } from '@/features/exam/examStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { getStudyItemAnswerSubtext, getStudyItemAnswerText, getStudyItemById, getStudyItemFavoriteWordIds, getStudyItemQuestionText } from '@/features/vocab/model/selectors'

export function ExamResultPage() {
  const navigate = useNavigate()
  const lastResult = useExamStore((state) => state.lastResult)
  const clearResult = useExamStore((state) => state.clearResult)
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite)
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds)

  if (!lastResult) {
    return <Navigate to="/exam" replace />
  }

  const wrongItems = lastResult.wrongItems
    .map((item) => {
      const studyItem = getStudyItemById(item.itemId)
      return studyItem ? { ...item, studyItem } : null
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  const unresolvedWrongCount = Math.max(0, lastResult.wrongItems.length - wrongItems.length)
  const handleClearResult = () => {
    clearResult()
    navigate('/', { replace: true })
  }

  return (
    <div className={styles.root}>
      <GlassPanel className={styles.resultHero} padding="lg" variant="strong">
        <div>
          <p className="section-kicker">Result</p>
          <h1 className="section-title">{lastResult.setName} 시험 결과</h1>
          <p className="section-copy">
            {lastResult.gradingMode === 'manual' ? '직접 채점' : '자동 채점'}으로 {lastResult.totalQuestions}문제를 확인했습니다.
          </p>
        </div>

        <div className="meta-grid">
          <GlassPanel className="meta-card" padding="sm">
            <span className="form-label">점수</span>
            <strong>{lastResult.correctCount} / {lastResult.totalQuestions}</strong>
          </GlassPanel>
          <GlassPanel className="meta-card" padding="sm">
            <span className="form-label">오답 수</span>
            <strong>{lastResult.wrongItems.length}</strong>
          </GlassPanel>
          <GlassPanel className="meta-card" padding="sm">
            <span className="form-label">채점 방식</span>
            <strong>{lastResult.gradingMode === 'manual' ? '직접' : '자동'}</strong>
          </GlassPanel>
        </div>

        <GlassPanel className={styles.reviewPanel} padding="lg">
          <div>
            <p className="section-kicker">Review</p>
            <h2 className="page-header__title">오답 노트</h2>
          </div>

          {wrongItems.length > 0 ? (
            <div className={styles.wrongList}>
              {wrongItems.map((item) => {
                const favoriteWordId = getStudyItemFavoriteWordIds(item.studyItem)[0] ?? null
                const isFavorite = favoriteWordId ? favoriteIds.includes(favoriteWordId) : false

                return (
                  <GlassPanel key={item.itemId} className={styles.wrongItem} padding="sm">
                    <div className={styles.wrongHeader}>
                      <div>
                        <p className={styles.wrongMeaning}>문제: {getStudyItemQuestionText(item.studyItem)}</p>
                        <p className={styles.correctAnswer}>
                          정답: <strong>{getStudyItemAnswerText(item.studyItem)}</strong> ({getStudyItemAnswerSubtext(item.studyItem)})
                        </p>
                      </div>
                      {favoriteWordId ? (
                        <Tooltip label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}>
                          <span>
                            <IconButton
                              icon={Heart}
                              label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                              active={isFavorite}
                              onClick={() => toggleFavorite(favoriteWordId)}
                            />
                          </span>
                        </Tooltip>
                      ) : null}
                    </div>
                    {lastResult.gradingMode === 'auto' ? (
                      <p className={styles.wrongAnswer}>내 답안: {item.userAnswer || '(미입력)'}</p>
                    ) : null}
                  </GlassPanel>
                )
              })}
              {unresolvedWrongCount > 0 ? (
                <GlassPanel className={styles.wrongItem} padding="sm">
                  <p className={styles.wrongMeaning}>현재 단어장과 연결되지 않은 오답 {unresolvedWrongCount}개</p>
                </GlassPanel>
              ) : null}
            </div>
          ) : unresolvedWrongCount > 0 ? (
            <GlassPanel className={styles.wrongItem} padding="sm">
              <p className={styles.wrongMeaning}>현재 단어장과 연결되지 않은 오답 {unresolvedWrongCount}개</p>
            </GlassPanel>
          ) : (
            <p className={styles.perfectScore}>완벽합니다. 모든 문제를 맞혔습니다.</p>
          )}
        </GlassPanel>

        <div className="action-row">
          <Tooltip label="홈으로 가기">
            <span>
              <IconButton icon={House} label="홈으로 가기" size="lg" onClick={() => navigate('/')} />
            </span>
          </Tooltip>
          <Tooltip label="시험 기록 삭제">
            <span>
              <IconButton icon={X} label="시험 기록 삭제" tone="danger" size="lg" onClick={handleClearResult} />
            </span>
          </Tooltip>
        </div>
      </GlassPanel>
    </div>
  )
}
