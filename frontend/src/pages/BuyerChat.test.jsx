import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NexoraProvider } from '../context/NexoraContext'
import BuyerChat from './BuyerChat'

const apiMocks = vi.hoisted(() => ({
  searchProducts: vi.fn(),
  getChatSessions: vi.fn(),
  getChatSession: vi.fn(),
  deleteChatSession: vi.fn(),
  getOrders: vi.fn(),
}))
const authState = vi.hoisted(() => ({ user: null, signOut: vi.fn() }))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: authState.user, loading: false, signOut: authState.signOut }) }))
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  searchProducts: apiMocks.searchProducts,
  getChatSessions: apiMocks.getChatSessions,
  getChatSession: apiMocks.getChatSession,
  deleteChatSession: apiMocks.deleteChatSession,
  getOrders: apiMocks.getOrders,
}))

const renderBuyer = () => render(<MemoryRouter><NexoraProvider><BuyerChat /></NexoraProvider></MemoryRouter>)

describe('live buyer search', () => {
  beforeEach(() => {
    authState.user = null
    authState.signOut.mockReset()
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
    apiMocks.getOrders.mockResolvedValue({ data: { results: [] } })
  })

  it('renders grounded recommendations without a technical match-status line', async () => {
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
    expect(screen.queryByText(/current matches|Details checked/i)).not.toBeInTheDocument()
    expect(apiMocks.searchProducts).toHaveBeenCalledWith('wireless keyboard under 8000', expect.any(AbortSignal), { conversationId: null, conversationToken: null })
  })

  it('makes a backend no-result response honest and actionable', async () => {
    const reply = 'No active keyboard is available under ₹100. The least expensive current keyboard costs ₹2,499.'
    apiMocks.searchProducts.mockResolvedValue({ data: { conversation_id: '85ea43e5-26f3-4615-8422-1790901d7952', summary_reasoning: reply, suggested_query: 'Find a keyboard under ₹2,499', provider_source: 'FALLBACK', recommendations: [], add_on_suggestions: [] } })
    const user = userEvent.setup()
    renderBuyer()
    await user.type(screen.getByLabelText('Shopping intent'), 'impossible product')
    await user.click(screen.getByLabelText('Send shopping intent'))
    const animatedReply = await screen.findByLabelText(reply)
    expect(animatedReply).toHaveClass('buyer-response-typing')
    await waitFor(() => expect(animatedReply).not.toHaveClass('buyer-response-typing'), { timeout: 3000 })
    expect(animatedReply).toHaveTextContent(reply)
    await user.click(screen.getByRole('button', { name: 'Try the suggested search' }))
    await waitFor(() => expect(screen.getByLabelText('Shopping intent')).toHaveValue('Find a keyboard under ₹2,499'))
  })

  it('renders a conversational greeting without a catalog retry action', async () => {
    apiMocks.searchProducts.mockResolvedValue({ data: { conversation_id: '85ea43e5-26f3-4615-8422-1790901d7952', summary_reasoning: 'Hey! What are you hoping to find today?', turn_type: 'GREETING', recommendations: [], add_on_suggestions: [] } })
    const user = userEvent.setup()
    renderBuyer()
    await user.type(screen.getByLabelText('Shopping intent'), 'Hi')
    await user.click(screen.getByLabelText('Send shopping intent'))
    expect(await screen.findByLabelText('Hey! What are you hoping to find today?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try the suggested search' })).not.toBeInTheDocument()
  })

  it('deletes a signed-in buyer chat from recent searches', async () => {
    authState.user = { id: 7, display_name: 'Buyer', email: 'buyer@example.test' }
    const conversation = {
      conversation_id: '85ea43e5-26f3-4615-8422-1790901d7952',
      title: 'Quiet keyboard search',
      updated_at: new Date().toISOString(),
      messages: [],
    }
    apiMocks.getChatSessions.mockResolvedValue({ data: { results: [conversation] } })
    apiMocks.getChatSession.mockResolvedValue({ data: conversation })
    apiMocks.deleteChatSession.mockResolvedValue({ status: 204 })
    const user = userEvent.setup()
    renderBuyer()

    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))
    const remove = await screen.findByRole('button', { name: 'Delete Quiet keyboard search chat history' })
    await user.click(remove)
    await waitFor(() => expect(apiMocks.deleteChatSession).toHaveBeenCalledWith(conversation.conversation_id))
    expect(screen.queryByText('Quiet keyboard search')).not.toBeInTheDocument()
  })

  it('toggles the conversation sidebar and identifies the signed-in buyer', async () => {
    authState.user = { id: 8, display_name: 'Soumyadip Roy', email: 'soumya@example.test' }
    apiMocks.getChatSessions.mockResolvedValue({ data: { results: [] } })
    const user = userEvent.setup()
    renderBuyer()

    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(screen.getByRole('link', { name: 'Nexora home' })).toHaveTextContent('NEXORA')
    expect(screen.getByRole('link', { name: 'Nexora home' })).toHaveAttribute('href', '/')
    await screen.findByText('No saved searches yet.')
    const account = screen.getByRole('button', { name: 'Open account menu for Soumyadip Roy' })
    expect(account).toHaveTextContent('SR')
    await user.click(account)
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(authState.signOut).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Close sidebar' }))
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(screen.getByRole('button', { name: 'Close sidebar' })).toBeInTheDocument()
  })
})
