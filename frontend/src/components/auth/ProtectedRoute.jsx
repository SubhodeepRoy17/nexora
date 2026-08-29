import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AuthSessionSkeleton } from '../common/LoadingSkeletons'

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <AuthSessionSkeleton />
  }
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?next=${next}&role=${role}`} replace />
  }
  if (role && user.role !== role) {
    return <main className="login-grid grid min-h-[calc(100dvh-4rem)] place-items-center bg-white px-5 text-center"><div className="w-full max-w-md border border-rose-200 bg-white p-8 shadow-[10px_10px_0_rgba(244,63,94,.10)]"><span className="mx-auto grid size-10 place-items-center rounded-full bg-rose-50 font-mono text-sm font-bold text-rose-600">!</span><h1 className="mt-5 text-xl font-semibold text-slate-950">Merchant access required</h1><p className="mt-2 text-sm leading-6 text-slate-600">This account does not own a merchant workspace.</p></div></main>
  }
  return children
}
