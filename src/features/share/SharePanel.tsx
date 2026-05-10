import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Database,
  Download,
  FileUp,
  QrCode,
  ScanSearch,
  X,
} from 'lucide-react'
import { GlassPanel } from '@/components/GlassPanel'
import { IconButton } from '@/components/IconButton'
import {
  QR_SHARE_AUTOPLAY_MS,
  applyImportedBackup,
  buildQrShareFrames,
  createQrImportSession,
  createQrMarkup,
  decodeQrImportSession,
  downloadShareData,
  getQrImportReceivedCount,
  getShareDataText,
  isQrImportComplete,
  mergeQrImportFrame,
  parseQrTransferFrame,
  parseRestorePayload,
  type QrImportSession,
  type QrShareFrames,
} from '@/features/share/share'
import styles from '@/features/share/share.module.css'

type ShareStatus = {
  tone: 'success' | 'info' | 'error'
  message: string
}

type QrShareViewState = QrShareFrames & {
  title: string
  caption: string
  currentIndex: number
  svgFrames: string[]
}

type SharePanelProps = {
  mode?: 'panel' | 'submenu'
}

type BarcodeResultLike = {
  rawValue?: string
}

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<BarcodeResultLike[]>
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

type QrImportProgress = {
  received: number
  total: number
}

type QrFocusCapabilities = MediaTrackCapabilities & {
  focusMode?: string[]
}

type ConfirmDialogState = {
  title: string
  lines: string[]
  confirmLabel: string
  resolve: (confirmed: boolean) => void
}

type ShareAction = {
  id: string
  icon: typeof ClipboardCopy
  label: string
  ariaLabel: string
}

const appActions = [
  { id: 'app-copy', icon: ClipboardCopy, label: '클립보드로 복사', ariaLabel: '앱 클립보드로 복사' },
  { id: 'app-download', icon: Download, label: '파일로 저장', ariaLabel: '앱 파일로 저장' },
  { id: 'app-qr-export', icon: QrCode, label: 'QR로 내보내기', ariaLabel: '앱 QR로 내보내기' },
  { id: 'app-paste', icon: ClipboardPaste, label: '클립보드에서 불러오기', ariaLabel: '앱 클립보드에서 불러오기' },
  { id: 'app-import-file', icon: FileUp, label: '저장된 파일에서 불러오기', ariaLabel: '앱 저장된 파일에서 불러오기' },
  { id: 'app-qr-import', icon: ScanSearch, label: 'QR에서 불러오기', ariaLabel: '앱 QR에서 불러오기' },
] as const

async function configureQrImportTrack(track: MediaStreamTrack) {
  if (typeof track.applyConstraints !== 'function') {
    return
  }

  try {
    await track.applyConstraints({
      advanced: [
        { focusMode: 'continuous' },
        { focusMode: 'single-shot' },
      ],
    } as unknown as MediaTrackConstraints)
    return
  } catch {
    // Some browsers reject unsupported focus hints even inside advanced constraints.
  }

  const trackWithCapabilities = track as MediaStreamTrack & {
    getCapabilities?: () => QrFocusCapabilities
  }

  if (typeof trackWithCapabilities.getCapabilities !== 'function') {
    return
  }

  const capabilities = trackWithCapabilities.getCapabilities() as QrFocusCapabilities
  const preferredFocusMode =
    capabilities.focusMode?.includes('continuous')
      ? 'continuous'
      : capabilities.focusMode?.includes('single-shot')
        ? 'single-shot'
        : null

  if (!preferredFocusMode) {
    return
  }

  try {
    await track.applyConstraints({
      advanced: [{ focusMode: preferredFocusMode }],
    } as unknown as MediaTrackConstraints)
  } catch {
    // Focus remains device controlled when the browser refuses manual hints.
  }
}

