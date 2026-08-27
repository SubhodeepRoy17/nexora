import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NexoraProvider } from '../context/NexoraContext'
import MerchantDashboard from './MerchantDashboard'

const apiMocks = vi.hoisted(() => ({
  getProducts: vi.fn(), getMoneyAudits: vi.fn(), getProductRelationships: vi.fn(),
  getMerchantAnalytics: vi.fn(), getMerchantWorkspace: vi.fn(), getOrders: vi.fn(),
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 3, role: 'merchant', merchant: { id: 11, name: 'Authenticated Shop' } } }) }))
vi.mock('../services/api', async (importOriginal) => ({ ...(await importOriginal()), ...apiMocks }))

const analytics = {
  window_days: 7, total_agent_impressions: 0, agent_conversions: 0, agent_conversion_rate: 0, agent_attributed_revenue: '0.00',
  trends: { impressions_percent: 0, conversions_percent: 0 }, lost_opportunities: { total: 0, breakdown: [] },
  growth: { real: { offer_impressions: 0, paid_attached_offers: 0, responded_offers: 0, accepted_offers: 0, rejected_offers: 0, accept_rate_percent: 0, paid_attachment_rate_percent: 0, incremental_paid_revenue: '0.00' }, top_converting_complements: [], rejected_offers: [], compatibility_gaps: [], attribution_note: 'Recorded attribution only.' },
}
const workspace = {
  merchant: { id: 11, name: 'Authenticated Shop', product_count: 0 },
  catalog_health: { score_percent: null, total_products: 0, active_products: 0, in_stock_products: 0, issue_counts: { active: 0, in_stock: 0, description: 0, specifications: 0, search_tags: 0 }, definition: 'Five equal checks per product.' },
  operations: { orders_by_status: {}, webhooks_by_state: {}, open_reconciliation_exceptions: 0 },
  calculated_at: new Date().toISOString(),
}

const renderMerchant = (route = '/merchant') => render(<MemoryRouter initialEntries={[route]}><NexoraProvider><MerchantDashboard /></NexoraProvider></MemoryRouter>)

describe('owner-scoped merchant workspace', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
    apiMocks.getProducts.mockResolvedValue({ data: { results: [] } })
    apiMocks.getMoneyAudits.mockResolvedValue({ data: { results: [] } })
    apiMocks.getProductRelationships.mockResolvedValue({ data: { results: [] } })
    apiMocks.getMerchantAnalytics.mockResolvedValue({ data: analytics })
    apiMocks.getMerchantWorkspace.mockResolvedValue({ data: workspace })
    apiMocks.getOrders.mockResolvedValue({ data: { results: [] } })
  })

  it('selects the authenticated merchant from backend workspace data without a client merchant scope', async () => {
    const user = userEvent.setup()
    renderMerchant()
    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(await screen.findByLabelText('Selected merchant: Authenticated Shop')).toBeInTheDocument()
    await waitFor(() => expect(apiMocks.getProducts).toHaveBeenCalled())
    expect(apiMocks.getProducts.mock.calls[0]).toHaveLength(1)
    expect(screen.getByText('PRIVATE SELLER WORKSPACE')).toBeInTheDocument()
  })

  it('renders honest empty states for catalog, paid orders, timeline, and relationships', async () => {
    const inventoryView = renderMerchant('/merchant/inventory')
    expect(await screen.findByText('No products match this view.')).toBeInTheDocument()
    expect(screen.getByText('No product pairings yet. No optional offers will be shown.')).toBeInTheDocument()
    inventoryView.unmount()
    renderMerchant('/merchant')
    expect(await screen.findByText('No completed payments yet.')).toBeInTheDocument()
    expect(screen.getByText('No shopper activity yet. New searches and order updates will appear automatically.')).toBeInTheDocument()
  })
})
