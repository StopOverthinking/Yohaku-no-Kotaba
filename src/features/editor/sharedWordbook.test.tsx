import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WordbookEditorPage } from './WordbookEditorPage'

vi.mock('./editorData', async (importOriginal) => ({
  ...await importOriginal<typeof import('./editorData')>(),
  editorVocabularySets: [
    { id: 'level', name: 'N5 참조', order: 0, wordIdPrefix: 'Level', membershipMode: 'explicit', wordIds: ['b', 'a'] },
    { id: 'original', name: '원본', order: 1, wordIdPrefix: 'Original', wordIds: ['a', 'b'] },
  ],
  editorVocabularyWords: [
    { id: 'a', setId: 'original', japanese: '犬', reading: 'いぬ', meaning: '개', type: 'noun', difficulty: 10, verbInfo: null, sourceOrder: 0 },
    { id: 'b', setId: 'original', japanese: '猫', reading: 'ねこ', meaning: '고양이', type: 'noun', difficulty: 10, verbInfo: null, sourceOrder: 1 },
  ],
  editorLearnContent: [], editorThemeWordbooks: [], editorThemeWords: [],
  editorComparisonWordbooks: [], editorComparisonWords: [], editorComparisonPairs: [],
}))

function displayedWords() {
  return screen.getAllByRole('row').slice(1).map((row) => (within(row).getAllByRole('textbox')[0] as HTMLInputElement).value)
}

describe('shared basic wordbooks', () => {
  it('reorders and unlinks references without changing the original workbook', () => {
    render(<WordbookEditorPage />)
    expect(displayedWords()).toEqual(['猫', '犬'])
    fireEvent.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: '아래로' }))
    expect(displayedWords()).toEqual(['犬', '猫'])
    fireEvent.click(screen.getByDisplayValue('猫'))
    fireEvent.click(screen.getByRole('button', { name: '선택 단어 삭제' }))
    expect(displayedWords()).toEqual(['犬'])
    fireEvent.click(screen.getByRole('button', { name: /^원본/ }))
    expect(displayedWords()).toEqual(['犬', '猫'])
  })

  it('duplicates into the selected workbook and protects referenced originals', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<WordbookEditorPage />)
    fireEvent.click(screen.getByDisplayValue('猫'))
    fireEvent.click(screen.getByRole('button', { name: '선택 단어 복제' }))
    expect(displayedWords()).toEqual(['猫', '犬', '猫'])
    fireEvent.click(screen.getByRole('button', { name: /^원본/ }))
    expect(displayedWords()).toEqual(['犬', '猫'])
    fireEvent.click(screen.getByDisplayValue('犬'))
    fireEvent.click(screen.getByRole('button', { name: '선택 단어 삭제' }))
    expect(alert).toHaveBeenCalledWith('다른 단어장이 참조하는 단어는 삭제할 수 없습니다.')
    expect(displayedWords()).toEqual(['犬', '猫'])
    alert.mockRestore()
  })
})
