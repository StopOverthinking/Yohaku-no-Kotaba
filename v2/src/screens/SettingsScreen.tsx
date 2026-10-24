import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight, ClipboardCopy, ClipboardPaste, Download, ExternalLink, FileUp, MoonStar, Pause, Play, QrCode, ScanLine, SunMedium } from 'lucide-react'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { getAppBackupText, restoreAppBackup } from '@/features/share/appBackup'
import {
  QR_SHARE_AUTOPLAY_MS,
  buildQrShareFrames,
  createQrImportSession,
  createQrMarkup,
  decodeQrImportSession,
  downloadShareData,
  getQrImportReceivedCount,
  isQrImportComplete,
  mergeQrImportFrame,
  parseQrTransferFrame,
  parseRestorePayload,
  type QrImportSession,
} from '@/features/share/share'
import { Sheet, useConfirm, useToast } from '@v2/ui/primitives'
import '@v2/styles/settings.css'

type QrState = { frames: string[]; svgs: string[]; index: number }

export function SettingsScreen() {
  const themeMode = usePreferencesStore((s) => s.themeMode)
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode)
  const toast = useToast()
  const confirm = useConfirm()
  const fileInput = useRef<HTMLInputElement>(null)
  const [qr, setQr] = useState<QrState | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [manual, setManual] = useState<{ mode: 'copy' | 'paste'; text: string } | null>(null)

  async function restoreFromText(raw: string, source: string) {
    const parsed = parseRestorePayload(raw)
    if (!parsed.ok) {
      toast(parsed.error, 'error')
      return false
    }
    const details = [`${source} · ${parsed.keyCount}개 항목`, '현재 기록이 백업으로 교체됩니다.']
    if (parsed.metadata.exportedAt) details.push(new Date(parsed.metadata.exportedAt).toLocaleString())
    const ok = await confirm({
      title: '백업을 복원할까요?',
      body: details.map((line) => <span key={line}>{line}</span>),
      confirmLabel: '복원',
    })
    if (!ok) return false
    try {
      await restoreAppBackup(parsed.data)
    } catch (error) {
      toast(error instanceof Error ? error.message : '백업을 복원하지 못했습니다.', 'error')
      return false
    }
    window.location.reload()
    return true
  }

  const run = (work: () => Promise<void>) => () => {
    work().catch((error: unknown) => toast(error instanceof Error ? error.message : '처리하지 못했습니다.', 'error'))
  }

  const exportActions: Array<[LucideIcon, string, () => void]> = [
    [
      ClipboardCopy,
      '복사',
      run(async () => {
        const text = await getAppBackupText()
        try {
          await navigator.clipboard.writeText(text)
          toast('복사했어요')
        } catch {
          setManual({ mode: 'copy', text })
        }
      }),
    ],
    [
      Download,
      '파일',
      run(async () => {
        downloadShareData(await getAppBackupText())
        toast('저장을 시작했어요')
      }),
    ],
    [
      QrCode,
      'QR',
      run(async () => {
        setQrLoading(true)
        try {
          const frames = await buildQrShareFrames(await getAppBackupText())
          if (frames.frames.length > 64) throw new Error('백업이 커서 QR로 옮기기 어렵습니다. 파일 저장을 이용해 주세요.')
          setQr({ frames: frames.frames, svgs: await Promise.all(frames.frames.map(createQrMarkup)), index: 0 })
        } finally {
          setQrLoading(false)
        }
      }),
    ],
  ]

  const importActions: Array<[LucideIcon, string, () => void]> = [
    [
      ClipboardPaste,
      '붙여넣기',
      run(async () => {
        try {
          const text = await navigator.clipboard.readText()
          if (!text.trim()) throw new Error('empty')
          await restoreFromText(text, '클립보드')
        } catch {
          setManual({ mode: 'paste', text: '' })
        }
      }),
    ],
    [FileUp, '파일', () => fileInput.current?.click()],
    [ScanLine, '스캔', () => setScanOpen(true)],
  ]

  return (
    <div className="page settings">
      <header className="topbar">
        <h1 className="topbar__title">설정</h1>
      </header>

      <section className="section">
        <h2 className="section__title">화면</h2>
        <div className="segmented" role="radiogroup" aria-label="테마">
          <button type="button" role="radio" aria-checked={themeMode === 'light'} onClick={() => setThemeMode('light')}>
            <SunMedium size={16} /> 라이트
          </button>
          <button type="button" role="radio" aria-checked={themeMode === 'dark'} onClick={() => setThemeMode('dark')}>
            <MoonStar size={16} /> 다크
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">백업</h2>
        <div className="card backup">
          <ActionGroup label="내보내기" actions={exportActions} busy={qrLoading} />
          <ActionGroup label="가져오기" actions={importActions} />
        </div>
        <p className="muted">학습 기록 · 설정 · 즐겨찾기</p>
      </section>

      <section className="section">
        <div className="card card--flush">
          <a className="link-row" href={`${import.meta.env.BASE_URL}sources.html`} target="_blank" rel="noreferrer">
            <span>단어 데이터 출처</span>
            <ExternalLink size={16} />
          </a>
        </div>
        <p className="muted settings__version">여백의 말 · 화면 v2 미리보기</p>
      </section>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json,text/plain"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          try {
            await restoreFromText(await file.text(), file.name)
          } catch (error) {
            toast(error instanceof Error ? error.message : '파일을 읽지 못했어요.', 'error')
          }
        }}
      />

      {qr && <QrExportSheet qr={qr} onChange={setQr} onClose={() => setQr(null)} />}
      {scanOpen && <QrScanSheet onClose={() => setScanOpen(false)} onText={(text) => restoreFromText(text, 'QR')} />}
      {manual && (
        <Sheet title={manual.mode === 'copy' ? '직접 복사' : '직접 붙여넣기'} onClose={() => setManual(null)}>
          <div className="manual">
            <textarea
              className="field manual__text"
              readOnly={manual.mode === 'copy'}
              value={manual.text}
              autoFocus
              onFocus={(event) => manual.mode === 'copy' && event.currentTarget.select()}
              onChange={(event) => setManual({ ...manual, text: event.target.value })}
              aria-label="백업 텍스트"
            />
            {manual.mode === 'paste' && (
              <button type="button" className="btn btn--primary btn--block" disabled={!manual.text.trim()} onClick={() => void restoreFromText(manual.text, '붙여넣기')}>
                복원
              </button>
            )}
          </div>
        </Sheet>
      )}
    </div>
  )
}

