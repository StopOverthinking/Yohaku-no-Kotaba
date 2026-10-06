import { test } from 'vitest'
import assert from 'node:assert/strict'
import { rankHintLabels } from './hint-confusion-ranking.mjs'

const node = { id: 'sense', meaning: '의견', comparisons: [] }
test('current meaning overlap precedes frequency among reviewed comparisons', () => {
  const targets = new Map([
    ['意見', [{ meaning: '의견', frequencyRank: 30 }]],
    ['計画', [{ meaning: '계획', commonPriority: true, frequencyRank: 1 }]],
  ])
  assert.deepEqual(rankHintLabels(node, ['計画', '意見'], targets), ['意見', '計画'])
})
test('common priority and frequency break ties between similarly close comparisons', () => {
  const targets = new Map([
    ['一般語', [{ meaning: '의견', commonPriority: true, frequencyRank: 4 }]],
    ['専門語', [{ meaning: '의견', frequencyRank: 1 }]],
    ['次点', [{ meaning: '의견', commonPriority: true, frequencyRank: 20 }]],
  ])
  assert.deepEqual(rankHintLabels(node, ['専門語', '次点', '一般語'], targets), ['一般語', '次点', '専門語'])
})
test('editorial current-sense preferences take precedence and must reference reviewed candidates', () => {
  const targets = new Map([['別', [{ meaning: '의견', commonPriority: true, frequencyRank: 1 }]]])
  assert.deepEqual(rankHintLabels(node, ['別', '優先'], targets, ['優先']), ['優先', '別'])
  assert.throws(() => rankHintLabels(node, ['別'], targets, ['未検討']), /not available/)
})
