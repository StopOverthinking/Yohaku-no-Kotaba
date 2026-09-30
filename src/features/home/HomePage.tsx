import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, FolderTree, Info, MoonStar, RotateCcw, Sparkles, SunMedium, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import { VocabularySetMenu } from '@/features/list/VocabularySetMenu'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { SharePanel } from '@/features/share/SharePanel'
import { useShouldReduceEffects } from '@/lib/useShouldReduceEffects'
import styles from '@/features/home/home.module.css'
import { useContextStore } from '@/features/learn/contextStore'

const COMPACT_HOME_MEDIA_QUERY = '(max-width: 720px)'

function getCompactHomeLayoutMatch() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(COMPACT_HOME_MEDIA_QUERY).matches
}

export function HomePage() {
  const navigate = useNavigate()
  const contextSession = useContextStore((state) => state.data.session)
  const discardContext = useContextStore((state) => state.discard)
  const contextError = useContextStore((state) => state.error)
  const contextBusy = useContextStore((state) => state.busy)
  const sessionRecord = contextSession
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const toggleThemeMode = usePreferencesStore((state) => state.toggleThemeMode)
  const shouldReduceEffects = useShouldReduceEffects()
  const [isCompactHomeLayout, setIsCompactHomeLayout] = useState(getCompactHomeLayoutMatch)
  const [openMenu, setOpenMenu] = useState<'vocabulary' | 'share' | null>(null)
  const nextThemeLabel = themeMode === 'dark' ? '라이트 모드' : '다크 모드'
  const themeToggleLabel = `${nextThemeLabel}로 전환`
  const ThemeIcon = themeMode === 'dark' ? SunMedium : MoonStar
  const menuCardMotionProps = shouldReduceEffects
    ? {
        whileHover: undefined,
        whileTap: { scale: 0.99 },
        transition: { duration: 0.12 },
      }
    : {
        whileHover: { y: -2 },
        whileTap: { scale: 0.98 },
        transition: { duration: 0.16 },
      }
  const submenuMotionProps = shouldReduceEffects
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12, ease: 'linear' as const },
      }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.16, ease: 'easeOut' as const },
      }

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia(COMPACT_HOME_MEDIA_QUERY)
    const update = () => setIsCompactHomeLayout(mediaQuery.matches)

    update()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update)
      return () => mediaQuery.removeEventListener('change', update)
    }

    mediaQuery.addListener(update)
    return () => mediaQuery.removeListener(update)
  }, [])

  const handleDiscardLearnSession = () => {
    if (!window.confirm('남은 학습을 닫을까요? 이미 학습한 기록은 유지됩니다.')) {
      return
    }

    discardContext()
  }

  const renderOpenMenuPanel = (menu: 'vocabulary' | 'share') => {
    if (openMenu !== menu) {
      return null
    }

    if (menu === 'vocabulary') {
      return (
        <motion.div className={styles.submenuWrap} data-submenu-for="vocabulary" {...submenuMotionProps}>
          <GlassPanel className={styles.submenuPanel} padding="md" variant="floating">
            <div className={styles.submenuHeader}>
              <div>
                <p className="section-kicker">단어장</p>
                <h2 className="page-header__title">단어장 선택</h2>
              </div>
              <p className="page-header__caption">보고 싶은 단어장을 고르면 바로 목록 화면으로 이동해요.</p>
            </div>

            <VocabularySetMenu />
          </GlassPanel>
        </motion.div>
      )
    }

    return (
      <motion.div className={styles.submenuWrap} data-submenu-for="share" {...submenuMotionProps}>
        <SharePanel mode="submenu" />
      </motion.div>
    )
  }

  return (
    <div className={styles.root}>
      {contextError && <p role="alert">{contextError}</p>}
      {sessionRecord ? (
        <GlassPanel className={styles.resumeBanner} variant="floating">
          <div>
            <p className="section-kicker">이어하기</p>
            <h2 className="page-header__title">이전에 진행하던 학습 세션이 남아 있어요.</h2>
            <p className="page-header__caption">
              {sessionRecord.round}회차 · {`${sessionRecord.cards.length}/${sessionRecord.targetCount}`}
            </p>
          </div>
          <div className={styles.resumeActions}>
            <Tooltip label="학습 이어하기">
              <span>
                <IconButton
                  icon={RotateCcw}
                  label="학습 이어하기"
                  size="lg"
                  onClick={() => navigate('/learn/session')}
                />
              </span>
            </Tooltip>
            <Tooltip label="학습 파기">
              <span>
                <IconButton
                  icon={X}
                  label="학습 파기"
                  disabled={contextBusy}
                  tone="danger"
                  size="lg"
                  onClick={handleDiscardLearnSession}
                />
              </span>
            </Tooltip>
          </div>
        </GlassPanel>
      ) : null}

      <GlassPanel className={styles.hero} padding="lg" variant="strong">
        <div className={styles.heroTop}>
          <div className={styles.heroTitle}>
            <h1 className="section-title">여백의 말</h1>
          </div>
          <Tooltip label={themeToggleLabel}>
            <button
              type="button"
              className={styles.themeToggle}
              aria-label={themeToggleLabel}
              onClick={toggleThemeMode}
            >
              <ThemeIcon size={18} />
              <span>{nextThemeLabel}</span>
            </button>
          </Tooltip>
        </div>

        <div className={styles.heroActions}>
          <motion.button
            type="button"
            className={`glass-panel glass-padding-lg ${styles.actionCard}`}
            data-menu="vocabulary"
            data-active={openMenu === 'vocabulary'}
            {...menuCardMotionProps}
            onClick={() => setOpenMenu((value) => (value === 'vocabulary' ? null : 'vocabulary'))}
          >
            <div className={styles.actionMeta}>
              <span className={styles.actionIcon}>
                <BookOpen size={28} />
              </span>
              <h2 className="page-header__title">목록</h2>
            </div>
          </motion.button>
          {isCompactHomeLayout ? (
            <AnimatePresence initial={false}>{renderOpenMenuPanel('vocabulary')}</AnimatePresence>
          ) : null}

          <motion.button
            type="button"
            className={`glass-panel glass-padding-lg ${styles.actionCard}`}
            data-menu="learn"
            {...menuCardMotionProps}
            onClick={() => navigate('/learn')}
          >
            <div className={styles.actionMeta}>
              <span className={styles.actionIcon}>
                <Sparkles size={28} />
              </span>
              <h2 className="page-header__title">학습</h2>
            </div>
          </motion.button>

          <motion.button
            type="button"
            className={`glass-panel glass-padding-lg ${styles.actionCard}`}
            data-menu="share"
            data-active={openMenu === 'share'}
            {...menuCardMotionProps}
            onClick={() => setOpenMenu((value) => (value === 'share' ? null : 'share'))}
          >
            <div className={styles.actionMeta}>
              <span className={styles.actionIcon}>
                <FolderTree size={28} />
              </span>
              <h2 className="page-header__title">공유</h2>
              <p className={styles.actionCaption}>클립보드, JSON, QR</p>
            </div>
          </motion.button>
          {isCompactHomeLayout ? (
            <AnimatePresence initial={false}>{renderOpenMenuPanel('share')}</AnimatePresence>
          ) : null}
        </div>

        {!isCompactHomeLayout ? (
          <AnimatePresence initial={false}>{openMenu ? renderOpenMenuPanel(openMenu) : null}</AnimatePresence>
        ) : null}
      </GlassPanel>
      <Tooltip label="단어 데이터 출처">
        <a className={styles.sourcesLink} href={`${import.meta.env.BASE_URL}sources.html`} aria-label="단어 데이터 출처">
          <Info size={18} />
        </a>
      </Tooltip>
    </div>
  )
}
