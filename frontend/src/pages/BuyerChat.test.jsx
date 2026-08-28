import { render, screen, waitFor, within } from '@testing-library/react'
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
  renameChatSession: vi.fn(),
  shareChatSession: vi.fn(),
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
  renameChatSession: apiMocks.renameChatSession,
  shareChatSession: apiMocks.shareChatSession,
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

  it('types an example into the input and waits for an explicit send', async () => {
    const user = userEvent.setup()
    renderBuyer()
    const query = 'Quiet wireless keyboard under ₹8,000 for Mac'

    await user.click(screen.getByRole('button', { name: 'Example · quiet keyboard' }))

    expect(apiMocks.searchProducts).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Shopping intent')).not.toHaveValue(query)
    await waitFor(() => expect(screen.getByLabelText('Shopping intent')).toHaveValue(query), { timeout: 3000 })
    expect(screen.getByLabelText('Send shopping intent')).toBeEnabled()
    expect(apiMocks.searchProducts).not.toHaveBeenCalled()
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

  it('sorts recent chats by latest activity', async () => {
    authState.user = { id: 9, display_name: 'Buyer', email: 'buyer@example.test' }
    const older = { conversation_id: '11111111-1111-4111-8111-111111111111', title: 'Older chat', updated_at: '2026-08-20T10:00:00Z', messages: [] }
    const latest = { conversation_id: '22222222-2222-4222-8222-222222222222', title: 'Latest chat', updated_at: '2026-08-28T10:00:00Z', messages: [] }
    apiMocks.getChatSessions.mockResolvedValue({ data: { results: [older, latest] } })
    apiMocks.getChatSession.mockResolvedValue({ data: latest })
    const user = userEvent.setup()
    renderBuyer()

    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))
    await screen.findByText('Latest chat')
    const sidebar = screen.getByRole('complementary', { name: 'Buyer conversations' })
    const recentButtons = within(sidebar).getAllByRole('button', { name: /^(Latest|Older) chat$/ })
    expect(recentButtons[0]).toHaveTextContent('Latest chat')
    expect(recentButtons[1]).toHaveTextContent('Older chat')
  })

  it('moves an older chat to the top after the buyer continues it', async () => {
    authState.user = { id: 11, display_name: 'Buyer', email: 'buyer@example.test' }
    const older = { conversation_id: '11111111-1111-4111-8111-111111111111', title: 'Older chat', updated_at: '2026-08-20T10:00:00Z', messages: [] }
    const latest = { conversation_id: '22222222-2222-4222-8222-222222222222', title: 'Latest chat', updated_at: '2026-08-28T10:00:00Z', messages: [] }
    apiMocks.getChatSessions
      .mockResolvedValueOnce({ data: { results: [latest, older] } })
      .mockResolvedValueOnce({ data: { results: [{ ...older, updated_at: '2026-08-29T10:00:00Z' }, latest] } })
    apiMocks.getChatSession
      .mockResolvedValueOnce({ data: latest })
      .mockResolvedValueOnce({ data: older })
    apiMocks.searchProducts.mockResolvedValue({ data: { conversation_id: older.conversation_id, user_message_id: '99999999-9999-4999-8999-999999999999', assistant_message_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', summary_reasoning: 'Continuing the older search.', recommendations: [], add_on_suggestions: [] } })
    const user = userEvent.setup()
    renderBuyer()

    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'Older chat' }))
    await user.type(screen.getByLabelText('Shopping intent'), 'show another option')
    await user.click(screen.getByLabelText('Send shopping intent'))
    await screen.findByLabelText('Continuing the older search.')
    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))
    await waitFor(() => {
      const sidebar = screen.getByRole('complementary', { name: 'Buyer conversations' })
      const recentButtons = within(sidebar).getAllByRole('button', { name: /^(Latest|Older) chat$/ })
      expect(recentButtons[0]).toHaveTextContent('Older chat')
      expect(recentButtons[1]).toHaveTextContent('Latest chat')
    })
  })

  it('copies a sent message and resends an edited branch', async () => {
    const conversationId = '85ea43e5-26f3-4615-8422-1790901d7952'
    const firstMessageId = '33333333-3333-4333-8333-333333333333'
    apiMocks.searchProducts
      .mockResolvedValueOnce({ data: { conversation_id: conversationId, user_message_id: firstMessageId, assistant_message_id: '44444444-4444-4444-8444-444444444444', summary_reasoning: 'Here is the first answer.', recommendations: [], add_on_suggestions: [] } })
      .mockResolvedValueOnce({ data: { conversation_id: conversationId, user_message_id: '55555555-5555-4555-8555-555555555555', assistant_message_id: '66666666-6666-4666-8666-666666666666', summary_reasoning: 'Here is the revised answer.', recommendations: [], add_on_suggestions: [] } })
    const user = userEvent.setup()
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText')
    renderBuyer()

    await user.type(screen.getByLabelText('Shopping intent'), 'keyboard under 8000')
    await user.click(screen.getByLabelText('Send shopping intent'))
    await screen.findByLabelText('Here is the first answer.')
    await user.click(screen.getByRole('button', { name: 'Copy message' }))
    expect(clipboard).toHaveBeenCalledWith('keyboard under 8000')

    await user.click(screen.getByRole('button', { name: 'Edit message' }))
    const editor = screen.getByLabelText('Edit message')
    await user.clear(editor)
    await user.type(editor, 'quiet keyboard under 8000')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByLabelText('Here is the revised answer.')
    expect(apiMocks.searchProducts).toHaveBeenLastCalledWith('quiet keyboard under 8000', expect.any(AbortSignal), {
      conversationId,
      conversationToken: null,
      editMessageId: firstMessageId,
    })
    expect(screen.queryByText('Here is the first answer.')).not.toBeInTheDocument()
  })

  it('copies a public share link for the current signed-in chat', async () => {
    authState.user = { id: 10, display_name: 'Buyer', email: 'buyer@example.test' }
    const conversation = { conversation_id: '77777777-7777-4777-8777-777777777777', title: 'Shareable chat', updated_at: '2026-08-28T10:00:00Z', messages: [] }
    apiMocks.getChatSessions.mockResolvedValue({ data: { results: [conversation] } })
    apiMocks.getChatSession.mockResolvedValue({ data: conversation })
    apiMocks.shareChatSession.mockResolvedValue({ data: { share_token: '88888888-8888-4888-8888-888888888888' } })
    const user = userEvent.setup()
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText')
    renderBuyer()

    const share = await screen.findByRole('button', { name: 'Share current chat' })
    await user.click(share)
    await screen.findByRole('button', { name: 'Share link copied' })
    expect(apiMocks.shareChatSession).toHaveBeenCalledWith(conversation.conversation_id)
    expect(clipboard).toHaveBeenCalledWith(`${window.location.origin}/share/88888888-8888-4888-8888-888888888888`)
  })

  it('searches saved chats from the sidebar search control', async () => {
    authState.user = { id: 12, display_name: 'Buyer', email: 'buyer@example.test' }
    const deskChat = { conversation_id: '11111111-1111-4111-8111-111111111111', title: 'Ergonomic Desk Setup', updated_at: '2026-08-28T10:00:00Z', last_message_preview: 'A quiet keyboard would work well.', messages: [] }
    const keyboardChat = { conversation_id: '22222222-2222-4222-8222-222222222222', title: 'Quiet Coding Keyboard', updated_at: '2026-08-27T10:00:00Z', last_message_preview: 'Here are three options.', messages: [] }
    apiMocks.getChatSessions.mockImplementation((signal, query) => Promise.resolve({
      data: { results: query ? [keyboardChat] : [deskChat, keyboardChat] },
    }))
    apiMocks.getChatSession.mockResolvedValue({ data: deskChat })
    const user = userEvent.setup()
    renderBuyer()

    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))
    await user.click(screen.getByRole('button', { name: 'Search chats' }))
    const search = screen.getByPlaceholderText('Search chats')
    await user.type(search, 'keyboard')

    await waitFor(() => expect(apiMocks.getChatSessions).toHaveBeenLastCalledWith(expect.any(AbortSignal), 'keyboard'))
    const dialog = screen.getByRole('dialog', { name: 'Search chats' })
    expect(await within(dialog).findByText('Quiet Coding Keyboard')).toBeInTheDocument()
    expect(within(dialog).queryByText('Ergonomic Desk Setup')).not.toBeInTheDocument()
  })

  it('renames a saved chat and keeps the new name in recent searches', async () => {
    authState.user = { id: 13, display_name: 'Buyer', email: 'buyer@example.test' }
    const conversation = { conversation_id: '33333333-3333-4333-8333-333333333333', title: 'Keyboard Search', updated_at: '2026-08-28T10:00:00Z', messages: [] }
    apiMocks.getChatSessions.mockResolvedValue({ data: { results: [conversation] } })
    apiMocks.getChatSession.mockResolvedValue({ data: conversation })
    apiMocks.renameChatSession.mockResolvedValue({ data: { ...conversation, title: 'My Coding Setup' } })
    const user = userEvent.setup()
    renderBuyer()

    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'Rename Keyboard Search' }))
    const name = screen.getByLabelText('Chat name')
    await user.clear(name)
    await user.type(name, 'My Coding Setup')
    await user.click(screen.getByRole('button', { name: 'Save chat name' }))

    await waitFor(() => expect(apiMocks.renameChatSession).toHaveBeenCalledWith(conversation.conversation_id, 'My Coding Setup'))
    expect(screen.getByRole('button', { name: 'My Coding Setup' })).toBeInTheDocument()
  })
})
