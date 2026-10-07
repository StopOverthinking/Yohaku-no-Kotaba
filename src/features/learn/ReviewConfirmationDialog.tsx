import { useEffect, useId, useRef, type ReactNode } from 'react'
import { GlassPanel } from '@/components/GlassPanel'
import styles from './progress.module.css'

type Props = {
  title: string; description: ReactNode; confirmLabel: string
  busy: boolean; error: string | null; onCancel: () => void; onConfirm: () => void
}

export function ReviewConfirmationDialog({ title, description, confirmLabel, busy, error, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const dialog = dialogRef.current!
    const previousFocus = document.activeElement as HTMLElement | null
    dialog.showModal()
    cancelRef.current?.focus()
    return () => {
      dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])
  return (
    <dialog ref={dialogRef} className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}
      onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const first = buttons[0], last = buttons.at(-1)
        if (!first) { event.preventDefault(); return }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}
      onClick={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <GlassPanel variant="floating" padding="lg">
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {error && <p role="alert">{error}</p>}
        <div className={styles.confirmActions}>
          <button ref={cancelRef} type="button" className="pill" disabled={busy} onClick={onCancel}>취소</button>
          <button type="button" className="pill" data-tone="danger" disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </GlassPanel>
    </dialog>
  )
}
