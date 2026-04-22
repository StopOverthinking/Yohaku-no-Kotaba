import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WordbookEditorPage } from '@/features/editor/WordbookEditorPage'
import * as editorPersistence from '@/features/editor/editorPersistence'

vi.mock('@/features/editor/editorPersistence', () => ({
  downloadBlobFile: vi.fn(),
  downloadTextFile: vi.fn(),
  ensureReadWritePermission: vi.fn(),
  getReadWritePermissionState: vi.fn(),
  loadSavedWorkspaceHandle: vi.fn(),
  pickWorkspaceDirectory: vi.fn(),
  saveWorkspaceHandle: vi.fn(),
  supportsDirectoryPicker: vi.fn(() => true),
  verifyWorkspaceDirectory: vi.fn(),
  writeTextFile: vi.fn(),
}))

function createDirectoryHandle(name = 'Yohaku-no-Kotaba') {
  return {
    kind: 'directory',
    name,
    queryPermission: vi.fn(),
    requestPermission: vi.fn(),
  } as unknown as FileSystemDirectoryHandle
}

describe('WordbookEditorPage workspace persistence', () => {
  beforeEach(() => {
    vi.mocked(editorPersistence.loadSavedWorkspaceHandle).mockResolvedValue(null)
    vi.mocked(editorPersistence.getReadWritePermissionState).mockResolvedValue('granted')
    vi.mocked(editorPersistence.ensureReadWritePermission).mockResolvedValue(true)
    vi.mocked(editorPersistence.pickWorkspaceDirectory).mockResolvedValue(null)
    vi.mocked(editorPersistence.verifyWorkspaceDirectory).mockResolvedValue(true)
    vi.mocked(editorPersistence.writeTextFile).mockResolvedValue(undefined)
    vi.mocked(editorPersistence.saveWorkspaceHandle).mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps the remembered workspace linked in the UI before permission is regranted', async () => {
    const rememberedHandle = createDirectoryHandle()

    vi.mocked(editorPersistence.loadSavedWorkspaceHandle).mockResolvedValue(rememberedHandle)
    vi.mocked(editorPersistence.getReadWritePermissionState).mockResolvedValue('prompt')

    render(<WordbookEditorPage />)

    await waitFor(() => {
      expect(screen.getByText('경로 기억됨')).toBeInTheDocument()
    })

    expect(editorPersistence.ensureReadWritePermission).not.toHaveBeenCalled()
    expect(editorPersistence.verifyWorkspaceDirectory).not.toHaveBeenCalled()
  })

  it('reuses the remembered workspace when saving without forcing a new pick', async () => {
    const user = userEvent.setup()
    const rememberedHandle = createDirectoryHandle()

    vi.mocked(editorPersistence.loadSavedWorkspaceHandle).mockResolvedValue(rememberedHandle)
    vi.mocked(editorPersistence.getReadWritePermissionState).mockResolvedValue('prompt')
    vi.mocked(editorPersistence.ensureReadWritePermission).mockResolvedValue(true)
    vi.mocked(editorPersistence.verifyWorkspaceDirectory).mockResolvedValue(true)

    render(<WordbookEditorPage />)

    await waitFor(() => {
      expect(screen.getByText('경로 기억됨')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '현재 프로젝트에 저장' }))

    await waitFor(() => {
      expect(editorPersistence.writeTextFile).toHaveBeenCalled()
    })

    expect(editorPersistence.ensureReadWritePermission).toHaveBeenCalledWith(rememberedHandle)
    expect(editorPersistence.pickWorkspaceDirectory).not.toHaveBeenCalled()
    expect(screen.getByText('프로젝트 반영 완료')).toBeInTheDocument()
  })

  it('writes the active wordbook updated date into exported files on save', async () => {
    const user = userEvent.setup()
    const rememberedHandle = createDirectoryHandle()

    vi.mocked(editorPersistence.loadSavedWorkspaceHandle).mockResolvedValue(rememberedHandle)
    vi.mocked(editorPersistence.getReadWritePermissionState).mockResolvedValue('granted')
    vi.mocked(editorPersistence.verifyWorkspaceDirectory).mockResolvedValue(true)

    render(<WordbookEditorPage />)

    await user.click(screen.getByRole('button', { name: '현재 프로젝트에 저장' }))

    await waitFor(() => {
      expect(editorPersistence.writeTextFile).toHaveBeenCalled()
    })

    const setsJsonWrite = vi.mocked(editorPersistence.writeTextFile).mock.calls.find(([, pathSegments]) =>
      pathSegments.join('/') === 'src/features/vocab/editor-data/vocabularySets.json')
    const themeWordbooksJsonWrite = vi.mocked(editorPersistence.writeTextFile).mock.calls.find(([, pathSegments]) =>
      pathSegments.join('/') === 'src/features/vocab/editor-data/themeWordbooks.json')
    const comparisonWordbooksJsonWrite = vi.mocked(editorPersistence.writeTextFile).mock.calls.find(([, pathSegments]) =>
      pathSegments.join('/') === 'src/features/vocab/editor-data/comparisonWordbooks.json')

    expect(setsJsonWrite?.[2]).toMatch(/"updatedAt":\s*"\d{4}-\d{2}-\d{2}T/)
    expect(themeWordbooksJsonWrite?.[2]).toMatch(/"updatedAt":\s*"\d{4}-\d{2}-\d{2}T/)
    expect(comparisonWordbooksJsonWrite?.[2]).toMatch(/"updatedAt":\s*"\d{4}-\d{2}-\d{2}T/)
  })
})
