import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ContextSessionPage } from './ContextSessionPage'
import { CONTEXT_STORAGE_KEY, useContextStore } from './contextStore'

vi.mock('./contextContent', async () => {
  const { testSense } = await import('./contextTestFixtures')
  const senses = [testSense('a'), testSense('b')]
  return {
    contextSenses: senses,
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
const renderPage = () =>
  render(
    <MemoryRouter>
      <ContextSessionPage />
    </MemoryRouter>,
  )

describe('context card', () => {
  beforeEach(() => {
    localStorage.clear()
    useContextStore.setState({ loadedRaw: null, error: null, lastResult: null })
    useContextStore.getState().hydrate()
    useContextStore.getState().start(options)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('does not put either answer or reading into DOM before reveal; hint is independent', () => {
    const { container } = renderPage()
    expect(container.innerHTML).not.toContain('答えた')
    expect(container.innerHTML).not.toContain('こたえた')
    expect(container.innerHTML).not.toContain('答える')
    fireEvent.click(screen.getByRole('button', { name: '뉘앙스 힌트' }))
    expect(screen.getByText('문맥으로 구별하는 테스트 힌트입니다.')).toBeVisible()
    expect(container.innerHTML).not.toContain('答えた')
    fireEvent.click(screen.getByRole('button', { name: /^문장 정답 공개/ }))
    expect(screen.getByText('答える')).toBeVisible()
    expect(screen.getByText('こたえた')).toBeVisible()
    expect(screen.getByText('こたえる')).toBeVisible()
    expect(screen.getByText('문맥으로 구별하는 테스트 힌트입니다.')).toBeVisible()
  })

  it('records voluntary judgement without requiring reveal and ignores double click', () => {
    renderPage()
    const button = screen.getByRole('button', { name: '모름' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(useContextStore.getState().data.session!.decisions).toBe(1)
    expect(useContextStore.getState().data.session!.retry).toHaveLength(1)
    expect(useContextStore.getState().data.session!.revealed).toBe(false)
  })

  it('retains hint usage even when hidden, and restores reveal/hint after reloading', () => {
    const page = renderPage()
    fireEvent.click(screen.getByRole('button', { name: '뉘앙스 힌트' }))
    fireEvent.click(screen.getByRole('button', { name: '뉘앙스 힌트' }))
    fireEvent.click(screen.getByRole('button', { name: /^문장 정답 공개/ }))
    page.unmount()
    act(() => {
      useContextStore.getState().hydrate()
    })
    renderPage()
    expect(screen.getByText('答える')).toBeVisible()
    expect(screen.queryByText('문맥으로 구별하는 테스트 힌트입니다.')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    const stats = Object.values(useContextStore.getState().data.profiles)[0].examples
    expect(Object.values(stats)[0].hints).toBe(1)
  })

  it('keeps the current card visible when local storage fails', () => {
    renderPage()
    const current = useContextStore.getState().data.session!.current
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    fireEvent.click(screen.getByRole('button', { name: '앎' }))
    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했습니다')
    expect(useContextStore.getState().data.session!.current).toEqual(current)
  })

  it('keeps arrow judgement available after clicking a hint or revealing the answer', () => {
    renderPage()
    const hint = screen.getByRole('button', { name: '뉘앙스 힌트' })
    hint.focus()
    fireEvent.click(hint)
    fireEvent.keyDown(hint, { key: 'ArrowRight' })
    expect(useContextStore.getState().data.session!.decisions).toBe(1)
  })

  it('restores complete judgement state with previous card after pagehide', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^문장 정답 공개/ }))
    const before = structuredClone(useContextStore.getState().data)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent(window, new Event('pagehide'))
    expect(JSON.parse(localStorage.getItem(CONTEXT_STORAGE_KEY)!).session.decisions).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '이전 카드' }))
    expect(useContextStore.getState().data.session).toEqual(before.session)
    expect(useContextStore.getState().data.profiles).toEqual(before.profiles)
  })
})
