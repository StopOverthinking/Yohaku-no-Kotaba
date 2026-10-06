import { resetContextStorage } from '@/test/contextStorage'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ReviewListPage } from './ReviewListPage'
import { useContextStore } from './contextStore'
import { contextSenses } from './contextContent'
import { localDay, profileKey, reviewProfile } from './contextEngine'

vi.mock('./contextContent', async () => {
  const { testSense } = await import('./contextTestFixtures')
  const senses = [testSense('a'), { ...testSense('a-second'), wordId: 'a' }, testSense('b')]
  return { contextSenses: senses, contextAliasGroups: [], contextWordMap: new Map([
    ['a', { japanese: '言葉', reading: 'ことば' }], ['b', { japanese: '本', reading: 'ほん' }],
  ]) }
})
vi.mock('./contextBrowserPersistence', async () => {
  const fixture = await import('@/test/contextStorage')
  return { browserContextPersistence: fixture.persistence }
})

beforeEach(async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function () { this.removeAttribute('open') } })
  await resetContextStorage()
  useContextStore.setState({ snapshot: null, ready: false, busy: false, lastResult: null, error: null })
  await useContextStore.getState().hydrate()
  const data = useContextStore.getState().data
  const profiles = Object.fromEntries(contextSenses.map(sense => [profileKey(sense), {
    ...reviewProfile(undefined, sense, sense.examples[0], true, false, localDay()), levelDay: localDay(),
  }]))
  // Save through the real repository on the next action; this also exercises atomic UI commits.
  useContextStore.setState({ data: { ...data, profiles } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('review word removal', () => {
  it('asks before deleting, defaults focus to cancel and preserves rows on cancel or Escape', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReviewListPage /></MemoryRouter>)
    const trigger = screen.getAllByRole('button', { name: '言葉 복습 삭제' })[0]
    await user.click(trigger)
    let dialog = screen.getByRole('alertdialog', { name: '정말 삭제할까요?' })
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: '삭제' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: '삭제' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getAllByRole('button', { name: '言葉 복습 삭제' })).toHaveLength(2)
    await user.click(trigger)
    dialog = screen.getByRole('alertdialog')
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(useContextStore.getState().data.excludedWordIds).toBeUndefined()
  })

  it('removes all usages of the word only on confirmation and preserves the exclusion after reload', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReviewListPage /></MemoryRouter>)
    const before = useContextStore.getState().data
    await user.click(screen.getAllByRole('button', { name: '言葉 복습 삭제' })[0])
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.queryByRole('button', { name: '言葉 복습 삭제' })).toBeNull()
    expect(screen.getByRole('button', { name: '本 복습 삭제' })).toBeVisible()
    expect(useContextStore.getState().data.profiles).toEqual(before.profiles)
    await act(async () => { await useContextStore.getState().hydrate() })
    expect(useContextStore.getState().data.excludedWordIds).toEqual(['a'])
    expect(screen.queryByRole('button', { name: '言葉 복습 삭제' })).toBeNull()
  })

  it('keeps the floating warning and rows when saving fails, then permits retry', async () => {
    const user = userEvent.setup()
    const remove = useContextStore.getState().removeReviewWord
    const failure = vi.fn(async () => false)
    useContextStore.setState({ removeReviewWord: failure })
    render(<MemoryRouter><ReviewListPage /></MemoryRouter>)
    await user.click(screen.getAllByRole('button', { name: '言葉 복습 삭제' })[0])
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '삭제' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('삭제하지 못했습니다')
    expect(screen.getAllByRole('button', { name: '言葉 복습 삭제' })).toHaveLength(2)
    await act(async () => { useContextStore.setState({ removeReviewWord: remove }) })
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })
})
