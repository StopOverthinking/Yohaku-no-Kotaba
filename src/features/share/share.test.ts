import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildBackupEnvelope,
  buildQrShareFrames,
  createQrImportSession,
  decodeQrImportSession,
  getShareStorageKeys,
  mergeQrImportFrame,
  parseQrTransferFrame,
  parseRestorePayload,
  SHARE_SCHEMA_VERSION,
} from '@/features/share/share'

function createStorage(entries: Record<string, string>) {
  const keys = Object.keys(entries)

  return {
    length: keys.length,
    key: (index: number) => keys[index] ?? null,
    getItem: (key: string) => entries[key] ?? null,
  }
}

describe('share utils', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('collects only React share storage keys in sorted order', () => {
    const storage = createStorage({
      'jsp-react:z-last': '1',
      unrelated: 'skip',
      'jsp-react:a-first': '2',
      'jsp-react:smart-review-storage': 'indexeddb-v1',
    })

    expect(getShareStorageKeys(storage)).toEqual(['jsp-react:a-first', 'jsp-react:z-last'])
  })

  it('builds a backup envelope with prefixed storage values', () => {
    const storage = createStorage({
      'jsp-react:preferences': '{"theme":"ice"}',
      'jsp-react:favorites': '["word-1"]',
      'jsp-react:smart-review-profiles': '{"word-1":{"dueAt":"2026-04-12T00:00:00.000Z"}}',
      ignore: 'value',
    })

    const backup = buildBackupEnvelope(storage)

    expect(backup.schemaVersion).toBe(SHARE_SCHEMA_VERSION)
    expect(backup.app).toBe('Yohaku no Kotaba')
    expect(backup.keyCount).toBe(2)
    expect(backup.data).toEqual({
      'jsp-react:favorites': '["word-1"]',
      'jsp-react:preferences': '{"theme":"ice"}',
    })
  })

  it('splits long share payloads into QR frame strings', async () => {
    vi.stubGlobal('CompressionStream', undefined)

    const longText = Array.from({ length: 240 }, (_, index) => `entry-${index}-${Math.random().toString(36).slice(2, 10)}`).join('|')
    const qrShare = await buildQrShareFrames(longText)

    expect(qrShare.frames.length).toBeGreaterThan(1)
    expect(qrShare.frames[0]).toMatch(/^JSPQR1\|/)
    expect(qrShare.frames[0]).toContain(`|${qrShare.frames.length}|plain|`)
  })

  it('restores legacy favorites and wrong answers into React storage keys', () => {
    const parsed = parseRestorePayload(JSON.stringify({
      schemaVersion: 1,
      appVersion: 'web',
      exportedAt: '2026-04-09T12:00:00.000Z',
      data: {
        japaneseAppFavorites: JSON.stringify(['word-1', 'word-2']),
        japaneseAppExamWrongAnswers: JSON.stringify([{ id: 'word-3' }, { id: 'word-4' }]),
      },
    }))

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.data).toEqual({
      'jsp-react:exam-wrong-answer-ids': '["word-3","word-4"]',
      'jsp-react:favorites': '["word-1","word-2"]',
    })
  })

  it('reassembles QR import frames into the original text', async () => {
    vi.stubGlobal('CompressionStream', undefined)

    const payload = JSON.stringify({
      data: {
        'jsp-react:favorites': '["word-1"]',
      },
    })
    const qrShare = await buildQrShareFrames(payload)
    const parsedFrames = qrShare.frames.map((frame) => parseQrTransferFrame(frame))

    expect(parsedFrames.every((frame) => frame !== null)).toBe(true)

    const [firstFrame, ...restFrames] = parsedFrames
    if (!firstFrame) return

    let session = createQrImportSession(firstFrame)
    for (const frame of restFrames) {
      if (!frame) continue
      const next = mergeQrImportFrame(session, frame)
      expect(next).not.toBeNull()
      if (next) session = next
    }

    await expect(decodeQrImportSession(session)).resolves.toBe(payload)
  })
})
