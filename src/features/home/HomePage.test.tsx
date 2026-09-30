import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it } from 'vitest'
import { HomePage } from './HomePage'

it('opens the only learning setup directly with no mode chooser', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/learn" element={<h1>학습 설정 도착</h1>} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.queryByText('동사 활용')).toBeNull()
  expect(screen.queryByText('시험 모드')).toBeNull()
  expect(screen.queryByText('게임 모드')).toBeNull()
  await user.click(screen.getByRole('button', { name: '학습' }))
  expect(screen.getByText('학습 설정 도착')).toBeInTheDocument()
})
