import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'

vi.mock('@/lib/useShouldReduceEffects', () => ({
  useShouldReduceEffects: () => false,
}))

function RoutePage({ name, destination }: { name: 'home' | 'list'; destination: string }) {
  const navigate = useNavigate()

  return (
    <div data-testid={`${name}-page`}>
      {name}
      <button type="button" onClick={() => navigate(destination)}>
        navigate-{name}
      </button>
    </div>
  )
}

function renderApp(initialEntry: string) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<RoutePage name="home" destination="/list" />} />
          <Route path="list" element={<RoutePage name="list" destination="/" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('App route transitions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('replaces the list page immediately when returning home', async () => {
    renderApp('/list')

    expect(screen.getByTestId('list-page')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'navigate-list' }))

    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('list-page')).not.toBeInTheDocument()
  })

  it('does not animate the full list page when entering list mode', async () => {
    renderApp('/')

    expect(screen.getByTestId('home-page')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'navigate-home' }))

    await waitFor(() => {
      expect(screen.getByTestId('list-page')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument()
  })
})
