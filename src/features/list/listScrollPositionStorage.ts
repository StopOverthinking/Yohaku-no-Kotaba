export const listScrollPositionsStorageKey = 'jsp-react:list-scroll-positions'

type ScrollPositions = Record<string, number>

function readScrollPositions(storage: Pick<Storage, 'getItem'>): ScrollPositions {
  try {
    const raw = storage.getItem(listScrollPositionsStorageKey)

    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => {
        const position = entry[1]
        return typeof position === 'number' && Number.isFinite(position) && position >= 0
      }),
    )
  } catch {
    return {}
  }
}

export function loadListScrollPosition(
  setId: string,
  storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
) {
  if (!storage) {
    return 0
  }

  return readScrollPositions(storage)[setId] ?? 0
}

export function saveListScrollPosition(
  setId: string,
  position: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
) {
  if (!storage || !Number.isFinite(position)) {
    return
  }

  const positions = readScrollPositions(storage)
  positions[setId] = Math.max(position, 0)

  try {
    storage.setItem(listScrollPositionsStorageKey, JSON.stringify(positions))
  } catch {
    // Storage can be unavailable or full. The list should still remain usable.
  }
}