export function SharePanel({ mode = 'panel' }: SharePanelProps) {
  const [status, setStatus] = useState<ShareStatus | null>(null)
  const [manualCopyText, setManualCopyText] = useState<string | null>(null)
  const [manualImportText, setManualImportText] = useState('')
  const [isManualImportOpen, setIsManualImportOpen] = useState(false)
  const [qrShare, setQrShare] = useState<QrShareViewState | null>(null)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const [isQrLoading, setIsQrLoading] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [isQrImportOpen, setIsQrImportOpen] = useState(false)
  const [qrImportStatus, setQrImportStatus] = useState('QR을 카메라 안에 맞춰 주세요.')
  const [qrImportError, setQrImportError] = useState<string | null>(null)
  const [qrImportProgress, setQrImportProgress] = useState<QrImportProgress | null>(null)
  const [pendingFileAction, setPendingFileAction] = useState<'app-import' | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const confirmDialogRef = useRef<ConfirmDialogState | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const qrImportVideoRef = useRef<HTMLVideoElement | null>(null)
  const qrImportDetectorRef = useRef<BarcodeDetectorLike | null>(null)
  const qrImportStreamRef = useRef<MediaStream | null>(null)
  const qrImportFrameRequestRef = useRef<number | null>(null)
  const qrImportLastScanAtRef = useRef(0)
  const qrImportSessionRef = useRef<QrImportSession | null>(null)
  const qrImportDecodingRef = useRef(false)

  useEffect(() => {
    if (!isQrOpen || !qrShare || qrShare.frames.length <= 1) {
      return
    }

    const intervalId = window.setInterval(() => {
      setQrShare((current) => {
        if (!current || current.frames.length <= 1) return current

        return {
          ...current,
          currentIndex: (current.currentIndex + 1) % current.frames.length,
        }
      })
    }, QR_SHARE_AUTOPLAY_MS)

    return () => window.clearInterval(intervalId)
  }, [isQrOpen, qrShare?.frames.length, qrShare?.sessionId])

  useEffect(() => {
    if (!isQrOpen && !manualCopyText && !isManualImportOpen && !isQrImportOpen && !confirmDialog) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (confirmDialog) {
        closeConfirmDialog(false)
        return
      }

      if (manualCopyText) {
        setManualCopyText(null)
        return
      }

      if (isManualImportOpen) {
        setIsManualImportOpen(false)
        return
      }

      if (isQrImportOpen) {
        handleCloseQrImport()
        return
      }

      handleCloseQr()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmDialog, isManualImportOpen, isQrImportOpen, isQrOpen, manualCopyText])

  useEffect(() => {
    confirmDialogRef.current = confirmDialog
  }, [confirmDialog])

  useEffect(() => {
    return () => {
      if (confirmDialogRef.current) {
        confirmDialogRef.current.resolve(false)
      }
      stopQrImportScanner()
    }
  }, [])

  useEffect(() => {
    if (!isQrImportOpen) {
      stopQrImportScanner()
      return
    }

    let cancelled = false

    async function startQrImport() {
      resetQrImportSession('카메라를 준비하고 있어요.')

      if (!navigator.mediaDevices?.getUserMedia) {
        setQrImportError('이 브라우저는 카메라 스캔을 지원하지 않아요.')
        setQrImportStatus('파일 가져오기를 사용해 주세요.')
        return
      }

      const DetectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
      if (!DetectorCtor) {
        setQrImportError('이 브라우저는 QR 감지를 지원하지 않아요.')
        setQrImportStatus('파일 가져오기를 사용해 주세요.')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        qrImportStreamRef.current = stream
        qrImportDetectorRef.current = new DetectorCtor({ formats: ['qr_code'] })
        const [videoTrack] = stream.getVideoTracks()
        if (videoTrack) {
          void configureQrImportTrack(videoTrack)
        }

        const video = qrImportVideoRef.current
        if (!video) {
          throw new Error('카메라 미리보기를 열지 못했어요.')
        }

        video.srcObject = stream
        await video.play()
        setQrImportStatus('QR을 카메라 안에 맞춰 주세요.')
        scheduleQrImportScan()
      } catch (error) {
        setQrImportError(error instanceof Error ? error.message : '카메라를 열지 못했어요.')
        setQrImportStatus('카메라 준비에 실패했어요.')
      }
    }

    void startQrImport()

    return () => {
      cancelled = true
      stopQrImportScanner()
    }
  }, [isQrImportOpen])

  function stopQrImportScanner() {
    if (qrImportFrameRequestRef.current !== null) {
      window.cancelAnimationFrame(qrImportFrameRequestRef.current)
      qrImportFrameRequestRef.current = null
    }

    if (qrImportStreamRef.current) {
      qrImportStreamRef.current.getTracks().forEach((track) => track.stop())
      qrImportStreamRef.current = null
    }

    if (qrImportVideoRef.current?.srcObject) {
      qrImportVideoRef.current.srcObject = null
    }

    qrImportDetectorRef.current = null
    qrImportSessionRef.current = null
    qrImportLastScanAtRef.current = 0
    qrImportDecodingRef.current = false
  }

  function resetQrImportSession(message = 'QR을 카메라 안에 맞춰 주세요.') {
    qrImportSessionRef.current = null
    qrImportLastScanAtRef.current = 0
    qrImportDecodingRef.current = false
    setQrImportError(null)
    setQrImportProgress(null)
    setQrImportStatus(message)
  }

  function closeConfirmDialog(confirmed: boolean) {
    setConfirmDialog((current) => {
      if (!current) return current
      current.resolve(confirmed)
      return null
    })
  }

  function requestConfirm(title: string, lines: string[], confirmLabel: string) {
    return new Promise<boolean>((resolve) => {
      setConfirmDialog({ title, lines, confirmLabel, resolve })
    })
  }

  function scheduleQrImportScan() {
    if (qrImportFrameRequestRef.current !== null) {
      return
    }

    qrImportFrameRequestRef.current = window.requestAnimationFrame(() => {
      qrImportFrameRequestRef.current = null
      void scanQrFrame()
    })
  }

  async function scanQrFrame() {
    if (!isQrImportOpen || qrImportDecodingRef.current) return

    const detector = qrImportDetectorRef.current
    const video = qrImportVideoRef.current
    if (!detector || !video) return

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      scheduleQrImportScan()
      return
    }

    const now = performance.now()
    if (now - qrImportLastScanAtRef.current < 240) {
      scheduleQrImportScan()
      return
    }

    qrImportLastScanAtRef.current = now

    try {
      const barcodes = await detector.detect(video)
      for (const barcode of barcodes) {
        if (typeof barcode.rawValue === 'string') {
          await processQrImportFrame(barcode.rawValue)
        }
      }
    } catch {
      // Ignore detector misses and keep scanning.
    }

    if (isQrImportOpen && !qrImportDecodingRef.current) {
      scheduleQrImportScan()
    }
  }

  async function processQrImportFrame(rawValue: string) {
    const frame = parseQrTransferFrame(rawValue)
    if (!frame) return

    const currentSession = qrImportSessionRef.current
    const nextSession = currentSession
      ? mergeQrImportFrame(currentSession, frame)
      : createQrImportSession(frame)

    if (!nextSession) {
      setQrImportError('다른 QR 세션이 섞였어요. 다시 스캔해 주세요.')
      return
    }

    qrImportSessionRef.current = nextSession
    setQrImportError(null)
    setQrImportProgress({
      received: getQrImportReceivedCount(nextSession),
      total: nextSession.total,
    })
    setQrImportStatus(`${getQrImportReceivedCount(nextSession)} / ${nextSession.total}`)

    if (!isQrImportComplete(nextSession) || qrImportDecodingRef.current) {
      return
    }

    qrImportDecodingRef.current = true
    setQrImportStatus('QR을 복원하고 있어요.')

    try {
      const text = await decodeQrImportSession(nextSession)
      const restored = await handleAppRestoreText(text, 'QR')

      if (!restored) {
        qrImportDecodingRef.current = false
        setQrImportStatus('복원이 취소됐어요.')
      }
    } catch (error) {
      qrImportDecodingRef.current = false
      setQrImportError(error instanceof Error ? error.message : 'QR을 복원하지 못했어요.')
      setQrImportStatus('QR을 복원하지 못했어요.')
    }
  }

  async function openQrShare(title: string, caption: string, text: string) {
    setIsQrOpen(true)
    setIsQrLoading(true)
    setQrError(null)
    setQrShare(null)

    try {
      const frames = await buildQrShareFrames(text)
      const svgFrames = await Promise.all(frames.frames.map((frame) => createQrMarkup(frame)))

      setQrShare({
        ...frames,
        title,
        caption,
        currentIndex: 0,
        svgFrames,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'QR을 준비하지 못했어요.'
      setQrError(message)
      setStatus({
        tone: 'error',
        message,
      })
    } finally {
      setIsQrLoading(false)
    }
  }

  async function handleAppRestoreText(rawText: string, sourceLabel: string) {
    const parsed = parseRestorePayload(rawText)
    if (!parsed.ok) {
      setStatus({ tone: 'error', message: parsed.error })
      return false
    }

    const details = [`${sourceLabel}에서 ${parsed.keyCount}개 항목을 복원할까요?`, '현재 앱 백업이 교체됩니다.']

    if (parsed.metadata.app) {
      details.push(`출처: ${parsed.metadata.app}`)
    }

    if (parsed.metadata.exportedAt) {
      details.push(`시간: ${new Date(parsed.metadata.exportedAt).toLocaleString()}`)
    }

    const confirmed = await requestConfirm('앱 복원', details, '복원')
    if (!confirmed) {
      setStatus({ tone: 'info', message: '앱 백업 복원을 취소했어요.' })
      return false
    }

    applyImportedBackup(parsed.data)
    window.location.reload()
    return true
  }

  const handleAppCopy = async () => {
    const dataText = getShareDataText()

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable.')
      }

      await navigator.clipboard.writeText(dataText)
      setStatus({ tone: 'success', message: '앱 백업을 복사했어요.' })
    } catch {
      setManualCopyText(dataText)
      setStatus({ tone: 'info', message: '수동 복사 창을 열었어요.' })
    }
  }

  const handleAppDownload = () => {
    downloadShareData(getShareDataText())
    setStatus({ tone: 'success', message: '앱 백업 파일을 저장했어요.' })
  }

  const handleAppQrExport = async () => {
    await openQrShare('앱 백업 QR', '앱 백업을 다른 기기로 옮길 수 있어요.', getShareDataText())
    setStatus({ tone: 'success', message: '앱 QR을 준비했어요.' })
  }

  const handleAppClipboardImport = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error('Clipboard read is unavailable.')
      }

      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setStatus({ tone: 'error', message: '클립보드가 비어 있어요.' })
        return
      }

      await handleAppRestoreText(text, '클립보드')
    } catch {
      setManualImportText('')
      setIsManualImportOpen(true)
      setStatus({ tone: 'info', message: '수동 붙여넣기 창을 열었어요.' })
    }
  }

  const handleImportFileClick = () => {
    setPendingFileAction('app-import')
    fileInputRef.current?.click()
  }

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const action = pendingFileAction
    event.target.value = ''
    setPendingFileAction(null)
    if (!file || !action) return

    try {
      const text = await file.text()
      await handleAppRestoreText(text, file.name)
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : '파일을 읽지 못했어요.',
      })
    }
  }

  const handleCloseQr = () => {
    setIsQrOpen(false)
    setQrShare(null)
    setQrError(null)
  }

  const handleCloseQrImport = () => {
    stopQrImportScanner()
    setIsQrImportOpen(false)
    setQrImportError(null)
    setQrImportProgress(null)
    setQrImportStatus('QR을 카메라 안에 맞춰 주세요.')
  }

  const handleShiftFrame = (delta: number) => {
    setQrShare((current) => {
      if (!current) return current

      return {
        ...current,
        currentIndex: (current.currentIndex + delta + current.frames.length) % current.frames.length,
      }
    })
  }

  const handleManualImportSubmit = async () => {
    if (!manualImportText.trim()) {
      setStatus({ tone: 'error', message: '붙여넣을 내용이 없어요.' })
      return
    }

    await handleAppRestoreText(manualImportText, '붙여넣기')
  }

  function renderActionGrid(actions: ReadonlyArray<ShareAction>, compact: boolean) {
    return (
      <div className={compact ? styles.submenuGrid : styles.cardGrid}>
        {actions.map((action) => {
          const Icon = action.icon

          const onClick = async () => {
            if (action.id === 'app-copy') return handleAppCopy()
            if (action.id === 'app-download') return handleAppDownload()
            if (action.id === 'app-qr-export') return handleAppQrExport()
            if (action.id === 'app-paste') return handleAppClipboardImport()
            if (action.id === 'app-import-file') return handleImportFileClick()
            if (action.id === 'app-qr-import') return setIsQrImportOpen(true)
          }

          return (
            <button
              key={action.id}
              type="button"
              aria-label={action.ariaLabel}
              className={compact ? styles.submenuButton : styles.shareCard}
              onClick={() => void onClick()}
            >
              <span className={compact ? styles.submenuIcon : styles.shareIcon}>
                <Icon size={compact ? 20 : 24} strokeWidth={1.9} />
              </span>
              <strong className={compact ? styles.submenuLabel : styles.shareLabel}>{action.label}</strong>
            </button>
          )
        })}
      </div>
    )
  }

  const compact = mode === 'submenu'
  const qrImportCountLabel = qrImportProgress
    ? `${qrImportProgress.received} / ${qrImportProgress.total}`
    : '대기'

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => void handleImportFileChange(event)}
      />

      <GlassPanel className={compact ? styles.submenu : styles.panel} padding={compact ? 'md' : 'lg'} variant={compact ? 'floating' : 'strong'}>
        <div className={compact ? styles.submenuHeader : styles.header}>
          <div>
            <p className="section-kicker">Share</p>
            <h2 className="page-header__title">백업</h2>
          </div>
        </div>

        <div className={styles.sectionGroup}>
          <section className={styles.sectionBlock}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionBadge}>
                  <Database size={18} />
                </span>
                <div>
                  <strong>앱</strong>
                  <p>설정, 즐겨찾기</p>
                </div>
              </div>
            </div>
            {renderActionGrid(appActions, compact)}
          </section>
        </div>

        {status ? (
          <p className={styles.status} data-tone={status.tone}>
            {status.message}
          </p>
        ) : null}
      </GlassPanel>

      {isQrOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="qr-share-title" onClick={handleCloseQr}>
          <GlassPanel className={styles.modal} padding="lg" variant="strong" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className="section-kicker">QR</p>
                <h2 id="qr-share-title" className="page-header__title">{qrShare?.title ?? 'QR'}</h2>
                <p className="page-header__caption">{qrShare?.caption}</p>
              </div>
              <IconButton icon={X} label="QR 닫기" onClick={handleCloseQr} />
            </div>

            {isQrLoading ? (
              <div className={styles.qrLoading}>
                <p>QR을 준비하고 있어요.</p>
              </div>
            ) : qrError ? (
              <div className={styles.qrLoading}>
                <p>{qrError}</p>
              </div>
            ) : qrShare ? (
              <>
                <div className={styles.qrFrame}>
                  <div
                    className={styles.qrSvg}
                    aria-label="공유 QR"
                    dangerouslySetInnerHTML={{ __html: qrShare.svgFrames[qrShare.currentIndex] ?? '' }}
                  />
                </div>
                <div className={styles.qrMeta}>
                  <span className="miniChip">
                    {qrShare.currentIndex + 1} / {qrShare.frames.length}
                  </span>
                  <span className="miniChip">
                    {qrShare.encoding === 'gzip' ? 'gzip' : 'plain'} · {qrShare.rawBytes}B {'->'} {qrShare.encodedBytes}B
                  </span>
                </div>
                <p className={styles.qrCaption}>
                  {qrShare.frames.length > 1 ? '여러 장이면 자동으로 넘어갑니다.' : '한 장짜리 QR이에요.'}
                </p>
                <div className={styles.modalActions}>
                  <IconButton
                    icon={ChevronLeft}
                    label="이전 QR"
                    onClick={() => handleShiftFrame(-1)}
                    disabled={qrShare.frames.length <= 1}
                  />
                  <IconButton
                    icon={ChevronRight}
                    label="다음 QR"
                    onClick={() => handleShiftFrame(1)}
                    disabled={qrShare.frames.length <= 1}
                  />
                </div>
              </>
            ) : null}
          </GlassPanel>
        </div>
      ) : null}

      {isQrImportOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="qr-import-title" onClick={handleCloseQrImport}>
          <GlassPanel className={styles.modal} padding="lg" variant="strong" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className="section-kicker">QR</p>
                <h2 id="qr-import-title" className="page-header__title">앱 복원</h2>
                <p className="page-header__caption">카메라로 QR을 읽습니다.</p>
              </div>
              <IconButton icon={X} label="QR 가져오기 닫기" onClick={handleCloseQrImport} />
            </div>

            <div className={styles.qrImportLayout}>
              <div className={styles.qrImportStatusCard}>
                <div className={styles.qrImportMeta}>
                  <span className="miniChip">앱</span>
                  <span className="miniChip">{qrImportCountLabel}</span>
                </div>

                <p className={styles.status} data-tone={qrImportError ? 'error' : 'info'}>
                  {qrImportError ?? qrImportStatus}
                </p>

                {qrImportProgress ? (
                  <div className={styles.progressGrid}>
                    {Array.from({ length: qrImportProgress.total }, (_, index) => (
                      <span
                        key={`qr-progress-${index + 1}`}
                        className={styles.progressChip}
                        data-complete={index < qrImportProgress.received}
                      >
                        {index + 1}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={styles.videoFrame}>
                <video ref={qrImportVideoRef} className={styles.video} playsInline muted autoPlay />
              </div>
            </div>

            <div className={styles.modalButtonRow}>
              <button
                type="button"
                className="pill"
                onClick={() => {
                  resetQrImportSession()
                  scheduleQrImportScan()
                }}
              >
                다시
              </button>
              <button type="button" className="pill" onClick={handleCloseQrImport}>
                닫기
              </button>
            </div>
          </GlassPanel>
        </div>
      ) : null}

      {manualCopyText ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="manual-copy-title" onClick={() => setManualCopyText(null)}>
          <GlassPanel className={styles.modal} padding="lg" variant="strong" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className="section-kicker">Copy</p>
                <h2 id="manual-copy-title" className="page-header__title">수동 복사</h2>
                <p className="page-header__caption">전체 텍스트를 그대로 복사해 주세요.</p>
              </div>
              <IconButton icon={X} label="수동 복사 닫기" onClick={() => setManualCopyText(null)} />
            </div>

            <textarea
              className={styles.textarea}
              readOnly
              value={manualCopyText}
              onFocus={(event) => event.currentTarget.select()}
            />
          </GlassPanel>
        </div>
      ) : null}

      {isManualImportOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="manual-import-title" onClick={() => setIsManualImportOpen(false)}>
          <GlassPanel className={styles.modal} padding="lg" variant="strong" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className="section-kicker">Paste</p>
                <h2 id="manual-import-title" className="page-header__title">앱 복원</h2>
                <p className="page-header__caption">백업 JSON을 붙여넣어 주세요.</p>
              </div>
              <IconButton icon={X} label="수동 가져오기 닫기" onClick={() => setIsManualImportOpen(false)} />
            </div>

            <textarea
              className={styles.textarea}
              value={manualImportText}
              onChange={(event) => setManualImportText(event.target.value)}
              placeholder="백업 JSON"
            />

            <div className={styles.modalButtonRow}>
              <button type="button" className="pill" onClick={() => void handleManualImportSubmit()}>
                복원
              </button>
              <button type="button" className="pill" onClick={() => setIsManualImportOpen(false)}>
                취소
              </button>
            </div>
          </GlassPanel>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="share-confirm-title" onClick={() => closeConfirmDialog(false)}>
          <GlassPanel className={styles.modal} padding="lg" variant="strong" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className="section-kicker">Confirm</p>
                <h2 id="share-confirm-title" className="page-header__title">{confirmDialog.title}</h2>
              </div>
              <IconButton icon={X} label="확인 팝업 닫기" onClick={() => closeConfirmDialog(false)} />
            </div>

            <div className={styles.confirmBody}>
              {confirmDialog.lines.map((line, index) => (
                <p key={`confirm-line-${index}`} className="page-header__caption">{line}</p>
              ))}
            </div>

            <div className={styles.modalButtonRow}>
              <button type="button" className="pill" onClick={() => closeConfirmDialog(false)}>
                취소
              </button>
              <button type="button" className={`pill ${styles.confirmButton}`} onClick={() => closeConfirmDialog(true)}>
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </GlassPanel>
        </div>
      ) : null}
    </>
  )
}
