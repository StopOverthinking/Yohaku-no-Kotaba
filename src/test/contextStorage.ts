import { IDBFactory } from 'fake-indexeddb'
import { ContextDatabase } from '@/features/learn/contextDatabase'
import { ContextRepository } from '@/features/learn/contextRepository'
import { ContextBackupCoordinator, type ExclusiveRestore } from '@/features/share/contextBackup'
import type { ContextPersistence } from '@/features/learn/contextAsyncStore'

let db: ContextDatabase
let repo: ContextRepository
let coordinator: ContextBackupCoordinator
export async function resetContextStorage() {
  if (db) await db.close()
  localStorage.clear()
  db = new ContextDatabase(new IDBFactory())
  repo = new ContextRepository(db, localStorage)
  let queue = Promise.resolve()
  const lock: ExclusiveRestore = (work) => {
    const result = queue.then(work)
    queue = result.then(() => undefined, () => undefined)
    return result
  }
  coordinator = new ContextBackupCoordinator(db, localStorage, lock)
}
export const persistence: ContextPersistence = {
  async load(empty) { await coordinator.recover(); return repo.load(empty) },
  save(previous, data) { return repo.save(previous, data) },
}
export const getTestCoordinator = () => coordinator
export const getTestRepository = () => repo
