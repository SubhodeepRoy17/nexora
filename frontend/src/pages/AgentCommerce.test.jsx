import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AgentCommerce from './AgentCommerce'

describe('agent commerce guide', () => {
  it('presents the human-readable contract before linking to raw machine resources', () => {
    render(<MemoryRouter><AgentCommerce /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: /Built for AI buyers/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /From discovery to verified payment/i })).toBeInTheDocument()
    expect(screen.getByText(/cannot silently purchase/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open OpenAPI/i })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: /Browse catalog JSON/i }).getAttribute('href')).toMatch(/\/api\/commerce\/v1\/catalog\/products\/$/)
    expect(screen.getByRole('link', { name: /Open shopping assistant/i })).toHaveAttribute('href', '/buyer')
  })
})
