import { parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import type { ContextState, ReviewProfile } from './contextTypes'

export const CONTEXT_DATABASE_NAME = 'yohaku-context-learning'
const META = 'meta'
const PROFILES = 'profiles'
const STATE = 'state'
const ORIGINAL = 'original-local-v2'
const RESTORE = 'pending-restore'
export type RestoreJournal = { id: string; token: string | null; beforeLocal: Record<string, string> }
type Header = { token: string; core: string; profileCount: number }
type ProfileRow = { key: string; value: ReviewProfile }
export type ContextSnapshot = { token: string; data: ContextState }

export class ContextConflictError extends Error {
  constructor() {
    super('다른 화면에서 학습 기록이 바뀌었습니다. 새로고침해 주세요.')
    this.name = 'ContextConflictError'
  }
}

/** Immutable engine states let a commit write only profiles whose references changed.
 * The header and profile mutations share one transaction, including compare-and-swap.
 * A successful request is not a successful commit: resolve only on transaction complete.
 */
export class ContextDatabase {
  private connection: Promise<IDBDatabase> | null = null

  constructor(
    private readonly factory: IDBFactory,
    private readonly name = CONTEXT_DATABASE_NAME,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection
    const attempt = new Promise<IDBDatabase>((resolve, reject) => {
      let cancelled = false
      const request = this.factory.open(this.name, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore(META)
        db.createObjectStore(PROFILES, { keyPath: 'key' })
      }
      request.onblocked = () => {
        cancelled = true
        reject(new Error('다른 탭을 닫고 학습 기록을 다시 불러와 주세요.'))
      }
      request.onerror = () => reject(request.error ?? new Error('학습 저장소를 열지 못했습니다.'))
      request.onsuccess = () => {
        const db = request.result
        if (cancelled) { db.close(); return }
        db.onversionchange = () => { db.close(); this.connection = null }
        resolve(db)
      }
    })
    this.connection = attempt
    void attempt.catch(() => { if (this.connection === attempt) this.connection = null })
    return attempt
  }

  async close(): Promise<void> {
    const pending = this.connection
    this.connection = null
    if (pending) (await pending).close()
  }

  async read(): Promise<ContextSnapshot | null> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([META, PROFILES], 'readonly')
      const header = tx.objectStore(META).get(STATE)
      const rows = tx.objectStore(PROFILES).getAll()
      tx.onabort = () => reject(tx.error ?? new Error('학습 기록을 읽지 못했습니다.'))
      tx.oncomplete = () => {
        try {
          const value = header.result as Header | undefined
          const profiles = rows.result as ProfileRow[]
          if (!value) {
            if (profiles.length) throw new Error('학습 기록의 머리 정보가 없습니다. 원본은 보존했습니다.')
            resolve(null)
            return
          }
          if (typeof value.token !== 'string' || !value.token || typeof value.core !== 'string' ||
              !Number.isInteger(value.profileCount) || value.profileCount !== profiles.length)
            throw new Error('학습 기록이 불완전합니다. 원본은 보존했습니다.')
          const core = JSON.parse(value.core)
          const data = parseContextState(JSON.stringify({
            ...core, profiles: Object.fromEntries(profiles.map((row) => [row.key, row.value])),
          }))
          resolve({ token: value.token, data })
        } catch (error) { reject(error) }
      }
    })
  }

  async readOriginal(): Promise<string | null> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META, 'readonly')
      const request = tx.objectStore(META).get(ORIGINAL)
      tx.oncomplete = () => resolve(request.result ?? null)
      tx.onabort = () => reject(tx.error ?? new Error('이전 학습 기록을 읽지 못했습니다.'))
    })
  }

  async write(
    previous: ContextSnapshot | null,
    data: ContextState,
    originalRaw?: string,
    beforeWrite?: () => void,
    restoreId?: string,
  ): Promise<ContextSnapshot> {
    // Serialization and all non-IDB work happen before opening a transaction.
    const token = crypto.randomUUID()
    const header: Header = {
      token, core: serializeContextState({ ...data, profiles: {} }),
      profileCount: Object.keys(data.profiles).length,
    }
    const changed = Object.entries(data.profiles)
      .filter(([key, value]) => previous?.data.profiles[key] !== value)
      .map(([key, value]) => ({ key, value }))
    const removed = Object.keys(previous?.data.profiles ?? {}).filter((key) => !Object.hasOwn(data.profiles, key))
    if (originalRaw !== undefined) parseContextState(originalRaw)
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([META, PROFILES], 'readwrite', { durability: 'strict' })
      let failure: unknown
      const meta = tx.objectStore(META)
      const pending = meta.get(RESTORE)
      const request = meta.get(STATE)
      request.onsuccess = () => {
        try {
          beforeWrite?.()
          const journal = pending.result as RestoreJournal | undefined
          if (journal ? journal.id !== restoreId : restoreId !== undefined)
            throw new Error('백업 복원을 마무리한 뒤 다시 시도해 주세요.')
          const current = request.result as Header | undefined
          if ((current?.token ?? null) !== (previous?.token ?? null)) throw new ContextConflictError()
          const profiles = tx.objectStore(PROFILES)
          for (const key of removed) profiles.delete(key)
          for (const row of changed) profiles.put(row)
          meta.put(header, STATE)
          if (restoreId) meta.delete(RESTORE)
          // The exact old string is retained even after many newer saves.
          if (originalRaw !== undefined && !previous) meta.add(originalRaw, ORIGINAL)
        } catch (error) { failure = error; tx.abort() }
      }
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('학습 기록을 저장하지 못했습니다.'))
      tx.oncomplete = () => resolve({ token, data })
    })
  }

  async readRestore(): Promise<RestoreJournal | null> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META, 'readonly')
      const request = tx.objectStore(META).get(RESTORE)
      tx.onabort = () => reject(tx.error ?? new Error('복원 기록을 읽지 못했습니다.'))
      tx.oncomplete = () => {
        const journal = request.result as RestoreJournal | undefined
        if (!journal) { resolve(null); return }
        if (typeof journal.id !== 'string' || !journal.id ||
            (journal.token !== null && typeof journal.token !== 'string') ||
            !journal.beforeLocal || typeof journal.beforeLocal !== 'object' || Array.isArray(journal.beforeLocal) ||
            !Object.entries(journal.beforeLocal).every(([key, value]) => key.startsWith('jsp-react:') && typeof value === 'string')) {
          reject(new Error('복원 기록이 손상되었습니다. 원본을 보존했습니다.')); return
        }
        resolve(journal)
      }
    })
  }

  async beginRestore(previous: ContextSnapshot | null, beforeLocal: Record<string, string>): Promise<RestoreJournal> {
    if (!Object.entries(beforeLocal).every(([key, value]) => key.startsWith('jsp-react:') && typeof value === 'string'))
      throw new Error('앱 밖의 설정은 복원할 수 없습니다.')
    const db = await this.open()
    const journal: RestoreJournal = { id: crypto.randomUUID(), token: previous?.token ?? null, beforeLocal }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META, 'readwrite', { durability: 'strict' })
      const meta = tx.objectStore(META)
      const pending = meta.get(RESTORE)
      const state = meta.get(STATE)
      let failure: unknown
      state.onsuccess = () => {
        try {
          if (pending.result || (state.result?.token ?? null) !== journal.token) throw new ContextConflictError()
          meta.add(journal, RESTORE)
        } catch (error) { failure = error; tx.abort() }
      }
      tx.oncomplete = () => resolve(journal)
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('복원을 시작하지 못했습니다.'))
    })
  }

  async cancelRestore(id: string): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META, 'readwrite', { durability: 'strict' })
      const meta = tx.objectStore(META)
      const pending = meta.get(RESTORE)
      const state = meta.get(STATE)
      let failure: unknown
      state.onsuccess = () => {
        try {
          const journal = pending.result as RestoreJournal | undefined
          if (!journal || journal.id !== id || (state.result?.token ?? null) !== journal.token)
            throw new ContextConflictError()
          meta.delete(RESTORE)
        } catch (error) { failure = error; tx.abort() }
      }
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('복원 취소를 마무리하지 못했습니다.'))
    })
  }

  /** No localStorage mutation here. Callers verify read-back before marking migration. */
  async migrate(raw: string | null, empty: ContextState): Promise<ContextSnapshot> {
    const existing = await this.read()
    if (existing) return existing
    const data = raw === null ? empty : parseContextState(raw)
    try { await this.write(null, data, raw ?? undefined) }
    catch (error) { if (!(error instanceof ContextConflictError)) throw error }
    const saved = await this.read()
    if (!saved) throw new Error('새 학습 저장소를 확인하지 못했습니다. 이전 기록을 유지합니다.')
    return saved
  }
}
