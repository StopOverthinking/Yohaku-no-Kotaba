import type { ContextAliasGroup, ContextState, LearnSenseIndex, ReviewProfile, SenseSeparation } from './contextTypes'
import { FAILURE_INTERVALS, reviewInterval } from './contextReviewPolicy'

const key = (member: ContextAliasGroup['members'][number]) => `${member.senseId}@${member.version}`
const signature = (group: ContextAliasGroup) => JSON.stringify({
  ...group, members: [...group.members].sort((a, b) => a.wordId.localeCompare(b.wordId)),
})

export function createAliasCatalog(senses: LearnSenseIndex[], groups: ContextAliasGroup[], separations: SenseSeparation[] = []) {
  const bySense = new Map(senses.map(sense => [sense.id, sense]))
  const byGroup = new Map<string, ContextAliasGroup>()
  const words = new Map<string, string>()
  const learningGroups = new Map<string, ContextAliasGroup>()
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
    const representative = group.members.find(member => member.wordId === group.representativeWordId)!
    const split = separations.find(row => row.sourceSenseId === representative.senseId && row.sourceVersion === representative.version)
    if (split) {
      // The old receipt remains immutable. Only an explicit example link may
      // connect the peer to one of the representative's independent usages.
      const targets = new Set(group.members.filter(member => member !== representative).flatMap(member => {
        const peer = bySense.get(member.senseId)!
        return peer.examples.map(example => {
          const equivalent = split.equivalentExamples?.find(row => row.sourceSenseId === peer.id &&
            row.sourceVersion === peer.version && row.exampleId === example.id)
          const target = split.usages.find(usage => usage.exampleIds.includes(equivalent?.representativeId ?? ''))
          if (!target) throw new Error('연결된 예문의 용법 소속이 없습니다.')
          return target.id
        })
      }))
      if (targets.size !== 1) throw new Error('연결된 용법을 하나로 확인할 수 없습니다.')
      const target = split.usages.find(usage => targets.has(usage.id))!
      learningGroups.set(group.id, { ...group, members: group.members.map(member => member === representative
        ? { ...member, senseId: target.id, version: target.version } : member) })
    } else learningGroups.set(group.id, group)
  }
  return { groups: byGroup, learningGroups, resolveWordId: (id: string) => words.get(id) ?? id }
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
    const learning = catalog.learningGroups.get(group.id)!
    const target = learning.members.find(member => member.wordId === group.representativeWordId)!
    const originals = Object.fromEntries(learning.members.flatMap(member =>
      profiles[key(member)] ? [[key(member), profiles[key(member)]]] : []))
    const previous = Object.values(originals)
    const archivedOriginals = Object.fromEntries(group.members.flatMap(member => {
      const original = state.profiles[key(member)] ?? state.senseSeparations?.[key(member)]?.profile
      return original ? [[key(member), original]] : []
    }))
    aliasMigrations[group.id] = {
      group, day, profiles: archivedOriginals,
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
      if (previous.every(p => p.mastered === true)) merged.mastered = true
      else delete merged.mastered
      if (merged.failures > 0) {
        const shortest = Math.min(...previous.map(p => reviewInterval(p.step, p.failures)))
        merged.step = FAILURE_INTERVALS.reduce((step, interval, index) => interval <= shortest ? index : step, 0)
      }
      for (const member of learning.members) delete profiles[key(member)]
      profiles[key(target)] = merged
    }
  }
  return {
    ...state, version: 3, profiles, aliasMigrations,
    ...(state.excludedWordIds ? { excludedWordIds: [...new Set(state.excludedWordIds.map(catalog.resolveWordId))] } : {}),
    level: { ...state.level, assessedWordIds: [...new Set(state.level.assessedWordIds.map(catalog.resolveWordId))] },
  }
}
