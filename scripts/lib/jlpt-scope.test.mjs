// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { evaluatePracticalScope } from './jlpt-scope.mjs'

const scope = { schemaVersion: 1, policy: 'practical-coverage', rangeIsQuota: false, provisionalRange: [6000, 8000], finalSelection: null }
const snapshot = { sourceHash: 'current-content', uniqueWords: 5750, byLevel: { N5: 500, N4: 600, N3: 1300, N2: 1500, N1: 1850 } }
const reviewed = () => ({ ...scope, finalSelection: {
  outcome: 'accepted', model: 'gpt-6-astra', reasoningEffort: 'high', reviewedAt: '2026-09-30T05:00:00Z',
  sourceHash: snapshot.sourceHash, uniqueWords: snapshot.uniqueWords, unresolvedGaps: [],
  selectionRationale: 'Remaining candidates have no material benefit for the reviewed learning scope.',
  byLevel: Object.fromEntries(Object.entries(snapshot.byLevel).map(([level, count]) => [level, { count, coverageNote: 'Coverage and omissions reviewed.' }])),
} })

describe('practical vocabulary completion', () => {
  it('never treats the provisional count range as completion', () => {
    expect(evaluatePracticalScope(scope, { ...snapshot, uniqueWords: 12000 }).complete).toBe(false)
  })
  it('allows a justified reviewed selection below the provisional range', () => {
    expect(evaluatePracticalScope(reviewed(), snapshot)).toEqual({ complete: true, finalCount: 5750 })
  })
  it('rejects stale content, counts and unreviewed level gaps', () => {
    expect(() => evaluatePracticalScope(reviewed(), { ...snapshot, sourceHash: 'changed' })).toThrow('stale')
    expect(() => evaluatePracticalScope(reviewed(), { ...snapshot, uniqueWords: 5751 })).toThrow('stale')
    const missing = reviewed(); delete missing.finalSelection.byLevel.N1
    expect(() => evaluatePracticalScope(missing, snapshot)).toThrow('incomplete')
    const gaps = reviewed(); gaps.finalSelection.unresolvedGaps = ['missing basic time expressions']
    expect(() => evaluatePracticalScope(gaps, snapshot)).toThrow('incomplete')
  })
})
