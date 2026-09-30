import type { LearnSense, LearnSenseIndex } from './contextTypes'
import { validateLearnContent } from './contentValidation'

export type ContentIndexEntry = LearnSenseIndex & { shard: number }
type Loaded = Map<string, LearnSense>

export class ContentLoadError extends Error {
  constructor(message = '예문을 내려받지 못했습니다. 연결을 확인한 뒤 다시 불러와 주세요.') {
    super(message)
    this.name = 'ContentLoadError'
  }
}

export function createContentLoader(
  index: ContentIndexEntry[],
  loaders: Record<number, () => Promise<LearnSense[]>>,
  capacity = 8,
) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid content cache capacity')
  const entries = new Map(index.map((entry) => [entry.id, entry]))
  if (entries.size !== index.length) throw new Error('Duplicate content index ID')
  const groups = new Map<number, ContentIndexEntry[]>()
  for (const entry of index) {
    if (!groups.has(entry.shard)) groups.set(entry.shard, [])
    groups.get(entry.shard)!.push(entry)
  }
  const cached = new Map<number, Loaded>()
  const pending = new Map<number, Promise<Loaded>>()
  const signature = (sense: LearnSenseIndex) => JSON.stringify([
    sense.id, sense.wordId, sense.version,
    sense.review.word, sense.review.contrast, sense.review.diversity,
    sense.examples.map((e) => [e.id, e.version, e.difficulty, e.status]),
  ])

  function loadShard(shard: number): Promise<Loaded> {
    const hit = cached.get(shard)
    if (hit) {
      cached.delete(shard)
      cached.set(shard, hit)
      return Promise.resolve(hit)
    }
    const active = pending.get(shard)
    if (active) return active
    const loader = loaders[shard]
    if (!loader) return Promise.reject(new ContentLoadError('예문 파일을 찾지 못했습니다. 새로고침해 주세요.'))
    const request = Promise.resolve().then(loader).catch(() => { throw new ContentLoadError() }).then((senses) => {
      const expected = groups.get(shard) ?? []
      const loaded = new Map(senses.map((sense) => [sense.id, sense]))
      if (loaded.size !== senses.length || loaded.size !== expected.length || expected.some((entry) => {
        const sense = loaded.get(entry.id)
        return !sense || signature(sense) !== signature(entry)
      })) throw new ContentLoadError('예문 버전이 일치하지 않습니다. 새로고침해 주세요.')
      const issues = validateLearnContent(senses, new Set(expected.map((entry) => entry.wordId)))
      if (issues.length) throw new ContentLoadError('예문 데이터가 올바르지 않습니다. 다시 불러와 주세요.')
      cached.set(shard, loaded)
      while (cached.size > capacity) cached.delete(cached.keys().next().value!)
      return loaded
    }).finally(() => { pending.delete(shard) })
    pending.set(shard, request)
    return request
  }

  return {
    async loadSense(id: string): Promise<LearnSense> {
      const entry = entries.get(id)
      if (!entry) throw new ContentLoadError('학습 예문을 찾지 못했습니다.')
      return (await loadShard(entry.shard)).get(id)!
    },
  }
}
