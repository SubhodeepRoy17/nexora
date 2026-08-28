import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import Login from './Login'

const authState = {
  user: null,
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
}

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }))

const renderLogin = (entry = '/login') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Login', () => {
  beforeEach(() => {
    authState.user = null
    authState.loading = false
  })

  it('uses only the Nexora wordmark instead of the site navbar', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nexora home' })).toHaveTextContent('NEXORA')
  })

  it('switches from sign in to the account creation form', async () => {
    const user = userEvent.setup()
    renderLogin()

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
  })

  it('presents the merchant route with the same switch layout', () => {
    const { container } = renderLogin('/login?role=merchant&next=/merchant')

    expect(screen.getByRole('heading', { name: 'Seller sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buyer sign in' })).toHaveAttribute('href', '/login')
    expect(container.querySelector('.auth-switch-shell')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()
  })
})
