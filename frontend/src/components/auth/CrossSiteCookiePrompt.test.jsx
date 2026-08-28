import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrossSiteCookiePrompt from './CrossSiteCookiePrompt'

let authState

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => authState,
}))

describe('CrossSiteCookiePrompt', () => {
  beforeEach(() => {
    authState = {
      cookieAccess: 'blocked',
      recheckCookieAccess: vi.fn().mockResolvedValue('blocked'),
    }
  })

  it('explains the cross-site credential boundary and supports guest dismissal', async () => {
    const user = userEvent.setup()
    render(<CrossSiteCookiePrompt />)

    expect(screen.getByRole('dialog', { name: /allow third-party cookies/i })).not.toBeNull()
    expect(screen.getByText(/session and CSRF cookies/i)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: /continue as guest/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('rechecks the server-observed cookie round trip', async () => {
    const user = userEvent.setup()
    authState.recheckCookieAccess.mockResolvedValue('available')
    render(<CrossSiteCookiePrompt />)

    await user.click(screen.getByRole('button', { name: /i’ve enabled cookies/i }))

    expect(authState.recheckCookieAccess).toHaveBeenCalledOnce()
    expect(await screen.findByText(/cookie access is ready/i)).not.toBeNull()
  })
})
