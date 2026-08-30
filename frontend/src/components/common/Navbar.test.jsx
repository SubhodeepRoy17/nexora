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
  it('keeps application links and mobile branding without a top-level sign out', () => {
    render(<MemoryRouter initialEntries={['/buyer']}><Navbar /></MemoryRouter>)

    expect(screen.getByRole('link', { name: 'Shopping assistant' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Seller workspace' })).toBeInTheDocument()
    const mobileBrand = screen.getByRole('link', { name: 'Nexora home' })
    expect(mobileBrand).toHaveClass('lg:hidden')
    expect(mobileBrand.querySelector('img')).toHaveAttribute('src', expect.stringContaining('Monogram'))
    expect(mobileBrand).not.toHaveTextContent('NEXORA')
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })
})
