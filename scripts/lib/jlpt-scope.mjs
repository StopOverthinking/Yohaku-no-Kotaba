const levels = ['N5', 'N4', 'N3', 'N2', 'N1']

// Counts describe the final selection; reaching a provisional range is not approval.
export function evaluatePracticalScope(scope, snapshot) {
  if (scope?.schemaVersion !== 1 || scope.policy !== 'practical-coverage' || scope.rangeIsQuota !== false)
    throw new Error('Invalid practical vocabulary scope')
  const review = scope.finalSelection
  if (review === null) return { complete: false, finalCount: null }
  if (!review || review.outcome !== 'accepted' || review.model !== 'gpt-6-astra' || review.reasoningEffort !== 'high' ||
      !Number.isFinite(Date.parse(review.reviewedAt)) || review.sourceHash !== snapshot.sourceHash ||
      !Number.isInteger(review.uniqueWords) || review.uniqueWords !== snapshot.uniqueWords ||
      !Array.isArray(review.unresolvedGaps) || review.unresolvedGaps.length ||
      typeof review.selectionRationale !== 'string' || !review.selectionRationale.trim() ||
      levels.some(level => snapshot.byLevel[level] <= 0 ||
        review.byLevel?.[level]?.count !== snapshot.byLevel[level] ||
        typeof review.byLevel[level].coverageNote !== 'string' || !review.byLevel[level].coverageNote.trim()))
    throw new Error('Final practical coverage review is missing, incomplete or stale')
  return { complete: true, finalCount: review.uniqueWords }
}
