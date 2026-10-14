// @vitest-environment node
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { scanHintConfusions, meaningFragments } from './hint-confusion-scan.mjs'

test('parenthetical objects are not split into independent definitions', () => {
  assert.deepEqual(meaningFragments('쓰다 (안경, 모자), 적다'), ['쓰다', '적다'])
})

test('na-adjective normalization does not strip the reading of 無駄', () => {
  const word = { id: 'a', japanese: '無駄', reading: 'むだ', meaning: '쓸데없음', type: 'na_adj' }
  const sense = { id: 'a-sense', wordId: 'a', version: 1, meaning: word.meaning, hint: '필요 없는 상태', confusions: [] }
  const scan = scanHintConfusions([word], [sense], [])
  assert.equal(scan.nodes[0].reading, 'むだ')
})
