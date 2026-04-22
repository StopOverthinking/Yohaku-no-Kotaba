export const SHARE_STORAGE_PREFIX = 'jsp-react:'
export const SHARE_SCHEMA_VERSION = 'jsp-react-backup-v1'
export const QR_SHARE_PREFIX = 'JSPQR1'
export const QR_SHARE_CHUNK_SIZE = 900
export const QR_SHARE_AUTOPLAY_MS = 1400
const QR_GZIP_FORMAT = 'gzip'
const EXCLUDED_SHARE_KEYS = new Set([
  'jsp-react:smart-review-profiles',
  'jsp-react:smart-review-session',
  'jsp-react:smart-review-result',
  'jsp-react:smart-review-storage',
])

type StorageLike = Pick<Storage, 'getItem' | 'key' | 'length'>
type WritableStorageLike = Pick<Storage, 'setItem' | 'removeItem' | 'key' | 'length'>
type RestoreMetadata = {
  app?: string
  exportedAt?: string
  schemaVersion?: string
  legacy?: boolean
}

export type ShareBackupEnvelope = {
  schemaVersion: typeof SHARE_SCHEMA_VERSION
  app: 'Yohaku no Kotaba'
  exportedAt: string
  keyCount: number
  data: Record<string, string>
}

export type QrTransferEncoding = 'plain' | 'gzip'

export type QrShareFrames = {
  rawBytes: number
  encodedBytes: number
  encoding: QrTransferEncoding
  sessionId: string
  frames: string[]
}

export type RestoreParseSuccess = {
  ok: true
  data: Record<string, string>
  keyCount: number
  metadata: RestoreMetadata
}

export type RestoreParseFailure = {
  ok: false
  error: string
}

export type RestoreParseResult = RestoreParseSuccess | RestoreParseFailure

export type ParsedQrTransferFrame = {
  sessionId: string
  index: number
  total: number
  encoding: QrTransferEncoding
  chunk: string
}

export type QrImportSession = {
  sessionId: string
  total: number
  encoding: QrTransferEncoding
  chunks: Array<string | null>
}

const legacyKeyMap = {
  japaneseAppNickname: 'jsp-react:game-player-name',
  speedQuizPlayerMMR: 'jsp-react:game-mmr-objective',
  speedQuizPlayerMMR_subjective: 'jsp-react:game-mmr-pronunciation',
  speedQuizRecords: 'jsp-react:game-records-objective',
  speedQuizRecords_subjective: 'jsp-react:game-records-pronunciation',
  speedQuizBotHistory: 'jsp-react:game-bot-history-objective',
  speedQuizBotHistory_subjective: 'jsp-react:game-bot-history-pronunciation',
} as const

function resolveStorage(storage?: StorageLike) {
  if (storage) return storage

  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Storage is not available in this environment.')
  }

  return window.localStorage
}

function resolveWritableStorage(storage?: WritableStorageLike) {
  if (storage) return storage

  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Storage is not available in this environment.')
  }

  return window.localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function bytesToBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function base64UrlToBytes(base64Url: string) {
  const normalized = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64Url.length / 4) * 4, '=')

  return base64ToBytes(normalized)
}

function splitIntoChunks(text: string, chunkSize: number) {
  const chunks: string[] = []

  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize))
  }

  return chunks
}

function createQrTransferId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function getLocalDateStamp(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function compressShareText(text: string): Promise<{ bytes: Uint8Array; encoding: QrTransferEncoding }> {
  const rawBytes = new TextEncoder().encode(text)

  if (typeof CompressionStream !== 'function') {
    return { bytes: rawBytes, encoding: 'plain' }
  }

  try {
    const compressedStream = new Blob([rawBytes]).stream().pipeThrough(new CompressionStream(QR_GZIP_FORMAT))
    const compressedBytes = new Uint8Array(await new Response(compressedStream).arrayBuffer())

    if (compressedBytes.length < rawBytes.length) {
      return { bytes: compressedBytes, encoding: 'gzip' }
    }
  } catch {
    return { bytes: rawBytes, encoding: 'plain' }
  }

  return { bytes: rawBytes, encoding: 'plain' }
}

async function decompressShareBytes(bytes: Uint8Array, encoding: QrTransferEncoding) {
  if (encoding === 'plain') {
    return bytes
  }

  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot restore compressed QR backups.')
  }

  const blobBytes = new Uint8Array(bytes)
  const decompressedStream = new Blob([blobBytes]).stream().pipeThrough(new DecompressionStream(QR_GZIP_FORMAT))
  return new Uint8Array(await new Response(decompressedStream).arrayBuffer())
}

