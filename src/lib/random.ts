const UINT32_RANGE = 4294967296

function createShuffleSeed() {
  return Math.floor(Math.random() * UINT32_RANGE)
}

export function shuffleArray<T>(items: T[], seed = createShuffleSeed()) {
  const clone = [...items]
  let state = seed >>> 0

  const rand = () => {
    state = (state * 1664525 + 1013904223) % UINT32_RANGE
    return state / UINT32_RANGE
  }

  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rand() * (index + 1))
    ;[clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]]
  }

  return clone
}
