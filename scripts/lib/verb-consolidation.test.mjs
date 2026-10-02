import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { hashContent } from './jlpt-pilot.mjs'
import { validateVerbConsolidation } from './verb-consolidation.mjs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const original = {
  manifest: read('content/jlpt/legacy/verb-consolidation.json'),
  sets: read('src/features/vocab/editor-data/vocabularySets.json'),
  words: read('src/features/vocab/editor-data/vocabularyWords.json'),
  senses: read('src/features/vocab/editor-data/learnContent.json'),
  receipt: read('content/jlpt/pilot/published-membership.json'),
}
const check = data => validateVerbConsolidation(data.manifest, data.sets, data.words, data.senses, data.receipt)
const copy = () => structuredClone(original)

describe('existing verb membership migration', () => {
  it('accounts for all 854 original words while preserving content, approvals and every published range position', () => {
    const result = check(original)
    expect(result.addedWords + result.coveredWords).toBe(854)
    expect(result.addedWords).toBe(503)
    expect(hashContent(original.words)).toBe(original.manifest.originalWordsHash)
    expect(hashContent(original.senses)).toBe(original.manifest.originalSensesHash)
    for (const [level, base] of Object.entries(original.manifest.baseMembership.byLevel)) {
      expect(original.receipt.byLevel[level].wordIds.slice(0, base.wordIds.length)).toEqual(base.wordIds)
      expect(original.receipt.byLevel[level].referenceIds).toEqual(base.referenceIds)
    }
  })
  it('rejects missing migration evidence and incomplete coverage', () => {
    const data = copy(); data.manifest.entries.pop()
    expect(() => check(data)).toThrow('every original word')
    expect(() => check({ ...original, manifest: null })).toThrow('Missing verb consolidation')
  })
  it('rejects content edits and changes to existing membership order', () => {
    const data = copy(); data.senses[0].examples[0].translation += ' edited'
    expect(() => check(data)).toThrow('content changed')
    const reordered = copy(); reordered.sets.find(set => set.id === 'jlpt-level-n5').wordIds.reverse()
    expect(() => check(reordered)).toThrow('reordered')
  })
  it('rejects unclassified words, removed additions and revived source menus', () => {
    const data = copy(); delete data.manifest.entries.find(entry => entry.action === 'add').level
    expect(() => check(data)).toThrow('unclassified')
    const removed = copy(); removed.receipt.byLevel.N4.consolidationIds.pop()
    expect(() => check(removed)).toThrow('incomplete')
    const revived = copy(); delete revived.sets.find(set => set.id === 'AbsoluteVerb').archived
    expect(() => check(revived)).toThrow('archived')
  })
  it('rejects a false exact match even when the target exists and its content hash is valid', () => {
    const data = copy()
    const duplicate = data.manifest.entries.find(entry => entry.matchType === 'exact-lexical-key')
    const other = data.words.find(word => word.id === data.manifest.baseMembership.byLevel.N1.wordIds[0])
    duplicate.targetWordId = other.id
    duplicate.targetHash = hashContent({ word: other, senses: data.senses.filter(sense => sense.wordId === other.id) })
    expect(() => check(data)).toThrow('false exact duplicate')
  })
})
