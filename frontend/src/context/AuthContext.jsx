import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  apiUsesCrossOriginCredentials,
  getCurrentUser,
  loginAccount,
  logoutAccount,
  registerAccount,
  setCsrfToken,
} from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cookieAccess, setCookieAccess] = useState('checking')

  const loadSession = useCallback(async () => {
    const first = await getCurrentUser()
    setCsrfToken(first.data.csrf_token)
    if (!apiUsesCrossOriginCredentials()) {
      return { data: first.data, cookieAccess: 'same-origin' }
    }
    if (first.data.credential_cookie_roundtrip) {
      return { data: first.data, cookieAccess: 'available' }
    }

    // The first cross-origin response sets the probe cookie. Only a second
    // credentialed request can prove that the browser returned it.
    const second = await getCurrentUser()
    setCsrfToken(second.data.csrf_token)
    return {
      data: second.data,
      cookieAccess: second.data.credential_cookie_roundtrip ? 'available' : 'blocked',
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, cookieAccess: nextCookieAccess } = await loadSession()
      setCookieAccess(nextCookieAccess)
      setUser(data.user)
      return data.user
    } catch {
      setUser(null)
      setCookieAccess('unavailable')
      setError('Unable to verify your session. Please try again.')
      return null
    } finally {
      setLoading(false)
    }
  }, [loadSession])

  const recheckCookieAccess = useCallback(async () => {
    try {
      const { data, cookieAccess: nextCookieAccess } = await loadSession()
      setCookieAccess(nextCookieAccess)
      setUser(data.user)
      return nextCookieAccess
    } catch {
      setCookieAccess('unavailable')
      return 'unavailable'
    }
  }, [loadSession])

  useEffect(() => {
    refresh()
    const expire = () => setUser(null)
    window.addEventListener('nexora:auth-expired', expire)
    return () => window.removeEventListener('nexora:auth-expired', expire)
  }, [refresh])

  const signIn = useCallback(async (credentials) => {
    setError('')
    const { data } = await loginAccount(credentials)
    setCsrfToken(data.csrf_token)
    setUser(data.user)
    return data.user
  }, [])

  const signUp = useCallback(async (registration) => {
    setError('')
    const { data } = await registerAccount(registration)
    setCsrfToken(data.csrf_token)
    setUser(data.user)
    return data.user
  }, [])

  const signOut = useCallback(async () => {
    try {
      const { data } = await logoutAccount()
      setCsrfToken(data.csrf_token)
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, cookieAccess, refresh, recheckCookieAccess, signIn, signUp, signOut }),
    [user, loading, error, cookieAccess, refresh, recheckCookieAccess, signIn, signUp, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
