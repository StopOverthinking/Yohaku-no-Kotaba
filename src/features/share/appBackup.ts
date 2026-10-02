import { getBrowserBackupCoordinator } from '@/features/learn/contextBrowserPersistence'
import { CONTEXT_MIGRATED_MARKER } from '@/features/learn/contextRepository'
import { CONTEXT_STORAGE_KEY } from '@/features/learn/contextPersistence'
import { serializeContextState } from '@/features/learn/contextSerialization'
import { emptyContextState } from '@/features/learn/contextEngine'
import { buildBackupEnvelope } from './share'

export async function getAppBackupText() {
  const { context, local } = await getBrowserBackupCoordinator().snapshot()
  if (context) local[CONTEXT_STORAGE_KEY] = serializeContextState(context.data)
  else if (local[CONTEXT_STORAGE_KEY] === CONTEXT_MIGRATED_MARKER)
    throw new Error('학습 기록을 찾지 못해 백업을 중단했습니다.')
  const keys = Object.keys(local)
  return JSON.stringify(buildBackupEnvelope({
    length: keys.length, key: (index) => keys[index] ?? null, getItem: (key) => local[key] ?? null,
  }), null, 2)
}

export async function restoreAppBackup(entries: Record<string, string>) {
  await getBrowserBackupCoordinator().restore(entries, emptyContextState())
}
