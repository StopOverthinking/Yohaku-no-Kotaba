import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharePanel } from '@/features/share/SharePanel'
import * as shareModule from '@/features/share/share'
import * as appBackup from './appBackup'

describe('SharePanel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('shows share actions with short sentence labels', async () => {
    render(<SharePanel mode="submenu" />)

    expect(screen.queryAllByText(/^앱$/)).toHaveLength(1)
    expect(screen.queryByText(/^복습$/)).toBeNull()
    expect(screen.getByText('클립보드로 복사')).toBeInTheDocument()
    expect(screen.getByText('저장된 파일에서 불러오기')).toBeInTheDocument()
    expect(screen.queryByText('파일과 병합하기')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '앱 클립보드로 복사' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /파일과 병합하기/ })).not.toBeInTheDocument()
  })

  it('offers a file instead of generating hundreds of QR images for a large backup', async () => {
    vi.spyOn(appBackup, 'getAppBackupText').mockResolvedValue('latest-backup')
    vi.spyOn(shareModule, 'buildQrShareFrames').mockResolvedValue({
      rawBytes: 1000000, encodedBytes: 100000, encoding: 'gzip', sessionId: 'large',
      frames: Array.from({ length: 65 }, (_, i) => String(i)),
    })
    const renderQr = vi.spyOn(shareModule, 'createQrMarkup')
    const download = vi.spyOn(shareModule, 'downloadShareData').mockImplementation(() => undefined)
    render(<SharePanel mode="submenu" />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '앱 QR로 내보내기' }))
    expect(await screen.findByRole('button', { name: '앱 백업 파일 저장' })).toBeInTheDocument()
    expect(renderQr).not.toHaveBeenCalled()
    expect(screen.queryByText('앱 QR을 준비했어요.')).toBeNull()
    await user.click(screen.getByRole('button', { name: '앱 백업 파일 저장' }))
    expect(download).toHaveBeenCalledWith('latest-backup')
  })

  it('uses an in-app confirm modal for restore actions', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm')
    vi.spyOn(shareModule, 'parseRestorePayload').mockReturnValue({
      ok: true,
      keyCount: 2,
      metadata: {
        app: 'test-backup',
        exportedAt: '2026-04-12T00:00:00.000Z',
      },
      data: {
        'jsp-react:favorites': '[]',
      },
    })

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: vi.fn().mockResolvedValue('{"schemaVersion":1}'),
      },
    })

    render(<SharePanel mode="submenu" />)

    await user.click(screen.getByRole('button', { name: '앱 클립보드에서 불러오기' }))

    expect(window.confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('앱 복원')).toBeInTheDocument()
    expect(screen.getByText('클립보드에서 2개 항목을 복원할까요?')).toBeInTheDocument()
  })
})
