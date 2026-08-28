import { useState } from 'react'
import { ArrowRight, LockKeyhole, LogIn, Mail, ShieldCheck, Store, UserPlus, UserRound } from 'lucide-react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import Brand from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import { getApiError } from '../services/api'

const safeNextPath = (value, fallback) => (value?.startsWith('/') && !value.startsWith('//') ? value : fallback)
const emptyRegistration = {
  first_name: '',
  username: '',
  email: '',
  password: '',
  password_confirm: '',
}

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
        setState({
          submitting: false,
          error: 'This account does not own a merchant workspace.',
        })
        return
      }
      navigate(nextPath, { replace: true })
    } catch (error) {
      setState({
        submitting: false,
        error: getApiError(error, mode === 'signup' ? 'Unable to create your account.' : 'Unable to sign in.'),
      })
    }
  }

  const updateRegistration = (field) => (event) => setRegistration((current) => ({ ...current, [field]: event.target.value }))

  const fieldShell = 'mt-2 flex items-center rounded-xl border border-emerald-950/10 bg-[#f8faf6] px-4 transition duration-300 focus-within:-translate-y-0.5 focus-within:border-violet-400 focus-within:bg-white focus-within:shadow-[0_12px_28px_rgba(49,89,79,.09)]'
  const fieldInput = 'focus-ring min-h-12 w-full bg-transparent px-3 text-sm text-[#17372f] placeholder:text-[#31594f]/38'
  const storyTitle = expectedRole ? 'Your store, ready when you are.' : mode === 'signup' ? 'Already part of Nexora?' : 'New to Nexora?'
  const storyCopy = expectedRole ? 'Sign in with the account connected to your seller workspace.' : mode === 'signup' ? 'Sign in to continue your searches, approvals and orders.' : 'Create one account for thoughtful shopping and your seller workspace.'

  return (
    <main className="auth-page relative isolate grid min-h-dvh place-items-center overflow-x-hidden px-4 pb-8 pt-24 text-slate-950 sm:px-6 sm:pb-12 sm:pt-28">
      <Link to="/" aria-label="Nexora home" className="focus-ring absolute left-5 top-6 z-30 sm:left-8 sm:top-8">
        <Brand />
      </Link>
      <div className="auth-aurora auth-aurora-one" aria-hidden="true" />
      <div className="auth-aurora auth-aurora-two" aria-hidden="true" />
      <section className={`auth-switch-shell auth-shell relative z-10 w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/80 bg-white/62 shadow-[0_34px_100px_rgba(42,81,68,.18)] backdrop-blur-xl ${mode === 'signup' ? 'auth-switch-signup' : ''}`}>
        <aside className="auth-switch-story auth-story relative overflow-hidden text-[#17372f]">
          <div className="auth-story-scrim absolute inset-0" aria-hidden="true" />
          <div className="auth-switch-story-content relative flex h-full flex-col items-center justify-center px-7 py-8 text-center sm:px-10 lg:px-12">
            <span className="grid size-12 place-items-center rounded-2xl border border-white/75 bg-white/60 text-[#17372f] shadow-[0_12px_28px_rgba(49,89,79,.12)] backdrop-blur-md">
              {expectedRole ? <Store size={21} /> : mode === 'signup' ? <LogIn size={21} /> : <UserPlus size={21} />}
            </span>
            <h2 className="auth-story-title mt-5 max-w-[12ch] text-3xl font-semibold leading-none tracking-[-.045em] sm:text-4xl lg:text-5xl">{storyTitle}</h2>
            <p className="mt-4 max-w-sm text-xs leading-6 text-[#31594f] sm:text-sm sm:leading-7">{storyCopy}</p>
            {expectedRole ? (
              <Link to="/login" className="focus-ring mt-6 rounded-full border border-[#17372f] bg-[#17372f] px-6 py-3 text-xs font-semibold text-white transition hover:border-violet-700 hover:bg-violet-700">Buyer sign in</Link>
            ) : (
              <button type="button" onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')} className="focus-ring mt-6 rounded-full border border-[#17372f] bg-[#17372f] px-7 py-3 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:border-violet-700 hover:bg-violet-700">
                {mode === 'signup' ? 'Sign in' : 'Create account'}
              </button>
            )}
          </div>
        </aside>

        <div className="auth-switch-form flex flex-col justify-center bg-[rgba(250,252,248,.9)] p-6 sm:p-10 lg:p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#17372f] text-white shadow-[0_10px_24px_rgba(23,55,47,.18)]">{expectedRole ? <Store size={18} /> : mode === 'signup' ? <UserPlus size={18} /> : <LockKeyhole size={18} />}</span>
            <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#17372f] sm:text-4xl">{expectedRole ? 'Seller sign in' : mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#31594f]">{expectedRole ? 'Open your seller workspace.' : mode === 'signup' ? 'Start shopping with Nexora.' : 'Sign in to continue.'}</p>

          <form onSubmit={submit} className="mt-7" aria-busy={state.submitting}>
            {mode === 'signup' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-[#31594f]">
                  Display name
                  <span className={fieldShell}>
                    <UserRound size={15} className="text-[#31594f]/45" />
                    <input autoComplete="name" required maxLength={150} disabled={state.submitting} value={registration.first_name} onChange={updateRegistration('first_name')} className={fieldInput} placeholder="Your name" />
                  </span>
                </label>
                <label className="block text-xs font-semibold text-[#31594f]">
                  Email
                  <span className={fieldShell}>
                    <Mail size={15} className="text-[#31594f]/45" />
                    <input type="email" autoComplete="email" required maxLength={254} disabled={state.submitting} value={registration.email} onChange={updateRegistration('email')} className={fieldInput} placeholder="you@example.com" />
                  </span>
                </label>
              </div>
            )}

            <label className={`${mode === 'signup' ? 'mt-4' : ''} block text-xs font-semibold text-[#31594f]`}>
              Username
              <span className={fieldShell}>
                <UserRound size={15} className="text-[#31594f]/45" />
                <input
                  autoComplete="username"
                  required
                  minLength={mode === 'signup' ? 3 : 1}
                  maxLength={150}
                  disabled={state.submitting}
                  value={mode === 'signup' ? registration.username : loginForm.username}
                  onChange={
                    mode === 'signup'
                      ? updateRegistration('username')
                      : (event) =>
                          setLoginForm((current) => ({
                            ...current,
                            username: event.target.value,
                          }))
                  }
                  className={fieldInput}
                  placeholder={mode === 'signup' ? 'Choose a unique username' : 'Your username'}
                />
              </span>
            </label>
            <div className={mode === 'signup' ? 'grid gap-4 sm:grid-cols-2' : ''}>
              <label className="mt-4 block text-xs font-semibold text-[#31594f]">
                Password
                <span className={fieldShell}>
                  <LockKeyhole size={15} className="text-[#31594f]/45" />
                  <input
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    minLength={mode === 'signup' ? 8 : 1}
                    maxLength={256}
                    disabled={state.submitting}
                    value={mode === 'signup' ? registration.password : loginForm.password}
                    onChange={
                      mode === 'signup'
                        ? updateRegistration('password')
                        : (event) =>
                            setLoginForm((current) => ({
                              ...current,
                              password: event.target.value,
                            }))
                    }
                    className={fieldInput}
                    placeholder="••••••••"
                  />
                </span>
              </label>
              {mode === 'signup' && (
                <label className="mt-4 block text-xs font-semibold text-[#31594f]">
                  Confirm password
                  <span className={fieldShell}>
                    <ShieldCheck size={15} className="text-[#31594f]/45" />
                    <input type="password" autoComplete="new-password" required minLength={8} maxLength={256} disabled={state.submitting} value={registration.password_confirm} onChange={updateRegistration('password_confirm')} className={fieldInput} placeholder="Repeat password" />
                  </span>
                </label>
              )}
            </div>

            {mode === 'signup' && <p className="mt-3 text-[11px] leading-5 text-[#31594f]/65">Use at least 8 characters.</p>}
            {state.error && (
              <p className="mt-4 rounded-2xl border border-rose-300 bg-rose-50/90 p-3 text-xs text-rose-700" role="alert">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={state.submitting || loading} className="focus-ring group mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-[#17372f] bg-[#17372f] py-4 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(23,55,47,.22)] transition duration-300 hover:-translate-y-0.5 hover:border-violet-700 hover:bg-violet-700 disabled:cursor-wait disabled:border-slate-400 disabled:bg-slate-400">
              {mode === 'signup' ? <UserPlus size={16} /> : <LogIn size={16} />}
              {state.submitting ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={15} className="transition group-hover:translate-x-1" />
            </button>
          </form>

        </div>
      </section>
    </main>
  )
}
