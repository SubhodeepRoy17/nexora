import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import SharedConversation from './SharedConversation'

const apiMocks = vi.hoisted(() => ({ getSharedChatSession: vi.fn() }))
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getSharedChatSession: apiMocks.getSharedChatSession,
}))

beforeEach(() => apiMocks.getSharedChatSession.mockReset())

it('renders a shared conversation without private account details', async () => {
  apiMocks.getSharedChatSession.mockResolvedValue({ data: {
    title: 'Keyboard search',
    messages: [
      { message_id: 'm1', role: 'USER', content: 'Find a quiet keyboard', metadata: {} },
      { message_id: 'm2', role: 'ASSISTANT', content: 'This one is a close match.', metadata: { recommendations: [{ product_id: 41, title: 'Quiet Keys', merchant: 'Nexora Store', price: '2499.00' }] } },
    ],
  } })

  render(
    <MemoryRouter initialEntries={['/share/88888888-8888-4888-8888-888888888888']}>
      <Routes><Route path="/share/:shareToken" element={<SharedConversation />} /></Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('heading', { name: 'Keyboard search' })).toBeInTheDocument()
  expect(screen.getByText('Find a quiet keyboard')).toBeInTheDocument()
  expect(screen.getByText('Quiet Keys')).toBeInTheDocument()
  expect(screen.queryByText(/buyer@example|provider source|agent session/i)).not.toBeInTheDocument()
})
