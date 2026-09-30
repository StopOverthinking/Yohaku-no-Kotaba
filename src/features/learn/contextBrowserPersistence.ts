import { ContextBackupCoordinator } from '@/features/share/contextBackup'
import { getContextDatabase, getContextRepository } from './contextRepository'
import type { ContextPersistence } from './contextAsyncStore'

export function getBrowserBackupCoordinator() {
  return new ContextBackupCoordinator(getContextDatabase(), localStorage)
}

export const browserContextPersistence: ContextPersistence = {
  async load(empty) {
    await getBrowserBackupCoordinator().recover()
    return getContextRepository().load(empty)
  },
  save(previous, data) { return getContextRepository().save(previous, data) },
}
