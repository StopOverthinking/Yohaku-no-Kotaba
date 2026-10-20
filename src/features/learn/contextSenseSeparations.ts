import type { ContextCard, ContextSession, ContextState, LearnSenseIndex, ReviewProfile, SenseSeparation } from './contextTypes'
import type { ExampleRetirement } from './contextExampleRetirements'

type Usage = SenseSeparation['usages'][number]
const sourceKey = (row: SenseSeparation) => `${row.sourceSenseId}@${row.sourceVersion}`
const usageKey = (usage: Usage) => `${usage.id}@${usage.version}`
const invalid = () => new Error('용법 분리 정보를 확인할 수 없습니다. 기존 학습 기록은 보존됩니다.')

export function projectSeparatedSense<T extends LearnSenseIndex>(sense: T, usage: Usage): T & { meaning: string; hint: string } {
  const ids = new Set(usage.exampleIds)
  return { ...sense, id: usage.id, version: usage.version, meaning: usage.meaning, hint: usage.hint,
    confusions: [], examples: sense.examples.filter(example => ids.has(example.id)) }
}

/** Validate explicit membership instead of inferring meaning from spelling or translation. */
export function separateContextSenses<T extends LearnSenseIndex & { meaning: string }>(senses: T[], rows: SenseSeparation[]): T[] {
  const originals = new Map(senses.map(sense => [sense.id, sense]))
  const ids = new Set(originals.keys())
  const bySource = new Map<string, SenseSeparation>()
  for (const row of rows) {
    const source = originals.get(row.sourceSenseId)
    if (!source || source.version !== row.sourceVersion || source.meaning !== row.sourceMeaning ||
        bySource.has(row.sourceSenseId) || row.usages.length < 2 || !/^[a-f0-9]{64}$/.test(row.sourceHash)) throw invalid()
    const examples = new Set(source.examples.map(example => example.id))
    const meanings = new Set<string>()
    for (const usage of row.usages) {
      if (!usage.id || ids.has(usage.id) || !Number.isInteger(usage.version) || usage.version < 1 ||
          !usage.meaning.trim() || meanings.has(usage.meaning) || !usage.hint.trim() ||
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(usage.hint) || !usage.exampleIds.length) throw invalid()
      ids.add(usage.id)
      meanings.add(usage.meaning)
      for (const id of usage.exampleIds) if (!examples.delete(id)) throw invalid()
    }
    if (examples.size) throw invalid()
    const equivalentIds = new Set<string>()
    for (const equivalent of row.equivalentExamples ?? []) {
      if (!equivalent.sourceSenseId || !Number.isInteger(equivalent.sourceVersion) || equivalent.sourceVersion < 1 ||
          !/^[a-f0-9]{64}$/.test(equivalent.sourceHash) || equivalentIds.has(equivalent.exampleId) ||
          source.examples.some(example => example.id === equivalent.exampleId) ||
          !source.examples.some(example => example.id === equivalent.representativeId)) throw invalid()
      equivalentIds.add(equivalent.exampleId)
    }
    bySource.set(row.sourceSenseId, row)
  }
  return senses.flatMap(sense => {
    const row = bySource.get(sense.id)
    return row ? row.usages.map(usage => projectSeparatedSense(sense, usage)) : [sense]
  })
}

/** Move the existing schedule only to its last observed usage, never to both meanings.
 * Original combined profiles are archived, including the snapshots needed by old undo.
 */
