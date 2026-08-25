import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CheckoutModal from './CheckoutModal'

const apiMocks = vi.hoisted(() => ({
  respondToGrowthOffer: vi.fn(), createCart: vi.fn(), createCartQuote: vi.fn(),
  approveQuote: vi.fn(), createOrder: vi.fn(), getOrder: vi.fn(),
  loadRazorpayCheckout: vi.fn(), cancelOrder: vi.fn(), verifyCheckoutPayment: vi.fn(),
}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, email: 'buyer@example.test' } }) }))
vi.mock('../../services/api', async (importOriginal) => ({ ...(await importOriginal()), ...apiMocks }))

const product = {
  id: 41, name: 'Backend Keyboard', imageLabel: 'BK', price: 7499,
  merchant: { name: 'Scoped Shop' }, decisionId: 'd1', decisionToken: 'signed-decision-token-value', addOns: [],
}
const quote = {
  quote_id: '0c97cc89-4444-4d89-9714-12e51b275c29', total_amount: '7499.00', currency: 'INR',
  expires_at: new Date(Date.now() + 600000).toISOString(), status: 'ACTIVE',
  items: [{ product: 41, product_title: product.name, merchant_name: 'Scoped Shop', quantity: 1, line_total: '7499.00', explanation: 'Matches the live catalog facts.', trade_offs: ['Heavier frame'] }],
  policy_snapshot: { limits: { supported_currency: 'INR', max_item_quantity: 5, max_order_value: '100000.00' } },
}
const pendingOrder = {
  order_id: 'd81e34cc-a1e9-4321-9da3-e3fbf1752719', items: quote.items, total_amount: '7499.00', amount: 749900,
  currency: 'INR', status: 'PAYMENT_PENDING', cancellable: true, razorpay_order_id: 'order_test_1', key: 'rzp_test_public', refunds: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}

const renderCheckout = (props = {}) => render(<MemoryRouter><CheckoutModal product={product} onClose={vi.fn()} onOrderPlaced={vi.fn()} {...props} /></MemoryRouter>)
const reachQuote = async (user) => {
  await user.click(screen.getByRole('button', { name: /Generate exact quote/i }))
  expect(await screen.findByRole('heading', { name: 'Confirm the precise basket' })).toBeInTheDocument()
}
const approve = async (user) => {
  await user.click(screen.getByRole('checkbox', { name: /I approve this exact quote/i }))
  await user.click(screen.getByRole('button', { name: /Approve, reserve & pay/i }))
}

describe('approval-gated checkout', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
    apiMocks.respondToGrowthOffer.mockResolvedValue({ data: {} })
    apiMocks.createCart.mockResolvedValue({ data: { cart_id: 'cart-1' } })
    apiMocks.createCartQuote.mockResolvedValue({ data: quote })
    apiMocks.approveQuote.mockResolvedValue({ data: { approval_token: 'signed-approval-token' } })
    apiMocks.createOrder.mockResolvedValue({ data: pendingOrder })
    apiMocks.getOrder.mockResolvedValue({ data: pendingOrder })
    apiMocks.loadRazorpayCheckout.mockResolvedValue(undefined)
    window.Razorpay = vi.fn(function Razorpay() { this.on = vi.fn(); this.open = vi.fn() })
  })

  it('requires explicit exact-quote approval before creating a payment order', async () => {
    const user = userEvent.setup(); renderCheckout(); await reachQuote(user)
    expect(screen.getByRole('button', { name: /Approve, reserve & pay/i })).toBeDisabled()
    await approve(user)
    await waitFor(() => expect(apiMocks.approveQuote).toHaveBeenCalledOnce())
    expect(apiMocks.createOrder).toHaveBeenCalledOnce()
  })

  it('surfaces a deterministic policy block without opening Razorpay', async () => {
    apiMocks.createCartQuote.mockRejectedValue({ response: { data: { detail: 'Quantity exceeds the configured limit.', reason_code: 'QUANTITY_LIMIT_EXCEEDED' } } })
    const user = userEvent.setup(); renderCheckout()
    await user.click(screen.getByRole('button', { name: /Generate exact quote/i }))
    expect(await screen.findByText('Quantity exceeds the configured limit.')).toBeInTheDocument()
    expect(screen.getByText(/QUANTITY_LIMIT_EXCEEDED/)).toBeInTheDocument()
    expect(window.Razorpay).not.toHaveBeenCalled()
  })

  it('preserves the reviewed basket and offers a recoverable retry when checkout initialization fails', async () => {
    apiMocks.createOrder.mockRejectedValue({ response: { data: { detail: 'Payment provider is temporarily unavailable.', reason_code: 'PAYMENT_PROVIDER_ERROR' } } })
    const user = userEvent.setup(); renderCheckout(); await reachQuote(user); await approve(user)
    expect(await screen.findByText('Payment provider is temporarily unavailable.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Return to basket and retry' }))
    expect(screen.getByRole('heading', { name: 'Review quantity' })).toBeInTheDocument()
    expect(screen.getAllByText('Backend Keyboard')).toHaveLength(2)
  })

  it('shows success only after the authoritative order endpoint reports webhook-confirmed PAID', async () => {
    const paidOrder = { ...pendingOrder, status: 'PAID', cancellable: false, paid_at: new Date().toISOString() }
    apiMocks.getOrder.mockResolvedValue({ data: paidOrder })
    const placed = vi.fn()
    const user = userEvent.setup(); renderCheckout({ onOrderPlaced: placed }); await reachQuote(user); await approve(user)
    expect(await screen.findByRole('heading', { name: 'Payment verified' })).toBeInTheDocument()
    expect(placed).toHaveBeenCalledWith({ product, order: paidOrder })
  })
})
