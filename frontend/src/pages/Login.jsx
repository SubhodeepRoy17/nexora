import { useState } from 'react'
import { ArrowRight, Check, LockKeyhole, LogIn, Mail, ShieldCheck, UserPlus, UserRound } from 'lucide-react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import LogoMark from '../components/LogoMark'
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

  const fieldShell = 'mt-2 flex items-center rounded-2xl border border-emerald-950/10 bg-white/72 px-4 shadow-[0_8px_24px_rgba(49,89,79,.06)] transition focus-within:border-slate-400 focus-within:bg-white focus-within:shadow-[0_10px_28px_rgba(49,89,79,.1)]'
  const fieldInput = 'focus-ring min-h-12 w-full bg-transparent px-3 text-sm text-[#17372f] placeholder:text-[#31594f]/40'

  return (
    <main className="auth-page relative isolate grid min-h-[calc(100dvh-4rem)] place-items-center overflow-hidden px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <div className="auth-aurora auth-aurora-one" aria-hidden="true" />
      <div className="auth-aurora auth-aurora-two" aria-hidden="true" />
      <section className="auth-shell relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/80 bg-white/58 shadow-[0_34px_100px_rgba(42,81,68,.18)] backdrop-blur-xl lg:grid-cols-[.9fr_1.1fr]">
        <aside className="auth-story relative hidden min-h-[680px] overflow-hidden border-r border-white/65 p-10 text-[#17372f] lg:flex lg:flex-col xl:p-12">
          <div className="auth-story-scrim absolute inset-0" aria-hidden="true" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl border border-white/80 bg-white/68 shadow-[0_12px_28px_rgba(49,89,79,.12)] backdrop-blur-md">
              <LogoMark className="size-8" alt="" />
            </span>
            <span className="nexora-wordmark text-3xl font-semibold">NEXORA</span>
          </div>
          <div className="relative my-auto py-12">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[.18em] text-violet-700">Private account · protected checkout</p>
            <h2 className="auth-story-title mt-5 max-w-[12ch] text-5xl font-semibold leading-[.95] tracking-[-.05em]">Your intent stays yours. Every purchase stays explicit.</h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-[#31594f]">One secure account keeps your shopping history private and gives you a separate seller workspace. You approve every purchase.</p>
          </div>
          <div className="relative grid gap-3">
            {['Private shopping history', 'Secure sign-in', 'Payment confirmed before completion'].map((item, index) => (
              <div key={item} className="auth-proof flex items-center gap-3 rounded-2xl border border-white/75 bg-white/52 px-4 py-3 text-[11px] text-[#31594f] backdrop-blur-md" style={{ '--auth-delay': `${650 + index * 120}ms` }}>
                <span className="grid size-6 place-items-center rounded-full bg-[#17372f] text-white">
                  <Check size={12} />
                </span>
                {item}
              </div>
            ))}
          </div>
        </aside>

        <div className="auth-form-panel flex flex-col justify-center p-6 sm:p-10 lg:p-12 xl:p-16">
          <Link to="/" className="mb-8 flex items-center gap-2.5 self-start lg:hidden">
            <LogoMark className="size-9" alt="" />
            <span className="nexora-wordmark text-2xl font-semibold text-[#17372f]">NEXORA</span>
          </Link>
          {!expectedRole && (
            <div className="grid grid-cols-2 rounded-full border border-emerald-950/10 bg-[#eef4ed]/75 p-1" role="tablist" aria-label="Account access">
              <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => switchMode('signin')} className={`focus-ring flex items-center justify-center gap-2 rounded-full px-4 py-3 text-xs font-semibold transition ${mode === 'signin' ? 'bg-[#17372f] text-white shadow-[0_8px_22px_rgba(23,55,47,.18)]' : 'text-[#31594f] hover:bg-white/75'}`}>
                <LogIn size={14} /> Sign in
              </button>
              <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')} className={`focus-ring flex items-center justify-center gap-2 rounded-full px-4 py-3 text-xs font-semibold transition ${mode === 'signup' ? 'bg-violet-700 text-white shadow-[0_8px_22px_rgba(109,40,217,.18)]' : 'text-[#31594f] hover:bg-white/75'}`}>
                <UserPlus size={14} /> Create account
              </button>
            </div>
          )}

          <div className={`${expectedRole ? '' : 'mt-9'} flex items-start gap-4`}>
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#17372f] text-white shadow-[0_10px_24px_rgba(23,55,47,.2)]">{mode === 'signup' ? <UserPlus size={19} /> : <LockKeyhole size={19} />}</span>
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[.17em] text-violet-700">{expectedRole ? 'Seller sign in' : mode === 'signup' ? 'One account · two workspaces' : 'Welcome back'}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#17372f] sm:text-4xl">{expectedRole ? 'Seller sign in' : mode === 'signup' ? 'Create your Nexora account' : 'Sign in to Nexora'}</h1>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#31594f]">{expectedRole ? 'We confirm that this account belongs to the seller before showing store information.' : mode === 'signup' ? 'One account gives you private shopping access and your own seller workspace.' : 'Continue your private searches, approvals, and orders.'}</p>

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

            {mode === 'signup' && <p className="mt-3 text-[10px] leading-5 text-[#31594f]/65">Use at least 8 characters. For your safety, weak or easy-to-guess passwords are not accepted.</p>}
            {state.error && (
              <p className="mt-4 rounded-2xl border border-rose-300 bg-rose-50/90 p-3 text-xs text-rose-700" role="alert">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={state.submitting || loading} className="focus-ring group mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-[#17372f] bg-[#17372f] py-4 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(23,55,47,.22)] transition duration-300 hover:-translate-y-0.5 hover:border-violet-700 hover:bg-violet-700 disabled:cursor-wait disabled:border-slate-400 disabled:bg-slate-400">
              {mode === 'signup' ? <UserPlus size={16} /> : <LogIn size={16} />}
              {state.submitting ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : mode === 'signup' ? 'Create your account' : 'Sign in securely'} <ArrowRight size={15} className="transition group-hover:translate-x-1" />
            </button>
          </form>

          {!expectedRole && (
            <p className="mt-6 text-center text-xs text-[#31594f]/70">
              {mode === 'signup' ? 'Already have an account?' : 'New to Nexora?'}{' '}
              <button type="button" onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')} className="focus-ring font-semibold text-violet-700 hover:underline">
                {mode === 'signup' ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
