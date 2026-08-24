import { useState } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getApiError } from '../services/api'

const safeNextPath = (value, fallback) => value?.startsWith('/') && !value.startsWith('//') ? value : fallback

export default function Login() {
  const { user, loading, signIn } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const expectedRole = searchParams.get('role') === 'merchant' ? 'merchant' : null
  const fallback = expectedRole === 'merchant' ? '/merchant' : '/'
  const nextPath = safeNextPath(searchParams.get('next'), fallback)
  const [form, setForm] = useState({ username: '', password: '' })
  const [state, setState] = useState({ submitting: false, error: '' })

  if (!loading && user && (!expectedRole || user.role === expectedRole)) return <Navigate to={nextPath} replace />

  const submit = async (event) => {
    event.preventDefault()
    setState({ submitting: true, error: '' })
    try {
      const nextUser = await signIn(form)
      if (expectedRole && nextUser.role !== expectedRole) {
        setState({ submitting: false, error: 'This account does not own a merchant workspace.' })
        return
      }
      navigate(nextPath, { replace: true })
    } catch (error) {
      setState({ submitting: false, error: getApiError(error, 'Unable to sign in.') })
    }
  }

  return (
    <main className="grid min-h-[calc(100dvh-4rem)] place-items-center bg-slate-950 px-4 py-10 text-slate-50">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-indigo-950/30" aria-busy={state.submitting}>
        <div className="grid size-11 place-items-center rounded-2xl bg-indigo-500 text-white shadow-glow"><ShieldCheck size={20} /></div>
        <p className="mono-label mt-5 text-indigo-400">Secure session</p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in to Nexora</h1>
        <p className="mt-2 text-sm text-slate-500">{expectedRole === 'merchant' ? 'Merchant ownership is verified before workspace data is loaded.' : 'Sign in before approving a purchase or viewing order history.'}</p>

        <label className="mt-6 block text-xs font-medium text-slate-300">Username
          <input autoComplete="username" required maxLength={150} disabled={state.submitting} value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white focus:border-indigo-500" />
        </label>
        <label className="mt-4 block text-xs font-medium text-slate-300">Password
          <input type="password" autoComplete="current-password" required maxLength={256} disabled={state.submitting} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white focus:border-indigo-500" />
        </label>

        {state.error && <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300" role="alert">{state.error}</p>}
        <button type="submit" disabled={state.submitting || loading} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-wait disabled:bg-slate-700"><LogIn size={16} />{state.submitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}
