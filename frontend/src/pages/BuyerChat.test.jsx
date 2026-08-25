import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NexoraProvider } from '../context/NexoraContext'
import BuyerChat from './BuyerChat'

const apiMocks = vi.hoisted(() => ({
  searchProducts: vi.fn(),
  getChatSessions: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  searchProducts: apiMocks.searchProducts,
  getChatSessions: apiMocks.getChatSessions,
}))

const renderBuyer = () => render(<MemoryRouter><NexoraProvider><BuyerChat /></NexoraProvider></MemoryRouter>)

describe('live buyer search', () => {
  beforeEach(() => apiMocks.searchProducts.mockReset())

  it('renders grounded backend recommendations and provider provenance', async () => {
    apiMocks.searchProducts.mockResolvedValue({ data: {
      conversation_id: '85ea43e5-26f3-4615-8422-1790901d7952',
      summary_reasoning: 'One live catalog product fits the stated budget.',
      provider_source: 'FALLBACK',
      recommendations: [{ product_id: 41, title: 'Backend Keyboard', merchant: 'Scoped Shop', price: '7499.00', stock_quantity: 3, reason: 'Matches budget and connectivity.', tradeoffs: ['Heavier frame'], decision_id: 'd1', decision_token: 'signed-decision-token-value' }],
      add_on_suggestions: [],
    } })
    const user = userEvent.setup()
    renderBuyer()
    const input = screen.getByLabelText('Shopping intent')
    await user.type(input, 'wireless keyboard under 8000')
    await user.click(screen.getByLabelText('Send shopping intent'))
    expect(await screen.findByText('Backend Keyboard')).toBeInTheDocument()
    expect(screen.getByText(/DETERMINISTIC RETRIEVAL/)).toBeInTheDocument()
    expect(apiMocks.searchProducts).toHaveBeenCalledWith('wireless keyboard under 8000', expect.any(AbortSignal), { conversationId: null, conversationToken: null })
  })

  it('makes a backend no-result response honest and actionable', async () => {
    apiMocks.searchProducts.mockResolvedValue({ data: { conversation_id: '85ea43e5-26f3-4615-8422-1790901d7952', summary_reasoning: 'No in-stock catalog product satisfies every constraint.', provider_source: 'FALLBACK', recommendations: [], add_on_suggestions: [] } })
    const user = userEvent.setup()
    renderBuyer()
    await user.type(screen.getByLabelText('Shopping intent'), 'impossible product')
    await user.click(screen.getByLabelText('Send shopping intent'))
    expect(await screen.findByText('No in-stock catalog product satisfies every constraint.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Broaden the request' }))
    await waitFor(() => expect(screen.getByLabelText('Shopping intent')).toHaveValue('Show me similar in-stock products with a broader budget'))
  })
})