export function reconcileSeparatedSenses(state: ContextState, rows: SenseSeparation[], retirements: ExampleRetirement[] = []): ContextState {
  const definitions = new Map(rows.map(row => [sourceKey(row), row]))
  for (const [key, archived] of Object.entries(state.senseSeparations ?? {})) {
    if (JSON.stringify(definitions.get(key)) !== JSON.stringify(archived.separation) || state.profiles[key]) throw invalid()
  }
  const allCards = (session: ContextSession) => [session.current, ...session.cards, ...session.queue, ...session.retry]
  const pending = rows.filter(row => !state.senseSeparations?.[sourceKey(row)] && (
    state.profiles[sourceKey(row)] || state.history.some(entry => entry.profileKey === sourceKey(row) ||
      allCards(entry.session).some(card => card.senseId === row.sourceSenseId && card.senseVersion === row.sourceVersion)) ||
    (state.session && allCards(state.session).some(card => card.senseId === row.sourceSenseId && card.senseVersion === row.sourceVersion))))
  if (!pending.length) return state
  const bySource = new Map(pending.map(row => [sourceKey(row), row]))
  const retired = new Map(retirements.map(row => [row.exampleId, row.replacementId]))
  function usageFor(row: SenseSeparation, exampleId: string): Usage {
    const visited = new Set<string>()
    let id = exampleId
    while (retired.has(id) && !visited.has(id)) {
      visited.add(id)
      id = retired.get(id)!
    }
    id = row.equivalentExamples?.find(example => example.exampleId === id)?.representativeId ?? id
    const usage = row.usages.find(usage => usage.exampleIds.includes(id))
    if (!usage) throw invalid()
    return usage
  }
  function projectedProfile(row: SenseSeparation, profile: ReviewProfile | null): ReviewProfile | null {
    if (!profile) return null
    const usage = usageFor(row, profile.lastExampleId)
    const examples = Object.fromEntries(Object.entries(profile.examples).filter(([id]) => usageFor(row, id).id === usage.id))
    const result = { ...profile, senseId: usage.id, version: usage.version, examples }
    // A completion reached while rotating different meanings is not proof of this usage's mastery.
    if (Object.entries(profile.examples).some(([id, stats]) => stats.seen > 0 && usageFor(row, id).id !== usage.id)) delete result.mastered
    return result
  }
  function card(value: ContextCard): ContextCard {
    const row = bySource.get(`${value.senseId}@${value.senseVersion}`)
    if (!row) return value
    const usage = usageFor(row, value.exampleId)
    return { ...value, senseId: usage.id, senseVersion: usage.version }
  }
  function session(value: ContextSession): ContextSession {
    const current = card(value.current), cards = value.cards.map(card), queue = value.queue.map(card), retry = value.retry.map(card)
    if (current === value.current && cards.every((c, i) => c === value.cards[i]) && queue.every((c, i) => c === value.queue[i]) &&
        retry.every((c, i) => c === value.retry[i])) return value
    return { ...value, current, cards, queue, retry,
      ...(current !== value.current ? { revealed: false, hintShown: false, hintUsed: false } : {}) }
  }
  const profiles = { ...state.profiles }
  const senseSeparations = { ...state.senseSeparations }
  const latest = new Map<string, ReviewProfile | null>()
  for (const row of pending) {
    const key = sourceKey(row)
    if (row.usages.some(usage => profiles[usageKey(usage)])) throw invalid()
    const original = profiles[key] ?? null
    const projected = projectedProfile(row, original)
    latest.set(key, projected)
    senseSeparations[key] = { separation: row, profile: original,
      undoProfiles: state.history.filter(entry => entry.profileKey === key).map(entry => entry.profile) }
    delete profiles[key]
    if (projected) profiles[`${projected.senseId}@${projected.version}`] = projected
  }
  const history = [...state.history]
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i], repaired = session(entry.session)
    const row = bySource.get(entry.profileKey)
    if (!row) {
      if (repaired !== entry.session) history[i] = { ...entry, session: repaired }
      continue
    }
    const previous = projectedProfile(row, entry.profile)
    const current = latest.get(entry.profileKey)
    const primary = usageKey(usageFor(row, entry.session.current.exampleId))
    const previousKey = previous ? `${previous.senseId}@${previous.version}` : undefined
    const currentKey = current ? `${current.senseId}@${current.version}` : undefined
    const profileChanges = { ...entry.profileChanges }
    for (const key of new Set([previousKey, currentKey])) {
      if (key && key !== primary) profileChanges[key] = key === previousKey ? previous! : null
    }
    history[i] = { ...entry, session: repaired, profileKey: primary, profile: previousKey === primary ? previous : null,
      ...(Object.keys(profileChanges).length ? { profileChanges } : {}) }
    latest.set(entry.profileKey, previous)
  }
  return { ...state, profiles, senseSeparations, history, session: state.session ? session(state.session) : null }
}
