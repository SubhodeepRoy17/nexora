import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, loginAccount, logoutAccount, registerAccount, setCsrfToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await getCurrentUser()
      setCsrfToken(data.csrf_token)
      setUser(data.user)
      return data.user
    } catch {
      setUser(null)
      setError('Unable to verify your session. Please try again.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

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

  const value = useMemo(() => ({ user, loading, error, refresh, signIn, signUp, signOut }), [user, loading, error, refresh, signIn, signUp, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
