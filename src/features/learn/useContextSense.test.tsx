import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useContextSense } from './useContextSense'
import { loadContextSense } from './contextContent'
import { testSense } from './contextTestFixtures'
import type { LearnSense } from './contextTypes'
import { ContentLoadError } from './contentLoader'

vi.mock('./contextContent', () => ({ loadContextSense: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals() })

it('resets the browser module cache on download retry without modifying study state', async () => {
  const reload = vi.fn()
  vi.stubGlobal('location', { reload })
  vi.mocked(loadContextSense).mockRejectedValueOnce(new ContentLoadError())
  const page = renderHook(() => useContextSense('a'))
  await waitFor(() => expect(page.result.current.error).toContain('내려받지 못했습니다'))
  act(() => page.result.current.retry())
  expect(reload).toHaveBeenCalledTimes(1)
  expect(loadContextSense).toHaveBeenCalledTimes(1)
})

it('ignores late responses after the card changes and never presents the prior card while loading', async () => {
  let resolveOld!: (sense: LearnSense) => void
  let resolveNew!: (sense: LearnSense) => void
  vi.mocked(loadContextSense)
    .mockImplementation(() => new Promise(() => {}))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve }))
  const page = renderHook(({ id }) => useContextSense(id), { initialProps: { id: 'a' } })
  page.rerender({ id: 'b' })
  expect(page.result.current.sense).toBeUndefined()
  await act(async () => resolveNew(testSense('b')))
  await waitFor(() => expect(page.result.current.sense?.wordId).toBe('b'))
  await act(async () => resolveOld(testSense('a')))
  expect(page.result.current.sense?.wordId).toBe('b')
  page.rerender({ id: 'c' })
  expect(page.result.current.sense).toBeUndefined()
})
