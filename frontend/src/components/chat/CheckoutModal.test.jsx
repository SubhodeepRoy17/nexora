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
  await user.click(screen.getByRole('button', { name: /See final total/i }))
  expect(await screen.findByRole('heading', { name: 'Review and approve' })).toBeInTheDocument()
}
const approve = async (user) => {
  await user.click(screen.getByRole('checkbox', { name: /I approve/i }))
  await user.click(screen.getByRole('button', { name: /Approve & pay/i }))
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
    const user = userEvent.setup(); renderCheckout()
    expect(screen.getByLabelText('Basket, current step')).toHaveAttribute('aria-current', 'step')
    await reachQuote(user)
    expect(screen.getByLabelText('Basket, completed').querySelector('[data-step-state="complete"]')).toHaveClass('bg-emerald-600')
    expect(screen.getByLabelText('Review, current step')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: /Approve & pay/i })).toBeDisabled()
    await approve(user)
    await waitFor(() => expect(apiMocks.approveQuote).toHaveBeenCalledOnce())
    expect(apiMocks.createOrder).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Review, completed').querySelector('[data-step-state="complete"]')).toHaveClass('bg-emerald-600')
    expect(screen.getByLabelText('Pay, current step')).toHaveAttribute('aria-current', 'step')
  })

  it('sizes the desktop overlay to the shared workspace sidebar state', () => {
    const { rerender } = renderCheckout({ sidebarOpen: true })
    expect(screen.getByRole('dialog').parentElement).toHaveAttribute('data-sidebar-state', 'expanded')
    expect(screen.getByRole('dialog').parentElement).toHaveClass('lg:left-[288px]')

    rerender(<MemoryRouter><CheckoutModal product={product} onClose={vi.fn()} onOrderPlaced={vi.fn()} sidebarOpen={false} /></MemoryRouter>)
    expect(screen.getByRole('dialog').parentElement).toHaveAttribute('data-sidebar-state', 'collapsed')
    expect(screen.getByRole('dialog').parentElement).toHaveClass('lg:left-[72px]')
  })

  it('shows a loading state inside the active progress step', async () => {
    let releaseCart
    apiMocks.createCart.mockReturnValue(new Promise((resolve) => { releaseCart = resolve }))
    const user = userEvent.setup(); renderCheckout()

    await user.click(screen.getByRole('button', { name: /See final total/i }))
    const activeReview = screen.getByLabelText('Review, current step')
    expect(activeReview.querySelector('.animate-spin')).toBeInTheDocument()

    releaseCart({ data: { cart_id: 'cart-1' } })
    expect(await screen.findByRole('heading', { name: 'Review and approve' })).toBeInTheDocument()
    expect(screen.getByLabelText('Review, current step').querySelector('.animate-spin')).not.toBeInTheDocument()
  })

  it('surfaces a deterministic policy block without opening Razorpay', async () => {
    apiMocks.createCartQuote.mockRejectedValue({ response: { data: { detail: 'Quantity exceeds the configured limit.', reason_code: 'QUANTITY_LIMIT_EXCEEDED' } } })
    const user = userEvent.setup(); renderCheckout()
    await user.click(screen.getByRole('button', { name: /See final total/i }))
    expect(await screen.findByText('Quantity exceeds the configured limit.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Checkout paused' })).toBeInTheDocument()
    expect(window.Razorpay).not.toHaveBeenCalled()
  })

  it('proves the quantity demo block has no money side effects and supports a valid retry', async () => {
    const blockedQuote = {
      ...quote,
      quote_id: 'f63df6f8-e6b3-4cf8-a723-4a82f9466df0',
      status: 'BLOCKED',
      total_amount: '44994.00',
      reason_code: 'QUANTITY_LIMIT_EXCEEDED',
      detail: 'The requested quantity exceeds the per-item limit.',
      items: [{ ...quote.items[0], quantity: 6, line_total: '44994.00' }],
    }
    apiMocks.createCartQuote
      .mockResolvedValueOnce({ data: quote })
      .mockRejectedValueOnce({ response: { data: blockedQuote } })
      .mockResolvedValueOnce({ data: quote })

    const user = userEvent.setup(); renderCheckout(); await reachQuote(user)
    await user.click(screen.getByRole('button', { name: /See how Nexora safely stops an over-limit order/i }))

    expect(await screen.findByRole('heading', { name: 'Checkout paused' })).toBeInTheDocument()
    expect(screen.getByText(/You chose 6. The limit is 5 per item/)).toBeInTheDocument()
    expect(screen.getByText(/No payment · No stock change/)).toBeInTheDocument()
    expect(apiMocks.approveQuote).not.toHaveBeenCalled()
    expect(apiMocks.createOrder).not.toHaveBeenCalled()
    expect(window.Razorpay).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Return to basket and retry' }))
    expect(screen.getByRole('heading', { name: 'Your item' })).toBeInTheDocument()
    await reachQuote(user)
    expect(apiMocks.createCart.mock.calls.at(-1)[0][0].quantity).toBe(1)
    await approve(user)
    await waitFor(() => expect(apiMocks.createOrder).toHaveBeenCalledOnce())
  })

  it('preserves the reviewed basket and offers a recoverable retry when checkout initialization fails', async () => {
    apiMocks.createOrder.mockRejectedValue({ response: { data: { detail: 'Payment provider is temporarily unavailable.', reason_code: 'PAYMENT_PROVIDER_ERROR' } } })
    const user = userEvent.setup(); renderCheckout(); await reachQuote(user); await approve(user)
    expect(await screen.findByText('Payment provider is temporarily unavailable.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Return to basket and retry' }))
    expect(screen.getByRole('heading', { name: 'Your item' })).toBeInTheDocument()
    expect(screen.getAllByText('Backend Keyboard')).toHaveLength(2)
  })

  it('does not consume approval or reserve stock when Razorpay Checkout cannot load', async () => {
    const sdkError = new Error('Razorpay Checkout failed to load.')
    sdkError.code = 'RAZORPAY_SDK_LOAD_FAILED'
    apiMocks.loadRazorpayCheckout.mockRejectedValue(sdkError)
    const user = userEvent.setup(); renderCheckout(); await reachQuote(user); await approve(user)
    expect(await screen.findByText(/Razorpay Checkout could not load/i)).toBeInTheDocument()
    expect(apiMocks.approveQuote).not.toHaveBeenCalled()
    expect(apiMocks.createOrder).not.toHaveBeenCalled()
  })

  it('shows success only after the authoritative order endpoint reports webhook-confirmed PAID', async () => {
    const paidOrder = { ...pendingOrder, status: 'PAID', cancellable: false, paid_at: new Date().toISOString() }
    apiMocks.getOrder.mockResolvedValue({ data: paidOrder })
    const placed = vi.fn()
    const user = userEvent.setup(); renderCheckout({ onOrderPlaced: placed }); await reachQuote(user); await approve(user)
    expect(await screen.findByRole('heading', { name: 'Order confirmed' })).toBeInTheDocument()
    for (const label of ['Basket', 'Review', 'Pay', 'Done']) {
      expect(screen.getByLabelText(`${label}, completed`).querySelector('[data-step-state="complete"]')).toHaveClass('bg-emerald-600')
    }
    expect(placed).toHaveBeenCalledWith({ product, order: paidOrder })
  })
})
