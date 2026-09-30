// Stable ID buckets keep existing sentences in their shard when new words are appended.
export function senseShard(id, bucketCount = 128) {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  return (hash >>> 0) % bucketCount
}

export function partitionLearnContent(senses, bucketCount = 128) {
  if (!Number.isInteger(bucketCount) || bucketCount < 1 || bucketCount > 512)
    throw new Error('Invalid content bucket count')
  const shards = Array.from({ length: bucketCount }, () => [])
  const seen = new Set(), exampleIds = new Set()
  const index = senses.map((sense) => {
    if (!sense.id || seen.has(sense.id)) throw new Error(`Duplicate or missing sense ID: ${sense.id}`)
    seen.add(sense.id)
    const shard = senseShard(sense.id, bucketCount)
    shards[shard].push(sense)
    return {
      id: sense.id, wordId: sense.wordId, version: sense.version, review: { ...sense.review }, shard,
      meaning: sense.meaning,
      examples: sense.examples.map((example) => {
        if (!example.id || exampleIds.has(example.id)) throw new Error(`Duplicate or missing example ID: ${example.id}`)
        exampleIds.add(example.id)
        return { id: example.id, version: example.version, difficulty: example.difficulty, status: example.status }
      }),
    }
  })
  return { index, shards }
}
