import { resetContextStorage, getTestRepository, persistence } from '@/test/contextStorage'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ContextSessionPage } from './ContextSessionPage'
import { useContextStore } from './contextStore'
import { loadContextSense } from './contextContent'

vi.mock('./contextContent', async () => {
  const { testSense } = await import('./contextTestFixtures')
  const senses = [testSense('a'), testSense('b')]
  return {
    loadContextSense: vi.fn(async (id: string) => senses.find((sense) => sense.id === id)!),
    contextSenses: senses, contextAliasGroups: [], contextAliasCatalog: { resolveWordId: (id: string) => id },
    contextSenseMap: new Map(senses.map((s) => [s.id, s])),
    contextWordMap: new Map(['a', 'b'].map((id) => [id, { id, japanese: '答える', reading: 'こたえる' }])),
  }
})
const options = {
  setId: 'all',
  setName: '테스트',
  candidateWordIds: ['a', 'b'],
  requiredWordIds: [],
  wordCount: 2,
  allowEarly: false,
}
const renderPage = async () => {
  const view = render(
    <MemoryRouter>
      <ContextSessionPage />
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: '뉘앙스 힌트' })
  return view
}

describe('context card', () => {
  beforeEach(async () => {
    await resetContextStorage()
    useContextStore.setState({ snapshot: null, ready: false, busy: false, error: null, lastResult: null })
    await useContextStore.getState().hydrate()
    await useContextStore.getState().start(options)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('does not put either answer or reading into DOM before reveal; hint is independent', async () => {
    const { container } = await renderPage()
    expect(container.innerHTML).not.toContain('答えた')
    expect(container.innerHTML).not.toContain('こたえた')
    expect(container.innerHTML).not.toContain('答える')
    await interact(() => fireEvent.click(screen.getByRole('button', { name: '뉘앙스 힌트' })))
    expect(screen.getByText('문맥으로 구별하는 테스트 힌트입니다.')).toBeVisible()
    expect(container.innerHTML).not.toContain('答えた')
    await interact(() => fireEvent.click(screen.getByRole('button', { name: /^문장 정답 공개/ })))
    expect(screen.getByText('答える')).toBeVisible()
    expect(screen.getByText('こたえた')).toBeVisible()
    expect(screen.getByText('こたえる')).toBeVisible()
    expect(screen.getByText('문맥으로 구별하는 테스트 힌트입니다.')).toBeVisible()
  })

  it('records voluntary judgement without requiring reveal and ignores double click', async () => {
    await renderPage()
    const button = screen.getByRole('button', { name: '모름' })
    await interact(() => fireEvent.click(button))
    await interact(() => fireEvent.click(button))
    expect(useContextStore.getState().data.session!.decisions).toBe(1)
    expect(useContextStore.getState().data.session!.retry).toHaveLength(1)
    expect(useContextStore.getState().data.session!.revealed).toBe(false)
  })

  it('retains hint usage even when hidden, and restores reveal/hint after reloading', async () => {
    const page = await renderPage()
    await interact(() => fireEvent.click(screen.getByRole('button', { name: '뉘앙스 힌트' })))
    await interact(() => fireEvent.click(screen.getByRole('button', { name: '뉘앙스 힌트' })))
    await interact(() => fireEvent.click(screen.getByRole('button', { name: /^문장 정답 공개/ })))
    page.unmount()
    await act(async () => {
      await useContextStore.getState().hydrate()
    })
    await renderPage()
    expect(screen.getByText('答える')).toBeVisible()
    expect(screen.queryByText('문맥으로 구별하는 테스트 힌트입니다.')).not.toBeInTheDocument()
    await interact(() => fireEvent.keyDown(window, { key: 'ArrowLeft' }))
    const stats = Object.values(useContextStore.getState().data.profiles)[0].examples
    expect(Object.values(stats)[0].hints).toBe(1)
  })

  it('keeps the current card visible when the learning database fails', async () => {
    await renderPage()
    const current = useContextStore.getState().data.session!.current
    vi.spyOn(persistence, 'save').mockImplementation(async () => {
      throw new Error('quota')
    })
    await interact(() => fireEvent.click(screen.getByRole('button', { name: '앎' })))
    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했습니다')
    expect(useContextStore.getState().data.session!.current).toEqual(current)
  })

  it('preserves the saved session on download failure and retries without recording unseen answers', async () => {
    const before = structuredClone(useContextStore.getState().data)
    vi.mocked(loadContextSense).mockRejectedValueOnce(new Error('연결 실패'))
    render(<MemoryRouter><ContextSessionPage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('연결 실패')
    await interact(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' })
      fireEvent.keyDown(window, { key: ' ' })
    })
    expect(useContextStore.getState().data).toEqual(before)
    fireEvent.click(screen.getByRole('button', { name: '예문 다시 불러오기' }))
    await screen.findByRole('button', { name: '뉘앙스 힌트' })
    expect(useContextStore.getState().data).toEqual(before)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps arrow judgement available after clicking a hint or revealing the answer', async () => {
    await renderPage()
    const hint = screen.getByRole('button', { name: '뉘앙스 힌트' })
    hint.focus()
    await interact(() => fireEvent.click(hint))
    await interact(() => fireEvent.keyDown(hint, { key: 'ArrowRight' }))
    expect(useContextStore.getState().data.session!.decisions).toBe(1)
  })

  it('restores complete judgement state with previous card after pagehide', async () => {
    await renderPage()
    await interact(() => fireEvent.click(screen.getByRole('button', { name: /^문장 정답 공개/ })))
    const before = structuredClone(useContextStore.getState().data)
    await interact(() => fireEvent.keyDown(window, { key: 'ArrowRight' }))
    fireEvent(window, new Event('pagehide'))
    expect(JSON.parse(await getTestRepository().exportRaw()).session.decisions).toBe(1)
    await interact(() => fireEvent.click(screen.getByRole('button', { name: '이전 카드' })))
    expect(useContextStore.getState().data.session).toEqual(before.session)
    expect(useContextStore.getState().data.profiles).toEqual(before.profiles)
  })
})

vi.mock('./contextBrowserPersistence', async () => {
  const fixture = await import('@/test/contextStorage')
  return { browserContextPersistence: fixture.persistence, getBrowserBackupCoordinator: fixture.getTestCoordinator }
})

async function interact(action: () => void) {
  await act(async () => { action(); await vi.waitFor(() => expect(useContextStore.getState().busy).toBe(false)) })
}
