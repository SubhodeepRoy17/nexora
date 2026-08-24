import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <main className="grid min-h-[calc(100dvh-4rem)] place-items-center bg-slate-950 text-slate-300" aria-live="polite"><p className="font-mono text-xs">VERIFYING SECURE SESSION…</p></main>
  }
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?next=${next}&role=${role}`} replace />
  }
  if (role && user.role !== role) {
    return <main className="grid min-h-[calc(100dvh-4rem)] place-items-center bg-slate-950 px-5 text-center"><div className="max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-7"><h1 className="text-lg font-semibold text-white">Merchant access required</h1><p className="mt-2 text-sm text-slate-400">This account does not own a merchant workspace.</p></div></main>
  }
  return children
}
