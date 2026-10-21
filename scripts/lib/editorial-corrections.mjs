import { hashContent } from './jlpt-pilot.mjs'

const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))

// Current-session editorial amendments are distinct from old independent
// approvals. Restore exact pre-edit snapshots only as historical audit input.
export function restoreEditorialCorrections(words, senses, journals = []) {
  const wordMap = new Map(words.map(word => [word.id, word]))
  const senseMap = new Map(senses.map(sense => [sense.id, sense]))
  const ids = new Set()
  for (const journal of [...journals].reverse()) {
    const payroll = journal.scope === 'user-authorized-payroll-terminology-correction'
    if (journal.schemaVersion !== 1 || (!payroll && journal.scope !== 'user-authorized-notation-reading-hint-correction') ||
        !journal.id || ids.has(journal.id) || !journal.authorization?.trim() ||
        journal.review?.independent !== false || journal.review?.outcome !== 'accepted' ||
        !journal.review?.reviewedBy?.trim() || !Number.isFinite(Date.parse(journal.review?.reviewedAt)) ||
        !journal.entries?.length || journal.entriesHash !== hashContent(journal.entries))
      throw new Error('Invalid editorial correction journal')
    ids.add(journal.id)
    const seen = new Set()
    for (const entry of journal.entries) {
      const map = entry.kind === 'word' ? wordMap : entry.kind === 'sense' ? senseMap : null
      const { before, after } = entry
      const key = `${entry.kind}:${after?.id}`
      if (!map || !before?.id || before.id !== after.id || seen.has(key) || !entry.reason?.trim() ||
          hashContent(before) !== entry.beforeHash || hashContent(after) !== entry.afterHash ||
          hashContent(map.get(after.id)) !== entry.afterHash || entry.beforeHash === entry.afterHash)
        throw new Error('Editorial correction source changed or not applied')
      seen.add(key)
      if (payroll) {
        // A Korean label clarification of this existing wage sense, never a
        // general meaning-change route or an approval for a new core usage.
        if (before.meaning !== '급료, 월급' || after.meaning !== '급여' ||
            (entry.kind === 'word' ? before.id !== 'lex-jmdict-1230360' : before.id !== 'sense-lex-jmdict-1230360-1'))
          throw new Error('Payroll terminology correction is outside its authorized scope')
        if (entry.kind === 'word') {
          if (hashContent(without(before, ['meaning'])) !== hashContent(without(after, ['meaning'])))
            throw new Error('Payroll terminology correction changed word metadata')
        } else {
          if (hashContent(without(before, ['meaning', 'hint', 'confusions', 'examples'])) !== hashContent(without(after, ['meaning', 'hint', 'confusions', 'examples'])) ||
              before.examples.length !== after.examples.length)
            throw new Error('Payroll terminology correction changed sense metadata')
          for (let i = 0; i < before.examples.length; i++) {
            const old = before.examples[i], next = after.examples[i]
            if (hashContent(old) === hashContent(next)) continue
            if (next.version !== old.version + 1 || next.translation !== old.translation.replaceAll('월급으로', '급여로').replaceAll('월급', '급여') ||
                next.translationTarget !== old.translationTarget.replaceAll('월급', '급여') ||
                hashContent(without(old, ['version', 'translation', 'translationTarget'])) !== hashContent(without(next, ['version', 'translation', 'translationTarget'])))
              throw new Error('Payroll terminology correction changed example content')
          }
        }
        map.set(before.id, before)
        continue
      }
      if (entry.kind === 'word') {
        // This path changes notation only, never meaning, reading, identity,
        // membership, ordering or difficulty.
        if (!after.japanese?.trim() || hashContent(without(before, ['japanese'])) !== hashContent(without(after, ['japanese'])))
          throw new Error('Editorial notation correction changed word metadata')
      } else {
        if (hashContent(without(before, ['hint', 'confusions', 'examples'])) !== hashContent(without(after, ['hint', 'confusions', 'examples'])) ||
            before.examples.length !== after.examples.length)
          throw new Error('Editorial correction changed core sense or example membership')
        for (let i = 0; i < before.examples.length; i++) {
          const old = before.examples[i], next = after.examples[i]
          if (hashContent(old) === hashContent(next)) continue
          if (next.version !== old.version + 1 || !next.answer?.trim() || !next.reading?.trim() ||
              hashContent(without(old, ['version', 'answer', 'reading'])) !== hashContent(without(next, ['version', 'answer', 'reading'])))
            throw new Error('Editorial correction changed example metadata or skipped version')
        }
      }
      map.set(before.id, before)
    }
  }
  return { words: words.map(word => wordMap.get(word.id)), senses: senses.map(sense => senseMap.get(sense.id)),
    report: { journals: journals.length, entries: journals.reduce((n, journal) => n + journal.entries.length, 0),
      sourceHash: hashContent(journals), reviewScope: 'user-authorized editorial amendments; original independent approvals cover historical snapshots only' } }
}
