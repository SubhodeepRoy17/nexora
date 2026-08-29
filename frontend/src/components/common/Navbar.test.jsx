import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Navbar from './Navbar'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, display_name: 'Buyer Person' },
    loading: false,
    signOut: vi.fn(),
  }),
}))

describe('workspace navigation', () => {
  it('keeps application links while removing workspace branding and top-level sign out', () => {
    render(<MemoryRouter initialEntries={['/buyer']}><Navbar /></MemoryRouter>)

    expect(screen.getByRole('link', { name: 'Shopping assistant' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Seller workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Nexora home' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })
})
