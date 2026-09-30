import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sha = process.env.GITHUB_SHA
if (!sha || !/^[a-f0-9]{40}$/.test(sha)) {
  throw new Error('A full GITHUB_SHA is required; a local working tree is not a deployed version.')
}
const index = await fs.readFile(path.join(root, 'dist/index.html'))
const progress = JSON.parse(await fs.readFile(path.join(root, 'content/jlpt/progress.json'), 'utf8'))
if (progress.issues.length) throw new Error('Unresolved vocabulary audit issues block the release manifest.')
if (progress.complete !== true) throw new Error('Current independent final vocabulary selection is required before release.')
const release = {
  schemaVersion: 1,
  commit: sha,
  builtAt: new Date().toISOString(),
  indexSha256: createHash('sha256').update(index).digest('hex'),
  vocabulary: {
    levelWords: progress.levelWords,
    newWords: progress.newWords,
    examples: progress.examples,
    expansionComplete: progress.complete,
  },
}
await fs.writeFile(path.join(root, 'dist/release.json'), JSON.stringify(release, null, 2) + '\n')
console.log(`Release manifest: ${sha} (${progress.levelWords} level words)`)
