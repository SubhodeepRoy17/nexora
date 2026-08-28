import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import AgentTimelineFeed from './AgentTimelineFeed'

const events = Array.from({ length: 12 }, (_, index) => ({
  id: `event-${index + 1}`,
  type: index === 0 ? 'converted' : 'recommended',
  actionLabel: index === 0 ? 'Payment verified' : 'Product suggested',
  product: `Product ${index + 1}`,
  buyer: 'Verified shopper',
  reason: `Bounded activity ${index + 1}`,
  time: `${index + 1}m ago`,
}))

describe('merchant shopper activity timeline', () => {
  it('reveals activity in bounded batches instead of rendering every record', async () => {
    const user = userEvent.setup()
    render(<AgentTimelineFeed events={events} />)

    expect(screen.getByText('Product 5')).toBeInTheDocument()
    expect(screen.queryByText('Product 6')).not.toBeInTheDocument()
    expect(screen.getByText(/showing 5 of 12 activities/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /load 5 more/i }))

    expect(screen.getByText('Product 10')).toBeInTheDocument()
    expect(screen.queryByText('Product 11')).not.toBeInTheDocument()
    expect(screen.getByText(/showing 10 of 12 activities/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /load 2 more/i }))
    expect(screen.getByText('Product 12')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /load .* more/i })).not.toBeInTheDocument()
  })

  it('starts the expanded sales-insights view with an eight-record batch', () => {
    render(<AgentTimelineFeed events={events} expanded />)

    expect(screen.getByText('Product 8')).toBeInTheDocument()
    expect(screen.queryByText('Product 9')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /load 4 more/i })).toBeInTheDocument()
  })
})
