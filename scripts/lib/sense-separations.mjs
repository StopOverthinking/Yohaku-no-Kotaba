import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { hashContent } from './jlpt-pilot.mjs'

/** Use the runtime partition validator, and pin the correction to its complete authored source. */
export async function readSenseSeparations(root, senses) {
  const journal = JSON.parse(await fs.readFile(path.join(root, 'src/features/vocab/editor-data/senseSeparations.json'), 'utf8'))
  if (journal.schemaVersion !== 1 || !journal.authorization?.trim() || journal.review?.independent !== false ||
      !journal.review?.reviewedBy?.trim() || !journal.review?.notes?.length || !Array.isArray(journal.separations))
    throw new Error('Missing explicit sense-separation review')
  const byId = new Map(senses.map(sense => [sense.id, sense]))
  for (const row of journal.separations) {
    const sense = byId.get(row.sourceSenseId)
    if (!sense || hashContent(sense) !== row.sourceHash) throw new Error(`Stale sense-separation source: ${row.sourceSenseId}`)
    for (const equivalent of row.equivalentExamples ?? []) {
      const peer = byId.get(equivalent.sourceSenseId)
      if (!peer || peer.version !== equivalent.sourceVersion || hashContent(peer) !== equivalent.sourceHash ||
          !peer.examples.some(example => example.id === equivalent.exampleId))
        throw new Error(`Stale equivalent example source: ${equivalent.sourceSenseId}`)
    }
  }
  const source = await fs.readFile(path.join(root, 'src/features/learn/contextSenseSeparations.ts'), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  const { separateContextSenses } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  const separated = separateContextSenses(senses, journal.separations)
  if (separated.some(sense => sense.examples.length !== 1))
    throw new Error('Each learning usage must own exactly one reviewed representative example')
  return { rows: journal.separations, senses: separated }
}
