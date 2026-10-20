// @vitest-environment node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readSenseSeparations } from './sense-separations.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const content = JSON.parse(await fs.readFile(path.join(root, 'src/features/vocab/editor-data/learnContent.json'), 'utf8'))

describe('reviewed learning sense separation', () => {
  it('covers every original example once, adds independent meanings and leaves the approved source immutable', async () => {
    const before = JSON.stringify(content)
    const result = await readSenseSeparations(root, content)
    expect(result.senses).toHaveLength(content.reduce((count, sense) => count + sense.examples.length, 0))
    expect(result.senses.every(sense => sense.examples.length === 1)).toBe(true)
    expect(result.rows).toHaveLength(content.filter(sense => sense.examples.length > 1).length)
    const original = content.find(sense => sense.id === result.rows[0].sourceSenseId)
    const usages = result.senses.filter(sense => sense.wordId === original.wordId)
    expect(usages.map(sense => sense.meaning)).toEqual(['그녀', '여자친구'])
    expect(usages.flatMap(sense => sense.examples)).toEqual(original.examples)
    expect(JSON.stringify(content)).toBe(before)
  })
  it('rejects a changed version, translation, hint or membership even if an ID still matches', async () => {
    for (const edit of [
      sense => { sense.version++ },
      sense => { sense.examples[1].translation = '달라진 번역' },
      sense => { sense.hint += ' 다른 설명' },
      sense => { sense.examples.reverse() },
    ]) {
      const changed = structuredClone(content)
      edit(changed.find(sense => sense.id === 'sense-lex-jmdict-1483150-1'))
      await expect(readSenseSeparations(root, changed)).rejects.toThrow('Stale sense-separation source')
    }
  })
  it('rejects a new multi-example source without explicit representative ownership and a stale alias source', async () => {
    const extra = structuredClone(content.find(sense => sense.examples.length > 1))
    extra.id = 'unreviewed-extra'
    await expect(readSenseSeparations(root, [...content, extra])).rejects.toThrow('exactly one')
    const changed = structuredClone(content)
    changed.find(sense => sense.id === 'sense-AbsoluteVerb_461-1').examples[0].translation += ' 변경'
    await expect(readSenseSeparations(root, changed)).rejects.toThrow('Stale equivalent example source')
  })
})
