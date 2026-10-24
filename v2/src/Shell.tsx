import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BookOpenText, CalendarClock, Settings2, Sparkles } from 'lucide-react'
import { applyThemeMode, usePreferencesStore } from '@/features/preferences/preferencesStore'
import { useContextStore } from '@/features/learn/contextStore'
import { cleanupRemovedFeatureStorage } from '@/lib/cleanupRemovedFeatureStorage'
import { ConfirmProvider, ToastProvider } from '@v2/ui/primitives'

const NAV = [
  { to: '/', label: '학습', icon: Sparkles, end: true },
  { to: '/list', label: '단어', icon: BookOpenText, end: false },
  { to: '/learn/review', label: '복습', icon: CalendarClock, end: false },
  { to: '/settings', label: '설정', icon: Settings2, end: false },
] as const

export function Shell() {
  const location = useLocation()
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const [hydrated, setHydrated] = useState(false)
  const immersive = location.pathname === '/learn/session'

  useEffect(() => {
    let mounted = true
    void useContextStore.getState().hydrate().then(() => {
      if (mounted) setHydrated(true)
    })
    cleanupRemovedFeatureStorage()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    applyThemeMode(themeMode)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeMode === 'dark' ? '#121314' : '#F5F3EE')
  }, [themeMode])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="shell" data-immersive={immersive}>
          {!immersive && (
            <nav className="nav" aria-label="주 메뉴">
              <NavLink to="/" className="nav__brand" aria-label="여백의 말" lang="ja">
                余
              </NavLink>
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className="nav__item">
                  <span className="nav__icon">
                    <Icon size={20} />
                  </span>
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
          <main className="shell__main">{hydrated ? <Outlet /> : null}</main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}
