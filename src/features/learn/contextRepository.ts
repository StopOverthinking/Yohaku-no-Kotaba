import { ContextConflictError, ContextDatabase, CONTEXT_DATABASE_NAME, type ContextSnapshot } from './contextDatabase'
import { CONTEXT_STORAGE_KEY, parseContextState } from './contextPersistence'
import { serializeContextState } from './contextSerialization'
import type { ContextState } from './contextTypes'

// An old client cannot parse this as a v2 state. Its existing CAS guard also
// rejects an answer based on the pre-migration blob rather than overwriting it.
export const CONTEXT_MIGRATED_MARKER = JSON.stringify({ storage: CONTEXT_DATABASE_NAME, version: 1 })
type LegacyStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Coordinates the one-time localStorage handoff. The original blob stays in IDB.
 * This never silently falls back to an empty/local state when IDB is unavailable.
 */
export class ContextRepository {
  constructor(private readonly db: ContextDatabase, private readonly legacy: LegacyStorage) {}

  private requireMarker(): void {
    if (this.legacy.getItem(CONTEXT_STORAGE_KEY) !== CONTEXT_MIGRATED_MARKER)
      throw new ContextConflictError()
  }

  async load(empty: ContextState): Promise<ContextSnapshot> {
    const raw = this.legacy.getItem(CONTEXT_STORAGE_KEY)
    if (raw === CONTEXT_MIGRATED_MARKER) {
      const stored = await this.db.read()
      if (!stored) throw new Error('이전한 학습 저장소를 찾지 못했습니다. 백업을 복원해 주세요.')
      this.requireMarker()
      return stored
    }
    // Parse before making any new database record, even when another tab has a DB.
    if (raw !== null) parseContextState(raw)
    await this.db.migrate(raw, empty)
    const original = await this.db.readOriginal()
    // A changed legacy blob is a separate branch of progress; preserve both.
    // Never choose one just because it happens to have a larger revision number.
    if (original !== raw) throw new ContextConflictError()
    const current = this.legacy.getItem(CONTEXT_STORAGE_KEY)
    if (current !== raw && current !== CONTEXT_MIGRATED_MARKER) throw new ContextConflictError()
    // migrate() already read and validated the committed snapshot. A failed
    // marker write leaves the original local string and DB copy intact for retry.
    if (current !== CONTEXT_MIGRATED_MARKER)
      this.legacy.setItem(CONTEXT_STORAGE_KEY, CONTEXT_MIGRATED_MARKER)
    this.requireMarker()
    // A peer might have answered while this tab was finishing the handoff.
    const latest = await this.db.read()
    this.requireMarker()
    if (!latest) throw new Error('학습 저장소를 다시 읽지 못했습니다. 원본은 보존했습니다.')
    return latest
  }

  async save(previous: ContextSnapshot | null, data: ContextState): Promise<ContextSnapshot> {
    this.requireMarker()
    const saved = await this.db.write(previous, data, undefined, () => this.requireMarker())
    this.requireMarker()
    return saved
  }

  async exportRaw(): Promise<string> {
    this.requireMarker()
    const stored = await this.db.read()
    this.requireMarker()
    if (!stored) throw new Error('학습 기록을 내보내지 못했습니다.')
    return serializeContextState(stored.data)
  }

  /** Replace learning data atomically; callers coordinate the other backup fields. */
  async restoreRaw(raw: string): Promise<ContextSnapshot> {
    const restored = parseContextState(raw)
    this.requireMarker()
    const current = await this.db.read()
    // Explicit restore may recover a deleted DB; ordinary load must never
    // replace the same missing DB with an empty learner silently.
    return this.save(current, { ...restored, revision: (current?.data.revision ?? 0) + 1 })
  }
}

let browserRepository: ContextRepository | undefined
let browserDatabase: ContextDatabase | undefined
export function getContextDatabase(): ContextDatabase {
  if (!browserDatabase) {
    if (typeof indexedDB === 'undefined') throw new Error('이 브라우저에서 학습 저장소를 사용할 수 없습니다.')
    browserDatabase = new ContextDatabase(indexedDB)
  }
  return browserDatabase
}
export function getContextRepository(): ContextRepository {
  if (!browserRepository) {
    if (typeof indexedDB === 'undefined') throw new Error('이 브라우저에서 학습 저장소를 사용할 수 없습니다.')
    browserRepository = new ContextRepository(getContextDatabase(), localStorage)
  }
  return browserRepository
}
