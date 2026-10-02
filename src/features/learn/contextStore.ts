import { contextSenses, contextAliasGroups } from './contextContent'
import { createAsyncContextStore } from './contextAsyncStore'
import { browserContextPersistence } from './contextBrowserPersistence'
import { exampleRetirements } from '@/features/vocab/data/exampleRetirements'

export { CONTEXT_STORAGE_KEY, parseContextState } from './contextPersistence'
export const useContextStore = createAsyncContextStore(contextSenses, () => browserContextPersistence, undefined, contextAliasGroups, exampleRetirements)
