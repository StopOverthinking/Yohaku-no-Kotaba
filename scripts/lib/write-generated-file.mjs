import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

async function retrySharingFailure(operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation() }
    catch (error) {
      if (attempt >= 3 || !['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error
      await delay(50 * 2 ** attempt)
    }
  }
}

/** Keep the previous complete file until its replacement is ready. */
export async function writeGeneratedFile(file, content) {
  try { if (await retrySharingFailure(() => fs.readFile(file, 'utf8')) === content) return false }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  try {
    await retrySharingFailure(() => fs.writeFile(temporary, content, 'utf8'))
    await retrySharingFailure(() => fs.rename(temporary, file))
  } finally {
    await fs.unlink(temporary).catch(() => {})
  }
  return true
}
