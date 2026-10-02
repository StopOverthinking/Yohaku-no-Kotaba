import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextDatabase } from '@/features/learn/contextDatabase'
import { CONTEXT_STORAGE_KEY, UnsupportedContextVersionError } from '@/features/learn/contextPersistence'
import { CONTEXT_MIGRATED_MARKER, ContextRepository } from '@/features/learn/contextRepository'
import { emptyContextState } from '@/features/learn/contextEngine'
import { serializeContextState } from '@/features/learn/contextSerialization'
import { ContextBackupCoordinator, type ExclusiveRestore } from './contextBackup'

describe('cross-storage backup restore', () => {
  let db: ContextDatabase
  let repo: ContextRepository
  let backup: ContextBackupCoordinator
  let lock: ExclusiveRestore
  beforeEach(async () => {
    localStorage.clear()
    db = new ContextDatabase(new IDBFactory())
    repo = new ContextRepository(db, localStorage)
    let queue = Promise.resolve()
    lock = (work) => {
      const result = queue.then(work)
      queue = result.then(() => undefined, () => undefined)
      return result
    }
    backup = new ContextBackupCoordinator(db, localStorage, lock)
    await repo.load(emptyContextState())
    localStorage.setItem('jsp-react:preferences', 'before')
    localStorage.setItem('unrelated', 'keep')
  })
  afterEach(async () => { vi.restoreAllMocks(); await db.close() })
  const target = () => ({ ...emptyContextState(), level: { value: 61, assessedWordIds: [] } })
  const entries = () => ({ 'jsp-react:preferences': 'after', [CONTEXT_STORAGE_KEY]: serializeContextState(target()) })

  it('commits preferences and learning together without exporting a migration marker as data', async () => {
    await backup.restore(entries(), emptyContextState())
    expect(localStorage.getItem('jsp-react:preferences')).toBe('after')
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(CONTEXT_MIGRATED_MARKER)
    expect(localStorage.getItem('unrelated')).toBe('keep')
    expect((await db.read())?.data.level.value).toBe(61)
    expect(await db.readRestore()).toBeNull()
    expect(await repo.exportRaw()).not.toBe(CONTEXT_MIGRATED_MARKER)
    const snapshot = await backup.snapshot()
    expect(snapshot.local['jsp-react:preferences']).toBe('after')
    expect(snapshot.context?.data.level.value).toBe(61)
  })

  it('rolls local changes back when final DB commit fails', async () => {
    const before = await db.read()
    vi.spyOn(db, 'write').mockRejectedValueOnce(new Error('disk full'))
    await expect(backup.restore(entries(), emptyContextState())).rejects.toThrow('disk full')
    expect(await db.read()).toEqual(before)
    expect(localStorage.getItem('jsp-react:preferences')).toBe('before')
    expect(await db.readRestore()).toBeNull()
  })

  it('rolls back a partial local write and removes newly imported keys on quota failure', async () => {
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'jsp-react:fail') throw new Error('quota')
      return setItem.call(this, key, value)
    })
    await expect(backup.restore({ ...entries(), 'jsp-react:new': 'new', 'jsp-react:fail': 'large' }, emptyContextState())).rejects.toThrow('quota')
    expect(localStorage.getItem('jsp-react:new')).toBeNull()
    expect(localStorage.getItem('jsp-react:preferences')).toBe('before')
    expect(await db.readRestore()).toBeNull()
  })

  it('recovers an interrupted restore before allowing further learning writes', async () => {
    const before = await db.read()
    await db.beginRestore(before, { 'jsp-react:preferences': 'before', [CONTEXT_STORAGE_KEY]: CONTEXT_MIGRATED_MARKER })
    localStorage.setItem('jsp-react:preferences', 'partial')
    await expect(repo.save(before, target())).rejects.toThrow('복원')
    await backup.recover()
    expect(localStorage.getItem('jsp-react:preferences')).toBe('before')
    expect(await db.read()).toEqual(before)
    expect(await db.readRestore()).toBeNull()
    await repo.save(before, target())
  })

  it('retains the recovery journal when rollback also fails and retries it next boot', async () => {
    const before = await db.read()
    await db.beginRestore(before, { 'jsp-react:preferences': 'before', [CONTEXT_STORAGE_KEY]: CONTEXT_MIGRATED_MARKER })
    localStorage.setItem('jsp-react:preferences', 'partial')
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable') })
    await expect(backup.recover()).rejects.toThrow('unavailable')
    expect(await db.readRestore()).not.toBeNull()
    expect(await db.read()).toEqual(before)
    fail.mockRestore()
    await backup.recover()
    expect(localStorage.getItem('jsp-react:preferences')).toBe('before')
    expect(await db.readRestore()).toBeNull()
  })

  it('waits for the live restoring tab before attempting recovery', async () => {
    let finish!: () => void
    const gate = new Promise<void>((resolve) => { finish = resolve })
    const write = db.write.bind(db)
    vi.spyOn(db, 'write').mockImplementation(async (...args) => { await gate; return write(...args) })
    const restoring = backup.restore(entries(), emptyContextState())
    await vi.waitFor(async () => expect(await db.readRestore()).not.toBeNull())
    const peer = new ContextBackupCoordinator(db, localStorage, lock)
    const recovering = peer.recover()
    const exporting = peer.snapshot()
    finish()
    await Promise.all([restoring, recovering])
    const exported = await exporting
    expect(exported.local['jsp-react:preferences']).toBe('after')
    expect(exported.context?.data.level.value).toBe(61)
    expect(localStorage.getItem('jsp-react:preferences')).toBe('after')
    expect((await db.read())?.data.level.value).toBe(61)
  })

  it('rejects malformed backup and out-of-scope keys before creating a journal', async () => {
    await expect(backup.restore({ [CONTEXT_STORAGE_KEY]: '{bad' }, emptyContextState())).rejects.toThrow()
    await expect(backup.restore({ unrelated: 'overwrite' }, emptyContextState())).rejects.toThrow()
    expect(await db.readRestore()).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('keep')
  })

  it.each(['version', 'scheduleVersion'])('preserves live DB and settings when backup %s is unsupported', async field => {
    const before = await db.read()
    const begin = vi.spyOn(db, 'beginRestore')
    const raw = JSON.stringify({ ...target(), [field]: 99 })
    await expect(backup.restore({ ...entries(), [CONTEXT_STORAGE_KEY]: raw }, emptyContextState()))
      .rejects.toThrow(UnsupportedContextVersionError)
    expect(begin).not.toHaveBeenCalled()
    expect(await db.read()).toEqual(before)
    expect(await db.readRestore()).toBeNull()
    expect(localStorage.getItem('jsp-react:preferences')).toBe('before')
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(CONTEXT_MIGRATED_MARKER)
    expect(localStorage.getItem('unrelated')).toBe('keep')
    await backup.restore(entries(), emptyContextState())
    expect((await db.read())?.data.level.value).toBe(61)
  })
})