function toStorageString(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

function parseJsonString(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function readStoredArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = parseJsonString(value)
    return Array.isArray(parsed) ? parsed : null
  }

  return null
}

function uniqueStrings(values: Array<string | null>) {
  const next = new Set<string>()

  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      next.add(value)
    }
  }

  return [...next]
}

function normalizeLegacyEntries(rawData: Record<string, unknown>) {
  const mapped: Record<string, string> = {}

  for (const [key, value] of Object.entries(rawData)) {
    if (key.startsWith(SHARE_STORAGE_PREFIX)) {
      if (EXCLUDED_SHARE_KEYS.has(key)) {
        continue
      }
      mapped[key] = toStorageString(value)
      continue
    }

    if (key === 'japaneseAppFavorites') {
      const favorites = readStoredArray(value)
      if (favorites) {
        mapped['jsp-react:favorites'] = JSON.stringify(
          uniqueStrings(
            favorites.map((entry) => (typeof entry === 'string' ? entry : null)),
          ),
        )
      }
      continue
    }

    if (key === 'japaneseAppExamWrongAnswers') {
      const wrongAnswers = readStoredArray(value)
      if (wrongAnswers) {
        mapped['jsp-react:exam-wrong-answer-ids'] = JSON.stringify(
          uniqueStrings(
            wrongAnswers.map((entry) => {
              if (typeof entry === 'string') return entry
              if (isRecord(entry) && typeof entry.id === 'string') return entry.id
              return null
            }),
          ),
        )
      }
      continue
    }

    const reactKey = legacyKeyMap[key as keyof typeof legacyKeyMap]
    if (reactKey) {
      mapped[reactKey] = toStorageString(value)
    }
  }

  return mapped
}

export function getShareStorageKeys(storage?: StorageLike) {
  const target = resolveStorage(storage)
  const keys: string[] = []

  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index)
    if (key?.startsWith(SHARE_STORAGE_PREFIX) && !EXCLUDED_SHARE_KEYS.has(key)) {
      keys.push(key)
    }
  }

  return keys.sort((left, right) => left.localeCompare(right))
}

export function buildBackupEnvelope(storage?: StorageLike): ShareBackupEnvelope {
  const target = resolveStorage(storage)
  const keys = getShareStorageKeys(target)
  const data: Record<string, string> = {}

  for (const key of keys) {
    data[key] = target.getItem(key) ?? ''
  }

  return {
    schemaVersion: SHARE_SCHEMA_VERSION,
    app: 'Yohaku no Kotaba',
    exportedAt: new Date().toISOString(),
    keyCount: keys.length,
    data,
  }
}

export function getShareDataText(storage?: StorageLike) {
  return JSON.stringify(buildBackupEnvelope(storage), null, 2)
}

export function downloadShareData(text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `yohaku-no-kotaba-backup-${getLocalDateStamp()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function parseRestorePayload(text: string): RestoreParseResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      ok: false,
      error: `The backup text is not valid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: 'The backup must be a JSON object.',
    }
  }

  const rawEntries = isRecord(parsed.data) ? parsed.data : parsed
  const normalizedEntries = normalizeLegacyEntries(rawEntries)
  const keyCount = Object.keys(normalizedEntries).length

  if (keyCount === 0) {
    return {
      ok: false,
      error: 'No supported React data was found in this backup.',
    }
  }

  return {
    ok: true,
    data: normalizedEntries,
    keyCount,
    metadata: {
      app:
        typeof parsed.app === 'string'
          ? parsed.app
          : typeof parsed.appVersion === 'string'
            ? parsed.appVersion
            : undefined,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
      schemaVersion: typeof parsed.schemaVersion === 'string' ? parsed.schemaVersion : undefined,
      legacy: !('data' in parsed) || typeof parsed.appVersion === 'string',
    },
  }
}

