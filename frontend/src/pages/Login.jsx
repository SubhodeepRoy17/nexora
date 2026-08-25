import { useState } from 'react'
import { ArrowRight, Check, LockKeyhole, LogIn, Mail, ShieldCheck, UserPlus, UserRound } from 'lucide-react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getApiError } from '../services/api'

const safeNextPath = (value, fallback) => value?.startsWith('/') && !value.startsWith('//') ? value : fallback
const emptyRegistration = { first_name: '', username: '', email: '', password: '', password_confirm: '' }

export default function Login() {
  const { user, loading, signIn, signUp } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const expectedRole = searchParams.get('role') === 'merchant' ? 'merchant' : null
  const mode = searchParams.get('mode') === 'signup' && !expectedRole ? 'signup' : 'signin'
  const fallback = expectedRole === 'merchant' ? '/merchant' : '/buyer'
  const nextPath = safeNextPath(searchParams.get('next'), fallback)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [registration, setRegistration] = useState(emptyRegistration)
  const [state, setState] = useState({ submitting: false, error: '' })

  if (!loading && user && (!expectedRole || user.role === expectedRole)) return <Navigate to={nextPath} replace />

  const switchMode = (nextMode) => {
    const updated = new URLSearchParams(searchParams)
    if (nextMode === 'signup') updated.set('mode', 'signup')
    else updated.delete('mode')
    setSearchParams(updated, { replace: true })
    setState({ submitting: false, error: '' })
  }

  const submit = async (event) => {
    event.preventDefault()
    setState({ submitting: true, error: '' })
    try {
      const nextUser = mode === 'signup' ? await signUp(registration) : await signIn(loginForm)
      if (expectedRole && nextUser.role !== expectedRole) {
        setState({ submitting: false, error: 'This account does not own a merchant workspace.' })
        return
      }
      navigate(nextPath, { replace: true })
    } catch (error) {
      setState({ submitting: false, error: getApiError(error, mode === 'signup' ? 'Unable to create your account.' : 'Unable to sign in.') })
    }
  }

  const updateRegistration = (field) => (event) => setRegistration((current) => ({ ...current, [field]: event.target.value }))

  return (
    <main className="login-grid grid min-h-[calc(100dvh-4rem)] place-items-center bg-[#f6f5f1] px-4 py-10 text-slate-950 sm:px-6">
      <section className="grid w-full max-w-5xl overflow-hidden border border-slate-300 bg-white shadow-[14px_14px_0_rgba(124,58,237,.15)] lg:grid-cols-[.82fr_1.18fr]">
        <aside className="relative hidden overflow-hidden border-r border-slate-200 bg-violet-50 p-10 text-slate-950 lg:flex lg:flex-col">
          <div className="absolute -right-16 -top-16 size-56 rounded-full bg-violet-300/30 blur-3xl" />
          <div className="relative grid size-12 place-items-center border border-violet-700 bg-violet-600 text-white shadow-[4px_4px_0_#111827]"><ShieldCheck size={21} /></div>
          <p className="relative mt-10 font-mono text-[9px] uppercase tracking-[.18em] text-violet-700">Private buyer identity</p>
          <h2 className="relative mt-4 text-4xl font-semibold leading-tight tracking-[-.045em]">Your intent history belongs to you.</h2>
          <p className="relative mt-5 text-sm leading-7 text-slate-600">Create one account for private buying and an isolated merchant workspace.</p>
          <div className="relative mt-auto space-y-3 pt-12">
            {['Buyer-scoped chat history', 'CSRF-protected secure session', 'No browser-authoritative payment state'].map((item) => <p key={item} className="flex items-center gap-3 border-t border-violet-200 pt-3 text-[11px] text-slate-700"><span className="grid size-5 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={11} /></span>{item}</p>)}
          </div>
        </aside>

        <div className="p-6 sm:p-10 lg:p-12">
          {!expectedRole && <div className="grid grid-cols-2 border border-slate-300 bg-[#f6f5f1] p-1" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => switchMode('signin')} className={`focus-ring flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold transition ${mode === 'signin' ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}><LogIn size={14} /> Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')} className={`focus-ring flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold transition ${mode === 'signup' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}><UserPlus size={14} /> Create account</button>
          </div>}

          <div className="mt-8 flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center border border-slate-950 bg-white text-violet-600 shadow-[3px_3px_0_#111827]">{mode === 'signup' ? <UserPlus size={19} /> : <LockKeyhole size={19} />}</span>
            <div><p className="mono-label text-violet-600">{expectedRole ? 'Merchant security boundary' : mode === 'signup' ? 'Buyer + merchant access' : 'Welcome back'}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{expectedRole ? 'Merchant sign in' : mode === 'signup' ? 'Create your Nexora account' : 'Sign in to Nexora'}</h1></div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">{expectedRole ? 'Merchant ownership is verified before workspace data is loaded.' : mode === 'signup' ? 'Registration creates private buyer access and a new owner-scoped merchant workspace.' : 'Continue your private searches, approvals, and orders.'}</p>

          <form onSubmit={submit} className="mt-7" aria-busy={state.submitting}>
            {mode === 'signup' && <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-700">Display name
                <span className="mt-2 flex items-center border border-slate-300 bg-[#f8f7f4] px-3 focus-within:border-violet-500"><UserRound size={14} className="text-slate-400" /><input autoComplete="name" required maxLength={150} disabled={state.submitting} value={registration.first_name} onChange={updateRegistration('first_name')} className="focus-ring w-full bg-transparent px-3 py-3 text-sm" placeholder="Your name" /></span>
              </label>
              <label className="block text-xs font-semibold text-slate-700">Email
                <span className="mt-2 flex items-center border border-slate-300 bg-[#f8f7f4] px-3 focus-within:border-violet-500"><Mail size={14} className="text-slate-400" /><input type="email" autoComplete="email" required maxLength={254} disabled={state.submitting} value={registration.email} onChange={updateRegistration('email')} className="focus-ring w-full bg-transparent px-3 py-3 text-sm" placeholder="you@example.com" /></span>
              </label>
            </div>}

            <label className={`${mode === 'signup' ? 'mt-4' : ''} block text-xs font-semibold text-slate-700`}>Username
              <input autoComplete="username" required minLength={mode === 'signup' ? 3 : 1} maxLength={150} disabled={state.submitting} value={mode === 'signup' ? registration.username : loginForm.username} onChange={mode === 'signup' ? updateRegistration('username') : (event) => setLoginForm((current) => ({ ...current, username: event.target.value }))} className="focus-ring mt-2 w-full border border-slate-300 bg-[#f8f7f4] px-3 py-3 text-sm focus:border-violet-500" placeholder="Choose a unique username" />
            </label>
            <div className={mode === 'signup' ? 'grid gap-4 sm:grid-cols-2' : ''}>
              <label className="mt-4 block text-xs font-semibold text-slate-700">Password
                <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 1} maxLength={256} disabled={state.submitting} value={mode === 'signup' ? registration.password : loginForm.password} onChange={mode === 'signup' ? updateRegistration('password') : (event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} className="focus-ring mt-2 w-full border border-slate-300 bg-[#f8f7f4] px-3 py-3 text-sm focus:border-violet-500" />
              </label>
              {mode === 'signup' && <label className="mt-4 block text-xs font-semibold text-slate-700">Confirm password
                <input type="password" autoComplete="new-password" required minLength={8} maxLength={256} disabled={state.submitting} value={registration.password_confirm} onChange={updateRegistration('password_confirm')} className="focus-ring mt-2 w-full border border-slate-300 bg-[#f8f7f4] px-3 py-3 text-sm focus:border-violet-500" />
              </label>}
            </div>

            {mode === 'signup' && <p className="mt-3 text-[10px] leading-5 text-slate-500">Use at least 8 characters. Common, entirely numeric, or identity-similar passwords are rejected server-side.</p>}
            {state.error && <p className="mt-4 border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700" role="alert">{state.error}</p>}
            <button type="submit" disabled={state.submitting || loading} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 border border-violet-700 bg-violet-600 py-3.5 text-sm font-semibold text-white shadow-[4px_4px_0_#111827] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:bg-slate-400">{mode === 'signup' ? <UserPlus size={16} /> : <LogIn size={16} />}{state.submitting ? mode === 'signup' ? 'Creating account…' : 'Signing in…' : mode === 'signup' ? 'Create buyer + merchant account' : 'Sign in securely'} <ArrowRight size={15} /></button>
          </form>

          {!expectedRole && <p className="mt-6 text-center text-xs text-slate-500">{mode === 'signup' ? 'Already have an account?' : 'New to Nexora?'} <button type="button" onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')} className="focus-ring font-semibold text-violet-700 hover:underline">{mode === 'signup' ? 'Sign in' : 'Create an account'}</button></p>}
        </div>
      </section>
    </main>
  )
}
