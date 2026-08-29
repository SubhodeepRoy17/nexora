import { useState } from 'react'
import { ArrowRight, BadgeCheck, Eye, EyeOff, LockKeyhole, LogIn, Mail, ShieldCheck, Sparkles, Store, UserPlus, UserRound } from 'lucide-react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import Brand from '../components/Brand'
import { Skeleton } from '../components/common/LoadingSkeletons'
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

const buyerTrust = {
  signin: ['Private shopping history', 'Approval before every payment', 'Backend-verified order status'],
  signup: ['One account for both workspaces', 'Searches stay private to you', 'No automatic purchase actions'],
}

const merchantTrust = ['Owner-scoped inventory', 'Private sales insights', 'Verified payment timeline']

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
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)

  if (!loading && user && (!expectedRole || user.role === expectedRole)) return <Navigate to={nextPath} replace />

  const switchMode = (nextMode) => {
    const updated = new URLSearchParams(searchParams)
    if (nextMode === 'signup') updated.set('mode', 'signup')
    else updated.delete('mode')
    setSearchParams(updated, { replace: true })
    setState({ submitting: false, error: '' })
    setPasswordVisible(false)
    setConfirmVisible(false)
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

  const fieldShell = 'auth-field mt-2 flex items-center rounded-2xl border border-emerald-950/10 bg-[#f5f8f3] px-4 transition duration-300 focus-within:-translate-y-0.5 focus-within:border-[#31594f]/55 focus-within:bg-white focus-within:shadow-[0_14px_30px_rgba(49,89,79,.1)]'
  const fieldInput = 'min-h-12 w-full bg-transparent px-3 text-sm text-[#17372f] outline-none placeholder:text-[#31594f]/38 focus:outline-none focus-visible:outline-none'
  const storyTitle = expectedRole ? 'Your store, under your control.' : mode === 'signup' ? 'Good to see you again.' : 'Your next considered choice starts here.'
  const storyCopy = expectedRole ? 'Sign in with the account connected to your private seller workspace.' : mode === 'signup' ? 'Return to your saved searches, approvals and verified orders.' : 'Create one account for thoughtful shopping and a private seller workspace.'
  const trustItems = expectedRole ? merchantTrust : buyerTrust[mode]
  const formEyebrow = expectedRole ? 'Seller access' : mode === 'signup' ? 'Create your Nexora account' : 'Secure account access'

  return (
    <main className="auth-page relative isolate grid min-h-dvh place-items-center overflow-x-hidden px-4 pb-8 pt-24 text-slate-950 sm:px-6 sm:pb-12 sm:pt-28">
      <Link to="/" aria-label="Nexora home" className="focus-ring absolute left-5 top-6 z-30 rounded-md sm:left-8 sm:top-8">
        <Brand />
      </Link>
      <div className="auth-page-note absolute right-6 top-7 z-20 hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[#31594f]/65 sm:flex sm:right-9 sm:top-9">
        <ShieldCheck size={14} className="text-emerald-700" /> Human-approved commerce
      </div>
      <div className="auth-aurora auth-aurora-one" aria-hidden="true" />
      <div className="auth-aurora auth-aurora-two" aria-hidden="true" />
      <div className="auth-grid-glow" aria-hidden="true" />

      <section data-auth-mode={mode} className={`auth-switch-shell auth-shell relative z-10 w-full max-w-6xl overflow-hidden rounded-[2.4rem] border border-white/90 bg-white/72 shadow-[0_38px_120px_rgba(42,81,68,.2)] backdrop-blur-xl ${mode === 'signup' ? 'auth-switch-signup' : ''}`}>
        <aside className="auth-switch-story auth-story relative overflow-hidden text-[#17372f]">
          <div className="auth-story-scrim absolute inset-0" aria-hidden="true" />
          <div className="auth-story-ring auth-story-ring-one" aria-hidden="true" />
          <div className="auth-story-ring auth-story-ring-two" aria-hidden="true" />

          <div key={`story-${expectedRole || mode}`} className="auth-switch-story-content relative flex h-full flex-col justify-center px-8 py-10 sm:px-12 lg:px-14">
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.18em] text-violet-700">
              <span className="grid size-8 place-items-center rounded-xl border border-white/80 bg-white/65 text-[#17372f] shadow-sm backdrop-blur-md">
                {expectedRole ? <Store size={15} /> : <Sparkles size={15} />}
              </span>
              {expectedRole ? 'Private seller workspace' : 'Thoughtful shopping, protected'}
            </div>

            <h2 className="auth-story-title mt-7 max-w-[11ch] text-4xl font-semibold leading-[.96] tracking-[-.055em] sm:text-5xl lg:text-[3.4rem]">{storyTitle}</h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-[#31594f]">{storyCopy}</p>

            <div className="mt-7 grid gap-2.5">
              {trustItems.map((item, index) => (
                <div key={item} className="auth-trust-item flex items-center gap-3 rounded-2xl border border-white/75 bg-white/52 px-3.5 py-3 text-[11px] font-medium text-[#31594f] shadow-[0_8px_22px_rgba(42,81,68,.06)] backdrop-blur-md" style={{ '--auth-item-delay': `${180 + index * 80}ms` }}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#17372f] text-white"><BadgeCheck size={12} /></span>
                  {item}
                </div>
              ))}
            </div>

            {expectedRole ? (
              <Link to="/login" className="focus-ring group mt-8 flex w-fit items-center gap-2 rounded-full border border-[#17372f] bg-[#17372f] px-6 py-3 text-xs font-semibold text-white shadow-[0_12px_26px_rgba(23,55,47,.18)] transition hover:-translate-y-0.5 hover:bg-[#244b41]">Buyer sign in <ArrowRight size={14} className="transition group-hover:translate-x-1" /></Link>
            ) : (
              <button type="button" onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')} className="focus-ring group mt-8 flex w-fit items-center gap-2 rounded-full border border-[#17372f] bg-[#17372f] px-7 py-3 text-xs font-semibold text-white shadow-[0_12px_26px_rgba(23,55,47,.18)] transition hover:-translate-y-0.5 hover:bg-[#244b41]">
                {mode === 'signup' ? 'Sign in instead' : 'Create an account'} <ArrowRight size={14} className="transition group-hover:translate-x-1" />
              </button>
            )}
          </div>
        </aside>

        <div className="auth-switch-form flex flex-col justify-center bg-[rgba(252,253,250,.94)] p-6 sm:p-10 lg:p-12 xl:p-16">
          <div key={`form-${expectedRole || mode}`} className="auth-switch-form-content">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[9px] font-semibold uppercase tracking-[.18em] text-violet-700">{formEyebrow}</p>
              <span className="rounded-full border border-emerald-950/10 bg-[#eef4ed] px-3 py-1.5 text-[9px] font-semibold text-[#31594f]">{expectedRole ? 'Merchant' : mode === 'signup' ? 'New account' : 'Welcome back'}</span>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#17372f] text-white shadow-[0_12px_28px_rgba(23,55,47,.2)]">{expectedRole ? <Store size={19} /> : mode === 'signup' ? <UserPlus size={19} /> : <LockKeyhole size={19} />}</span>
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#17372f] sm:text-4xl">{expectedRole ? 'Seller sign in' : mode === 'signup' ? 'Create your account' : 'Sign in to Nexora'}</h1>
                <p className="mt-1.5 text-xs text-[#31594f]/70">{expectedRole ? 'Continue to your private workspace.' : mode === 'signup' ? 'Your shopping history starts private.' : 'Continue where you left off.'}</p>
              </div>
            </div>

            <form onSubmit={submit} className="mt-8" aria-busy={state.submitting}>
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
                    onChange={mode === 'signup' ? updateRegistration('username') : (event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                    className={fieldInput}
                    placeholder={mode === 'signup' ? 'Choose a unique username' : 'Your username'}
                  />
                </span>
              </label>

              <div className={mode === 'signup' ? 'grid gap-4 sm:grid-cols-2' : ''}>
                <div className="mt-4 block text-xs font-semibold text-[#31594f]">
                  <label htmlFor="auth-password">Password</label>
                  <span className={fieldShell}>
                    <LockKeyhole size={15} className="text-[#31594f]/45" />
                    <input
                      id="auth-password"
                      type={passwordVisible ? 'text' : 'password'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                      minLength={mode === 'signup' ? 8 : 1}
                      maxLength={256}
                      disabled={state.submitting}
                      value={mode === 'signup' ? registration.password : loginForm.password}
                      onChange={mode === 'signup' ? updateRegistration('password') : (event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                      className={fieldInput}
                      placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible} className="focus-ring -mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-[#31594f]/55 transition hover:bg-[#e7eee5] hover:text-[#17372f]">
                      {passwordVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </span>
                </div>
                {mode === 'signup' && (
                  <div className="mt-4 block text-xs font-semibold text-[#31594f]">
                    <label htmlFor="auth-password-confirm">Confirm password</label>
                    <span className={fieldShell}>
                      <ShieldCheck size={15} className="text-[#31594f]/45" />
                      <input id="auth-password-confirm" type={confirmVisible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={256} disabled={state.submitting} value={registration.password_confirm} onChange={updateRegistration('password_confirm')} className={fieldInput} placeholder="Repeat password" />
                      <button type="button" onClick={() => setConfirmVisible((visible) => !visible)} aria-label={confirmVisible ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={confirmVisible} className="focus-ring -mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-[#31594f]/55 transition hover:bg-[#e7eee5] hover:text-[#17372f]">
                        {confirmVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </span>
                  </div>
                )}
              </div>

              {mode === 'signup' && <p className="mt-3 flex items-center gap-2 text-[10px] leading-5 text-[#31594f]/65"><BadgeCheck size={13} className="text-emerald-700" /> Use at least 8 characters. Weak passwords are rejected securely.</p>}
              {state.error && <p className="mt-4 rounded-2xl border border-rose-300 bg-rose-50/90 p-3 text-xs text-rose-700" role="alert">{state.error}</p>}

              <button type="submit" disabled={state.submitting || loading} aria-label={state.submitting ? (mode === 'signup' ? 'Creating account' : 'Signing in') : undefined} className="focus-ring group mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#17372f] bg-[#17372f] py-4 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(23,55,47,.22)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#244b41] disabled:cursor-wait disabled:border-[#17372f] disabled:bg-[#17372f]">
                {state.submitting || loading ? <span role="status" aria-label={state.submitting ? (mode === 'signup' ? 'Creating account' : 'Signing in') : 'Checking account'} className="flex w-32 items-center gap-2"><Skeleton className="nexora-skeleton-ink size-4 rounded-full" /><Skeleton className="nexora-skeleton-ink h-2.5 flex-1 rounded-full" /></span> : <>{mode === 'signup' ? <UserPlus size={16} /> : <LogIn size={16} />}{mode === 'signup' ? 'Create secure account' : 'Sign in securely'} <ArrowRight size={15} className="transition group-hover:translate-x-1" /></>}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-[#31594f]/55">
              <ShieldCheck size={13} className="text-emerald-700" /> Session protected · credentials never shown publicly
            </div>
          </div>
        </div>
      </section>

      <p className="relative z-10 mt-5 text-center text-[10px] leading-5 text-[#31594f]/55">By continuing, you enter a human-approved shopping experience. Payment is never completed from the browser alone.</p>
    </main>
  )
}
