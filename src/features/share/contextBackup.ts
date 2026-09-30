import { ContextDatabase } from '@/features/learn/contextDatabase'
import { CONTEXT_STORAGE_KEY, parseContextState } from '@/features/learn/contextPersistence'
import { CONTEXT_MIGRATED_MARKER } from '@/features/learn/contextRepository'
import type { ContextState } from '@/features/learn/contextTypes'

type LocalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>
export type ExclusiveRestore = <T>(work: () => Promise<T>) => Promise<T>
export const browserRestoreLock: ExclusiveRestore = async (work) => {
  if (!navigator.locks) return Promise.reject(new Error('이 브라우저에서는 안전한 백업 복원을 사용할 수 없습니다. 최신 브라우저에서 복원해 주세요.'))
  return await navigator.locks.request('yohaku-backup-restore', { mode: 'exclusive' }, work)
}

function capture(storage: LocalStorage): Record<string, string> {
  const entries: Record<string, string> = {}
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith('jsp-react:')) entries[key] = storage.getItem(key) ?? ''
  }
  return entries
}

function replace(storage: LocalStorage, entries: Record<string, string>) {
  // Remove obsolete keys before writes to free quota. The IDB journal already
  // protects the exact originals if any later write fails or the tab closes.
  for (const key of Object.keys(capture(storage))) if (!Object.hasOwn(entries, key)) storage.removeItem(key)
  for (const [key, value] of Object.entries(entries))
    if (storage.getItem(key) !== value) storage.setItem(key, value)
}

/** Journaled two-storage restore. The Web Lock prevents a second live tab from
 * treating an active restore as an interrupted one. IDB blocks learning writes.
 */
export class ContextBackupCoordinator {
  constructor(private db: ContextDatabase, private storage: LocalStorage, private exclusive: ExclusiveRestore = browserRestoreLock) {}

  private async recoverUnlocked() {
    const journal = await this.db.readRestore()
    if (!journal) return
    replace(this.storage, journal.beforeLocal)
    await this.db.cancelRestore(journal.id)
  }

  async recover(): Promise<void> {
    if (!await this.db.readRestore()) return
    await this.exclusive(() => this.recoverUnlocked())
  }

  async snapshot() {
    return this.exclusive(async () => {
      await this.recoverUnlocked()
      const context = await this.db.read()
      return { context, local: capture(this.storage) }
    })
  }

  async restore(entries: Record<string, string>, empty: ContextState): Promise<void> {
    if (!Object.entries(entries).every(([key, value]) => key.startsWith('jsp-react:') && typeof value === 'string'))
      throw new Error('앱 백업 형식이 올바르지 않습니다.')
    const raw = entries[CONTEXT_STORAGE_KEY]
    const data = raw === undefined ? empty : parseContextState(raw)
    await this.exclusive(async () => {
      await this.recoverUnlocked()
      const previous = await this.db.read()
      const before = capture(this.storage)
      const journal = await this.db.beginRestore(previous, before)
      try {
        replace(this.storage, { ...entries, [CONTEXT_STORAGE_KEY]: CONTEXT_MIGRATED_MARKER })
        await this.db.write(previous, { ...data, revision: (previous?.data.revision ?? 0) + 1 }, undefined, undefined, journal.id)
      } catch (error) {
        // If rollback itself fails, keep the journal for next boot. Never erase
        // recovery evidence and pretend the restore or rollback completed.
        await this.recoverUnlocked()
        throw error
      }
    })
  }
}