export function applyImportedBackup(entries: Record<string, string>, storage?: WritableStorageLike) {
  const target = resolveWritableStorage(storage)

  for (let index = target.length - 1; index >= 0; index -= 1) {
    const key = target.key(index)
    if (key?.startsWith(SHARE_STORAGE_PREFIX)) {
      target.removeItem(key)
    }
  }

  for (const [key, value] of Object.entries(entries)) {
    target.setItem(key, value)
  }
}

export async function buildQrShareFrames(text: string): Promise<QrShareFrames> {
  const rawBytes = new TextEncoder().encode(text)
  const { bytes, encoding } = await compressShareText(text)
  const payload = bytesToBase64Url(bytes)
  const chunks = splitIntoChunks(payload, QR_SHARE_CHUNK_SIZE)
  const sessionId = createQrTransferId()

  return {
    rawBytes: rawBytes.length,
    encodedBytes: bytes.length,
    encoding,
    sessionId,
    frames: chunks.map(
      (chunk, index) => `${QR_SHARE_PREFIX}|${sessionId}|${index + 1}|${chunks.length}|${encoding}|${chunk}`,
    ),
  }
}

export function parseQrTransferFrame(rawValue: string) {
  const [prefix, sessionId, indexValue, totalValue, encodingValue, ...chunkParts] = rawValue.split('|')
  if (prefix !== QR_SHARE_PREFIX || !sessionId) {
    return null
  }

  const index = Number.parseInt(indexValue ?? '', 10)
  const total = Number.parseInt(totalValue ?? '', 10)
  const encoding = encodingValue === 'gzip' ? 'gzip' : encodingValue === 'plain' ? 'plain' : null
  const chunk = chunkParts.join('|')

  if (!encoding || !Number.isInteger(index) || !Number.isInteger(total)) {
    return null
  }

  if (index < 1 || total < 1 || index > total || chunk.length === 0) {
    return null
  }

  return {
    sessionId,
    index,
    total,
    encoding,
    chunk,
  } satisfies ParsedQrTransferFrame
}

export function createQrImportSession(frame: ParsedQrTransferFrame): QrImportSession {
  const chunks = Array.from({ length: frame.total }, () => null as string | null)
  chunks[frame.index - 1] = frame.chunk

  return {
    sessionId: frame.sessionId,
    total: frame.total,
    encoding: frame.encoding,
    chunks,
  }
}

export function mergeQrImportFrame(session: QrImportSession, frame: ParsedQrTransferFrame) {
  if (
    session.sessionId !== frame.sessionId ||
    session.total !== frame.total ||
    session.encoding !== frame.encoding
  ) {
    return null
  }

  const chunks = [...session.chunks]
  chunks[frame.index - 1] = frame.chunk

  return {
    ...session,
    chunks,
  } satisfies QrImportSession
}

export function getQrImportReceivedCount(session: QrImportSession) {
  return session.chunks.filter((chunk) => typeof chunk === 'string').length
}

export function isQrImportComplete(session: QrImportSession) {
  return getQrImportReceivedCount(session) === session.total
}

export async function decodeQrImportSession(session: QrImportSession) {
  if (!isQrImportComplete(session)) {
    throw new Error('QR backup is incomplete.')
  }

  const payload = session.chunks.join('')
  const bytes = base64UrlToBytes(payload)
  const decodedBytes = await decompressShareBytes(bytes, session.encoding)
  return new TextDecoder().decode(decodedBytes)
}

export async function createQrMarkup(value: string) {
  const { toString } = await import('qrcode')

  return toString(value, {
    type: 'svg',
    errorCorrectionLevel: 'L',
    margin: 1,
    width: 320,
  })
}
