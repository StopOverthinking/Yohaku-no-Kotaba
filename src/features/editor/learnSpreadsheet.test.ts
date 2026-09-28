import { describe, expect, it } from 'vitest'
import { buildEditorWorkbook, parseEditorWorkbook } from './editorSpreadsheet'
import { buildEditorFileOutputs, buildPublishedEditorSnapshot } from './editorSerializer'
import type { EditorSnapshot } from './editorData'
import { testSense } from '@/features/learn/contextTestFixtures'
import { versionLearnContent } from './learnContentVersions'
import { appendLearnSheets, parseLearnSheets } from './learnSpreadsheet'
import { learnContent } from '@/features/vocab/data/learnContent'

function snapshot(): EditorSnapshot {
  return {
    sets: [{ id: 'set', name: '테스트', order: 0, wordIds: ['stable-52', 'stable-3'] }],
    words: ['stable-52', 'stable-3'].map((id, i) => ({
      id,
      setId: 'set',
      japanese: '答える',
      reading: 'こたえる',
      meaning: '답하다',
      type: 'verb',
      difficulty: 30,
      verbInfo: null,
      sourceOrder: i,
    })),
    themeWords: [],
    themeWordbooks: [],
    comparisonWords: [],
    comparisonWordbooks: [],
    comparisonPairs: [],
    learnContent: [testSense('stable-52')],
  }
}

describe('sentence editing persistence', () => {
  it('round-trips the entire authored corpus without changing IDs or text', async () => {
    const xlsx = await import('xlsx')
    const workbook = xlsx.utils.book_new()
    appendLearnSheets(workbook, xlsx, learnContent)
    const bytes = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' })
    const restored = parseLearnSheets(xlsx.read(bytes, { type: 'array' }), xlsx)
    expect(restored).toEqual(learnContent)
  })
  it('preserves mastery for translation corrections and versions changed targets', () => {
    const before = testSense('stable-52')
    const translated = structuredClone(before)
    translated.examples[0].translation = '더 자연스러운 번역이다.'
    const typo = versionLearnContent([translated], [before])[0]
    expect(typo.version).toBe(1)
    expect(typo.examples[0].version).toBe(2)
    translated.examples[0].answer = '別の答え'
    expect(versionLearnContent([translated], [before])[0].version).toBe(2)
  })
  it('round-trips authored text, identity, versions and review metadata through xlsx', async () => {
    const data = snapshot()
    const buffer = await buildEditorWorkbook(data, { mode: 'basic', setId: 'set' })
    const result = await parseEditorWorkbook(buffer, 'basic')
    expect(result.learnContent).toEqual(data.learnContent)
    expect(result.words.map((w) => w.id)).toEqual(['stable-52', 'stable-3'])
  })

  it('increments versions on consecutive semantic saves within the same editor session', () => {
    const original = testSense('stable-52')
    const edit = structuredClone(original)
    edit.examples[0].answer = '変えた'
    const firstSave = versionLearnContent([edit], [original])[0]
    expect(firstSave.version).toBe(2)
    const secondEdit = structuredClone(firstSave)
    secondEdit.examples[0].answer = '直した'
    const secondSave = versionLearnContent([secondEdit], [firstSave])[0]
    expect(secondSave.version).toBe(3)
    expect(versionLearnContent([secondSave], [secondSave])[0].version).toBe(3)
  })

  it('keeps word and sense identity when rows move or another word is removed', () => {
    const data = snapshot()
    data.words[0].sourceOrder = 2
    const reordered = buildPublishedEditorSnapshot(data)
    expect(reordered.words.map((w) => w.id)).toEqual(['stable-3', 'stable-52'])
    expect(reordered.learnContent![0].wordId).toBe('stable-52')
    data.words = data.words.slice(0, 1)
    const outputs = buildEditorFileOutputs(data)
    const source = outputs.find((f) => f.path.at(-1) === 'learnContent.json')!
    expect(JSON.parse(source.content)).toEqual(data.learnContent)
    expect(outputs.find((f) => f.path.at(-1) === 'learnContent.ts')!.content).toContain('stable-52')
  })

  it('imports legacy workbooks without deleting the caller-owned sentence collection', async () => {
    const xlsx = await import('xlsx')
    const buffer = await buildEditorWorkbook(snapshot(), { mode: 'basic', setId: 'set' })
    const workbook = xlsx.read(buffer, { type: 'array' })
    workbook.SheetNames = workbook.SheetNames.filter((name) => !name.startsWith('learn_'))
    for (const name of Object.keys(workbook.Sheets))
      if (name.startsWith('learn_')) delete workbook.Sheets[name]
    const result = await parseEditorWorkbook(
      xlsx.write(workbook, { bookType: 'xlsx', type: 'array' }),
      'basic',
    )
    expect(result.learnContent).toBeUndefined()
  })

  it('rejects orphaned sentence references in an imported workbook', async () => {
    const xlsx = await import('xlsx')
    const buffer = await buildEditorWorkbook(snapshot(), { mode: 'basic', setId: 'set' })
    const workbook = xlsx.read(buffer, { type: 'array' })
    workbook.Sheets.learn_senses.B2 = { t: 's', v: 'missing-word' }
    await expect(
      parseEditorWorkbook(xlsx.write(workbook, { bookType: 'xlsx', type: 'array' }), 'basic'),
    ).rejects.toThrow('연결 단어 없음')
  })

  it('saves incomplete drafts without approving or publishing them for study', async () => {
    const data = snapshot()
    const sense = data.learnContent![0]
    sense.review = { word: false, contrast: false, diversity: false }
    sense.hint = ''
    sense.confusions = []
    sense.examples[0] = {
      ...sense.examples[0],
      before: '',
      after: '',
      answer: '',
      reading: '',
      translation: '',
      translationTarget: '',
      status: 'draft',
    }
    expect(() => buildEditorFileOutputs(data)).not.toThrow()
    const buffer = await buildEditorWorkbook(data, { mode: 'basic', setId: 'set' })
    const parsed = await parseEditorWorkbook(buffer, 'basic')
    expect(parsed.learnContent).toEqual(data.learnContent)
  })
})
