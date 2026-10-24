import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Minus, Plus, X } from 'lucide-react'

type IconButtonProps = {
  icon: LucideIcon
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  tone?: 'danger'
  size?: 'sm' | 'md'
  solid?: boolean
  iconSize?: number
}

export function IconButton({ icon: Icon, label, onClick, active, disabled, tone, size = 'md', solid, iconSize }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn${size === 'sm' ? ' icon-btn--sm' : ''}${solid ? ' icon-btn--solid' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      data-active={active || undefined}
      data-tone={tone}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={iconSize ?? (size === 'sm' ? 18 : 20)} strokeWidth={1.9} />
    </button>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  )
}

type StepperProps = {
  value: number
  min: number
  max?: number
  step?: number
  label: string
  onChange: (next: number) => void
}

export function Stepper({ value, min, max, step = 1, label, onChange }: StepperProps) {
  const [draft, setDraft] = useState(String(value))
  const editing = useRef(false)
  useEffect(() => {
    if (!editing.current) setDraft(String(value))
  }, [value])
  const clamp = (next: number) => Math.max(min, max === undefined ? next : Math.min(max, next))
  return (
    <div className="stepper">
      <button type="button" aria-label={`${label} 줄이기`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        <Minus size={20} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={draft}
        min={min}
        max={max}
        onFocus={(event) => {
          editing.current = true
          event.currentTarget.select()
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          const parsed = Math.floor(Number(event.target.value))
          if (event.target.value !== '' && Number.isFinite(parsed)) onChange(clamp(parsed))
        }}
        onBlur={() => {
          editing.current = false
          const parsed = Math.floor(Number(draft))
          const committed = Number.isFinite(parsed) && draft !== '' ? clamp(parsed) : value
          onChange(committed)
          setDraft(String(committed))
        }}
      />
      <button type="button" aria-label={`${label} 늘리기`} disabled={max !== undefined && value >= max} onClick={() => onChange(clamp(value + step))}>
        <Plus size={20} />
      </button>
    </div>
  )
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
}

/**
 * Overlays render into <body> so no transformed ancestor (page animation, swipe card)
 * can become their containing block, and the page behind them stops scrolling.
 */
let scrollLocks = 0
function OverlayPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    if (scrollLocks++ === 0) {
      root.style.setProperty('--scrollbar-gap', `${window.innerWidth - root.clientWidth}px`)
      root.dataset.scrollLocked = 'true'
    }
    return () => {
      if (--scrollLocks === 0) {
        delete root.dataset.scrollLocked
        root.style.removeProperty('--scrollbar-gap')
      }
    }
  }, [])
  return createPortal(children, document.body)
}

export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEscape(onClose)
  return (
    <OverlayPortal>
    <div className="overlay" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="sheet__grip" />
        <header className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          {actions}
          <IconButton icon={X} label="닫기" size="sm" onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
    </OverlayPortal>
  )
}

export type ConfirmOptions = {
  title: string
  body?: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'default'
}

type ConfirmProps = ConfirmOptions & {
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ title, body, confirmLabel, tone = 'danger', busy, error, onCancel, onConfirm }: ConfirmProps) {
  useEscape(onCancel)
  return (
    <OverlayPortal>
    <div className="overlay" data-center="true" onClick={busy ? undefined : onCancel}>
      <section className="dialog" role="alertdialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        {tone === 'danger' && (
          <span className="dialog__icon">
            <AlertTriangle size={22} />
          </span>
        )}
        <h2 className="dialog__title">{title}</h2>
        {body && <div className="dialog__body">{body}</div>}
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button type="button" className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm} disabled={busy} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
    </OverlayPortal>
  )
}

/** Promise-based confirm so callers read like window.confirm without the browser popup. */
type Pending = ConfirmOptions & { resolve: (value: boolean) => void }
const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), [])
  const close = (value: boolean) => {
    pending?.resolve(value)
    setPending(null)
  }
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && <ConfirmDialog {...pending} onCancel={() => close(false)} onConfirm={() => close(true)} />}
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)

type Toast = { id: number; message: string; tone: 'info' | 'error' }
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const show = useCallback((message: string, tone: Toast['tone'] = 'info') => setToast({ id: Date.now(), message, tone }), [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div key={toast.id} className="toast" data-tone={toast.tone} role="status">
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
