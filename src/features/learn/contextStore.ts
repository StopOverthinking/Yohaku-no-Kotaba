import { contextSenses, contextAliasGroups } from './contextContent'
import { createAsyncContextStore } from './contextAsyncStore'
import { browserContextPersistence } from './contextBrowserPersistence'

export { CONTEXT_STORAGE_KEY, parseContextState } from './contextPersistence'
export const useContextStore = createAsyncContextStore(contextSenses, () => browserContextPersistence, undefined, contextAliasGroups)