function ActionGroup({ label, actions, busy }: { label: string; actions: Array<[LucideIcon, string, () => void]>; busy?: boolean }) {
  return (
    <div className="backup__group">
      <span className="backup__label">{label}</span>
      <div className="backup__actions">
        {actions.map(([Icon, text, onClick]) => (
          <button key={text} type="button" className="tile" onClick={onClick} disabled={busy} aria-label={`${label}: ${text}`}>
            <Icon size={22} strokeWidth={1.8} />
            <span>{text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function QrExportSheet({ qr, onChange, onClose }: { qr: QrState; onChange: (next: QrState) => void; onClose: () => void }) {
  const [playing, setPlaying] = useState(qr.frames.length > 1)
  const latest = useRef(qr)
  latest.current = qr
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const current = latest.current
      onChange({ ...current, index: (current.index + 1) % current.frames.length })
    }, QR_SHARE_AUTOPLAY_MS)
    return () => window.clearInterval(timer)
  }, [playing, onChange])
  const shift = (delta: number) => onChange({ ...qr, index: (qr.index + delta + qr.frames.length) % qr.frames.length })
  return (
    <Sheet title="QR 내보내기" onClose={onClose}>
      <div className="qr">
        <div className="qr__code" dangerouslySetInnerHTML={{ __html: qr.svgs[qr.index] }} />
        {qr.frames.length > 1 && (
          <div className="qr__nav">
            <button type="button" className="icon-btn" aria-label="이전 QR" onClick={() => shift(-1)}>
              <ChevronLeft size={20} />
            </button>
            <span className="qr__index">
              {qr.index + 1} / {qr.frames.length}
            </span>
            <button type="button" className="icon-btn" aria-label={playing ? '자동 넘김 멈춤' : '자동 넘김'} onClick={() => setPlaying(!playing)}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button type="button" className="icon-btn" aria-label="다음 QR" onClick={() => shift(1)}>
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> }

function QrScanSheet({ onClose, onText }: { onClose: () => void; onText: (text: string) => Promise<boolean> }) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<ReactNode>('카메라 준비 중')
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let cancelled = false
    let decoding = false
    let session: QrImportSession | null = null
    let lastScan = 0
    const DetectorCtor = (window as Window & { BarcodeDetector?: new (o?: { formats?: string[] }) => Detector }).BarcodeDetector

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !DetectorCtor) {
        setError('이 브라우저는 QR 스캔을 지원하지 않아요. 파일 가져오기를 사용해 주세요.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        if (cancelled || !video.current) return
        video.current.srcObject = stream
        await video.current.play()
        const detector = new DetectorCtor({ formats: ['qr_code'] })
        setStatus('QR을 화면 안에 맞춰 주세요')
        const loop = async () => {
          if (cancelled || decoding || !video.current) return
          const now = performance.now()
          if (now - lastScan > 240 && video.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            lastScan = now
            try {
              for (const code of await detector.detect(video.current)) {
                const parsed = code.rawValue ? parseQrTransferFrame(code.rawValue) : null
                if (!parsed) continue
                const next = session ? mergeQrImportFrame(session, parsed) : createQrImportSession(parsed)
                if (!next) {
                  setError('다른 QR이 섞였어요. 다시 스캔해 주세요.')
                  continue
                }
                session = next
                setError(null)
                setProgress({ received: getQrImportReceivedCount(next), total: next.total })
                if (isQrImportComplete(next)) {
                  decoding = true
                  setStatus('복원 준비 중')
                  const restored = await onTextRef.current(await decodeQrImportSession(next))
                  if (!restored) {
                    decoding = false
                    session = null
                    setProgress(null)
                    setStatus('QR을 화면 안에 맞춰 주세요')
                  }
                }
              }
            } catch {
              // Detector misses are expected; keep scanning.
            }
          }
          if (!cancelled && !decoding) frame = requestAnimationFrame(() => void loop())
        }
        frame = requestAnimationFrame(() => void loop())
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '카메라를 열지 못했어요.')
      }
    }
    void start()
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return (
    <Sheet title="QR 스캔" onClose={onClose}>
      <div className="scan">
        <video ref={video} className="scan__video" muted playsInline />
        {progress && (
          <div className="progress" aria-label={`${progress.received}/${progress.total}`}>
            <span style={{ transform: `scaleX(${progress.received / progress.total})` }} />
          </div>
        )}
        <p className="muted">{progress ? `${progress.received} / ${progress.total}` : status}</p>
        {error && <p className="alert" role="alert">{error}</p>}
      </div>
    </Sheet>
  )
}
