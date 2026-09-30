import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { writeGeneratedFile } from './write-generated-file.mjs'

let directory
beforeEach(async () => { directory = await fs.mkdtemp(path.resolve('output/jlpt/write-test-')) })
afterEach(async () => {
  vi.restoreAllMocks()
  for (const name of await fs.readdir(directory)) await fs.unlink(path.join(directory, name))
  await fs.rmdir(directory)
})

describe('generated file replacement', () => {
  it('does not rewrite identical files and replaces changed files completely', async () => {
    const file = path.join(directory, 'data.json')
    expect(await writeGeneratedFile(file, '{"value":1}\n')).toBe(true)
    const rename = vi.spyOn(fs, 'rename')
    expect(await writeGeneratedFile(file, '{"value":1}\n')).toBe(false)
    expect(rename).not.toHaveBeenCalled()
    expect(await writeGeneratedFile(file, '{"value":2}\n')).toBe(true)
    expect(await fs.readFile(file, 'utf8')).toBe('{"value":2}\n')
    expect(await fs.readdir(directory)).toEqual(['data.json'])
  })
  it('retries a sharing failure without truncating the old file', async () => {
    const file = path.join(directory, 'data.json')
    await fs.writeFile(file, 'previous')
    const rename = vi.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('sharing'), { code: 'UNKNOWN' }))
    expect(await writeGeneratedFile(file, 'replacement')).toBe(true)
    expect(rename).toHaveBeenCalledTimes(2)
    expect(await fs.readFile(file, 'utf8')).toBe('replacement')
  })
  it('keeps the original and removes temporary files if replacement remains blocked', async () => {
    const file = path.join(directory, 'data.json')
    await fs.writeFile(file, 'previous')
    vi.spyOn(fs, 'rename').mockRejectedValue(Object.assign(new Error('sharing'), { code: 'EBUSY' }))
    await expect(writeGeneratedFile(file, 'replacement')).rejects.toThrow('sharing')
    expect(await fs.readFile(file, 'utf8')).toBe('previous')
    expect(await fs.readdir(directory)).toEqual(['data.json'])
  })
})
