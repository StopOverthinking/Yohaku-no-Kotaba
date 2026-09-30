import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LearnResultPage } from './LearnResultPage'
import { useContextStore } from './contextStore'

afterEach(cleanup)
it('stays on home when the exiting result page remains mounted during animation', async () => {
  useContextStore.setState({ lastResult: { setId: 'jlpt-level-n5', setName: 'N5', totalTargetCount: 1,
    rounds: 1, revisitedCount: 0, favoriteCount: 0, completedAt: '2026-09-29', score: { before: 10, after: 14, completedAt: '2026-09-29' } } })
  render(<MemoryRouter initialEntries={['/learn/result']}>
    <LearnResultPage />
    <Routes>
      <Route path="/" element={<p>home destination</p>} />
      <Route path="/learn" element={<p>setup destination</p>} />
      <Route path="/learn/result" element={<p>result destination</p>} />
    </Routes>
  </MemoryRouter>)
  await userEvent.setup().click(screen.getByRole('button', { name: '홈으로 이동' }))
  expect(await screen.findByText('home destination')).toBeInTheDocument()
  expect(screen.queryByText('setup destination')).not.toBeInTheDocument()
  expect(useContextStore.getState().lastResult).toBeNull()
})
