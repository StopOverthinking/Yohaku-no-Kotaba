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

describe('learning reset', () => {
  it('opens the floating warning, focuses cancel and preserves records on cancel, Escape or backdrop click', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReviewListPage /></MemoryRouter>)
    const before = useContextStore.getState().data
    const trigger = screen.getByRole('button', { name: '학습 기록 초기화' })
    await user.click(trigger)
    let dialog = screen.getByRole('alertdialog', { name: '정말 초기화하겠습니까?' })
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus()
    expect(useContextStore.getState().data).toBe(before)
    await user.tab()
    expect(within(dialog).getByRole('button', { name: '초기화' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    await user.click(trigger)
    dialog = screen.getByRole('alertdialog')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.click(trigger)
    fireEvent.click(screen.getByRole('alertdialog'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(useContextStore.getState().data).toBe(before)
    expect(screen.getAllByRole('button', { name: /복습 삭제$/ })).toHaveLength(3)
  })

  it('empties the list only after confirmation and keeps the reset after hydration', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReviewListPage /></MemoryRouter>)
    await user.type(screen.getByRole('textbox', { name: '복습 단어 검색' }), '言葉')
    await user.click(screen.getByRole('button', { name: '학습 기록 초기화' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '초기화' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByText('복습 예정인 단어가 없습니다.')).toBeVisible()
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(useContextStore.getState().data.level).toEqual({ value: 16, assessedWordIds: [] })
    await act(async () => { await useContextStore.getState().hydrate() })
    expect(useContextStore.getState().data.profiles).toEqual({})
    expect(screen.queryByRole('button', { name: /복습 삭제$/ })).toBeNull()
    // Completed or excluded records can exist even with no visible review rows.
    expect(screen.getByRole('button', { name: '학습 기록 초기화' })).toBeEnabled()
  })

  it('keeps the dialog and rows on failure, retries and blocks dismissal during a pending reset', async () => {
    const user = userEvent.setup()
    const reset = useContextStore.getState().resetLearning
    useContextStore.setState({ resetLearning: vi.fn(async () => false) })
    render(<MemoryRouter><ReviewListPage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '학습 기록 초기화' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '초기화' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('초기화하지 못했습니다')
    expect(screen.getAllByRole('button', { name: /복습 삭제$/ })).toHaveLength(3)
    await act(async () => { useContextStore.setState({ busy: true }) })
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '초기화' })).toBeDisabled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.click(dialog)
    expect(screen.getByRole('alertdialog')).toBe(dialog)
    await act(async () => { useContextStore.setState({ busy: false, resetLearning: reset }) })
    await user.click(within(dialog).getByRole('button', { name: '초기화' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('disables reset while learning storage is busy or unavailable', async () => {
    render(<MemoryRouter><ReviewListPage /></MemoryRouter>)
    await act(async () => { useContextStore.setState({ busy: true }) })
    expect(screen.getByRole('button', { name: '학습 기록 초기화' })).toBeDisabled()
    await act(async () => { useContextStore.setState({ busy: false, ready: false }) })
    expect(screen.getByRole('button', { name: '학습 기록 초기화' })).toBeDisabled()
  })
})
