import type { ContextSession, ContextState } from './contextTypes'

type ArrayChange = { start: number; remove: number; insert: unknown[] }
type SessionPatch =
  { kind: 'delta'; values: Record<string, unknown> } | { kind: 'full'; value: ContextSession }
const same = (a: unknown, b: unknown) =>
  a === b || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b))

function difference(base: ContextSession | null, previous: ContextSession): SessionPatch {
  if (!base) return { kind: 'full', value: previous }
  const values: Record<string, unknown> = {}
  for (const key of Object.keys(previous) as Array<keyof ContextSession>) {
    const a = base[key],
      b = previous[key]
    if (a === b) continue
    if (Array.isArray(a) && Array.isArray(b)) {
      let start = 0,
        suffix = 0
      while (start < a.length && start < b.length && same(a[start], b[start])) start++
      while (
        suffix < a.length - start &&
        suffix < b.length - start &&
        same(a[a.length - suffix - 1], b[b.length - suffix - 1])
      )
        suffix++
      if (start === a.length && start === b.length) continue
      values[key] = {
        start,
        remove: a.length - start - suffix,
        insert: b.slice(start, b.length - suffix),
      } satisfies ArrayChange
    } else if (!same(a, b)) values[key] = b
  }
  return { kind: 'delta', values }
}

/** Persist reverse session changes; scope lists and growing card prefixes appear only once. */
export function serializeContextState(state: ContextState): string {
  let base = state.session
  const history = [...state.history]
  const encoded = new Array(history.length)
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]
    encoded[i] = { ...entry, session: difference(base, entry.session) }
    base = entry.session
  }
  return JSON.stringify({ ...state, sessionEncoding: 'delta-v1', history: encoded })
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** Decode before the common state validator examines every reconstructed snapshot. */
export function expandContextState(value: unknown): unknown {
  if (!record(value) || value.sessionEncoding === undefined) return value
  if (value.sessionEncoding !== 'delta-v1' || !Array.isArray(value.history))
    throw new Error('이전 카드 압축 형식이 올바르지 않습니다.')
  let base = value.session
  const history = [...value.history]
  for (let i = history.length - 1; i >= 0; i--) {
    const entry: unknown = history[i]
    if (!record(entry) || !record(entry.session)) throw new Error('이전 카드 기록을 읽을 수 없습니다.')
    const patch = entry.session
    if (patch.kind === 'full') base = patch.value
    else if (patch.kind === 'delta' && record(base) && record(patch.values)) {
      const previous = { ...base }
      for (const [key, change] of Object.entries(patch.values)) {
        if (!Object.hasOwn(base, key)) throw new Error('이전 카드 필드가 올바르지 않습니다.')
        const current = base[key]
        if (Array.isArray(current)) {
          if (
            !record(change) ||
            !Number.isInteger(change.start) ||
            !Number.isInteger(change.remove) ||
            !Array.isArray(change.insert)
          )
            throw new Error('이전 카드 배열 형식이 올바르지 않습니다.')
          const start = change.start as number,
            remove = change.remove as number
          if (start < 0 || remove < 0 || start + remove > current.length)
            throw new Error('이전 카드 범위가 올바르지 않습니다.')
          previous[key] = [...current.slice(0, start), ...change.insert, ...current.slice(start + remove)]
        } else previous[key] = change
      }
      base = previous
    } else throw new Error('이전 카드 변경 기록을 읽을 수 없습니다.')
    history[i] = { ...entry, session: base }
  }
  const { sessionEncoding: _encoding, ...rest } = value
  return { ...rest, history }
}
