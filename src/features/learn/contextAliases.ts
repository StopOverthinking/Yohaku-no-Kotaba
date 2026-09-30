import type { ContextAliasGroup, ContextState, LearnSenseIndex, ReviewProfile } from './contextTypes'

const key = (member: ContextAliasGroup['members'][number]) => `${member.senseId}@${member.version}`
const signature = (group: ContextAliasGroup) => JSON.stringify({
  ...group, members: [...group.members].sort((a, b) => a.wordId.localeCompare(b.wordId)),
})

export function createAliasCatalog(senses: LearnSenseIndex[], groups: ContextAliasGroup[]) {
  const bySense = new Map(senses.map(sense => [sense.id, sense]))
  const byGroup = new Map<string, ContextAliasGroup>()
  const words = new Map<string, string>()
  for (const group of groups) {
    if (!group.id || byGroup.has(group.id) || group.members.length < 2 ||
        group.members.filter(member => member.wordId === group.representativeWordId).length !== 1)
      throw new Error('단어 연결 정보가 올바르지 않습니다.')
    for (const member of group.members) {
      const sense = bySense.get(member.senseId)
      if (words.has(member.wordId) || sense?.wordId !== member.wordId || sense.version !== member.version)
        throw new Error('단어 연결 대상이나 버전이 변경되었습니다.')
      words.set(member.wordId, group.representativeWordId)
    }
    byGroup.set(group.id, group)
  }
  return { groups: byGroup, resolveWordId: (id: string) => words.get(id) ?? id }
}
export type ContextAliasCatalog = ReturnType<typeof createAliasCatalog>

/** Apply only at a session boundary; the original profiles and score remain in the backup. */
export function migrateContextAliases(state: ContextState, catalog: ContextAliasCatalog, day: string): ContextState {
  for (const [id, migration] of Object.entries(state.aliasMigrations ?? {})) {
    const current = catalog.groups.get(id)
    if (!current || signature(current) !== signature(migration.group))
      throw new Error('기존 단어 연결 정보가 변경되었습니다. 원본 학습 기록은 보존했습니다.')
  }
  if (state.session || state.history.length) return state
  const pending = [...catalog.groups.values()].filter(group => !state.aliasMigrations?.[group.id])
  if (!pending.length) return state
  const profiles = { ...state.profiles }
  const aliasMigrations = { ...state.aliasMigrations }
  for (const group of pending) {
    const target = group.members.find(member => member.wordId === group.representativeWordId)!
    const originals = Object.fromEntries(group.members.flatMap(member =>
      profiles[key(member)] ? [[key(member), profiles[key(member)]]] : []))
    const previous = Object.values(originals)
    aliasMigrations[group.id] = {
      group, day, profiles: originals,
      level: { ...state.level, assessedWordIds: [...state.level.assessedWordIds] },
    }
    if (previous.length) {
      // Prefer the representative on a same-day tie without adding duplicate counters.
      const ordered = [originals[key(target)], ...previous].filter((p): p is ReviewProfile => !!p)
      const latest = ordered.reduce((a, b) => b.lastDay > a.lastDay ? b : a)
      const examples: ReviewProfile['examples'] = {}
      for (const profile of previous) for (const [id, stats] of Object.entries(profile.examples)) {
        const prior = examples[id]
        examples[id] = prior ? {
          seen: Math.max(prior.seen, stats.seen), failures: Math.max(prior.failures, stats.failures),
          hints: Math.max(prior.hints, stats.hints),
        } : { ...stats }
      }
      const merged: ReviewProfile = {
        ...latest, senseId: target.senseId, version: target.version,
        due: previous.map(p => p.due).sort()[0], step: Math.min(...previous.map(p => p.step)),
        dailyAttempts: Math.max(...previous.filter(p => p.lastDay === latest.lastDay).map(p => p.dailyAttempts)),
        failures: Math.max(...previous.map(p => p.failures)), failedDays: Math.max(...previous.map(p => p.failedDays)),
        failedDay: previous.flatMap(p => p.failedDay ? [p.failedDay] : []).sort().at(-1) ?? null,
        levelDay: previous.map(p => p.levelDay).sort().at(-1)!, examples,
      }
      for (const member of group.members) delete profiles[key(member)]
      profiles[key(target)] = merged
    }
  }
  return {
    ...state, version: 3, profiles, aliasMigrations,
    level: { ...state.level, assessedWordIds: [...new Set(state.level.assessedWordIds.map(catalog.resolveWordId))] },
  }
}
