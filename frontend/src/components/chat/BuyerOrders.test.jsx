import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BuyerOrders from './BuyerOrders'

const apiMocks = vi.hoisted(() => ({
  getOrders: vi.fn(),
  getOrder: vi.fn(),
}))

vi.mock('../../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getOrders: apiMocks.getOrders,
  getOrder: apiMocks.getOrder,
}))

const pendingOrder = {
  order_id: '2026cfce-e15e-487c-9cca-1de133b35264',
  status: 'PAYMENT_PENDING',
  total_amount: '7499.00',
  currency: 'INR',
  cancellable: true,
  items: [{ product: 41, product_title: 'Quiet Keyboard', merchant_name: 'Scoped Shop', quantity: 1, line_total: '7499.00' }],
  refunds: [],
  created_at: new Date().toISOString(),
}

describe('buyer order receipt polling', () => {
  beforeEach(() => {
    apiMocks.getOrders.mockReset().mockResolvedValue({ data: { results: [pendingOrder] } })
    apiMocks.getOrder.mockReset().mockResolvedValue({ data: pendingOrder })
  })

  it('does not restart the immediate detail request after each successful response', async () => {
    render(<BuyerOrders user={{ id: 7 }} onRetry={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Quiet Keyboard/i }))
    await waitFor(() => expect(apiMocks.getOrder).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => window.setTimeout(resolve, 100))
    expect(apiMocks.getOrder).toHaveBeenCalledTimes(1)
  })

  it('opens order details in a centered document-level receipt modal', async () => {
    render(
      <div data-testid="sidebar-shell" className="translate-x-0">
        <BuyerOrders user={{ id: 7 }} onRetry={vi.fn()} />
      </div>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /Quiet Keyboard/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Order details' })

    expect(dialog.closest('[data-testid="sidebar-shell"]')).toBeNull()
    expect(dialog).toHaveClass('max-w-xl', 'rounded-2xl', 'buyer-order-dialog')
    expect(dialog.parentElement).toHaveClass('pt-[12vh]', 'backdrop-blur-sm')
    expect(screen.getByText('Approved total')).toBeInTheDocument()
    expect(screen.getAllByText(/₹7,499/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Close order receipt' })).toBeInTheDocument()
  })
})
