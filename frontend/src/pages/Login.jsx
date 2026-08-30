import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Store, UserPlus, UserRound } from 'lucide-react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import Brand from '../components/Brand'
import { Skeleton } from '../components/common/LoadingSkeletons'
import { useAuth } from '../context/AuthContext'
import { getApiError } from '../services/api'

const safeNextPath = (value, fallback) => (value?.startsWith('/') && !value.startsWith('//') ? value : fallback)
const emptyRegistration = { first_name: '', username: '', email: '', password: '', password_confirm: '' }

function AuthField({ label, icon: Icon, action, children }) {
  return (
    <div className="block text-xs font-semibold text-[#244b41]">
      <label htmlFor={children.props.id}>{label}</label>
      <span className="auth-field mt-2 flex min-h-12 items-center rounded-xl border border-emerald-950/10 bg-white px-3.5 transition focus-within:border-[#31594f]/60 focus-within:shadow-[0_0_0_4px_rgba(49,89,79,.08)]">
        <Icon size={16} className="shrink-0 text-[#31594f]/45" />
        {children}
        {action}
      </span>
    </div>
  )
}

export default function Login() {
  const { user, loading, signIn, signUp } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const merchant = searchParams.get('role') === 'merchant'
  const mode = searchParams.get('mode') === 'signup' && !merchant ? 'signup' : 'signin'
  const nextPath = safeNextPath(searchParams.get('next'), merchant ? '/merchant' : '/buyer')
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [registration, setRegistration] = useState(emptyRegistration)
  const [state, setState] = useState({ submitting: false, error: '' })
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)

  if (!loading && user && (!merchant || user.role === 'merchant')) return <Navigate to={nextPath} replace />

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
      if (merchant && nextUser.role !== 'merchant') {
        setState({ submitting: false, error: 'This account does not own a seller workspace.' })
        return
      }
      navigate(nextPath, { replace: true })
    } catch (error) {
      setState({ submitting: false, error: getApiError(error, mode === 'signup' ? 'Unable to create your account.' : 'Unable to sign in.') })
    }
  }

  const updateRegistration = (field) => (event) => setRegistration((current) => ({ ...current, [field]: event.target.value }))
  const inputClass = 'min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-[#17372f] outline-none placeholder:text-[#31594f]/35 focus:outline-none focus-visible:outline-none'
  const passwordAction = (visible, toggle, label) => (
    <button type="button" onClick={toggle} aria-label={visible ? `Hide ${label}` : `Show ${label}`} aria-pressed={visible} className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg text-[#31594f]/55 transition hover:bg-[#eef4ed] hover:text-[#17372f]">
      {visible ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )

  const title = merchant ? 'Seller sign in' : mode === 'signup' ? 'Create your account' : 'Sign in to Nexora'
  const subtitle = merchant ? 'Open your private store workspace.' : mode === 'signup' ? 'Save searches, orders, and approvals in one place.' : 'Continue your shopping conversations and orders.'

  return (
    <main className="auth-page-simple relative min-h-dvh overflow-hidden px-4 pb-8 pt-24 text-slate-950 sm:px-6 sm:pb-12 sm:pt-28">
      <Link to="/" aria-label="Nexora home" className="focus-ring absolute left-5 top-6 z-30 rounded-md sm:left-8 sm:top-8"><Brand /></Link>
      <div className="auth-simple-orb auth-simple-orb-one" aria-hidden="true" />
      <div className="auth-simple-orb auth-simple-orb-two" aria-hidden="true" />

      <section data-auth-mode={mode} className={`auth-switch-shell auth-simple-shell relative z-10 mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/80 bg-white/88 shadow-[0_32px_100px_rgba(42,81,68,.16)] backdrop-blur-xl lg:grid-cols-[.85fr_1.15fr] ${mode === 'signup' ? 'auth-switch-signup' : ''}`}>
        <aside className="auth-simple-story relative hidden min-h-[620px] overflow-hidden bg-[#17372f] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-12">
          <div className="auth-simple-story-glow" aria-hidden="true" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.14em] text-emerald-50">
              {merchant ? <Store size={14} /> : <ShieldCheck size={14} />} {merchant ? 'Seller workspace' : 'Human-approved shopping'}
            </span>
            <h2 className="mt-8 max-w-[10ch] font-serif text-5xl font-semibold leading-[.95] tracking-[-.045em]">
              {merchant ? 'Your store. Your data.' : mode === 'signup' ? 'A calmer way to choose.' : 'Welcome back.'}
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-emerald-50/70">
              {merchant ? 'Inventory, orders, and sales insights are shown only for the store connected to this account.' : 'Compare current products, understand the trade-offs, and approve the exact total before checkout.'}
            </p>
          </div>
          <div className="relative grid gap-3 text-xs text-emerald-50/80">
            {(merchant ? ['Owner-only inventory', 'Private sales information', 'Verified order history'] : ['Live product details', 'No automatic purchases', 'Secure payment confirmation']).map((item) => (
              <div key={item} className="flex items-center gap-3 border-t border-white/10 pt-3"><span className="size-1.5 rounded-full bg-emerald-300" />{item}</div>
            ))}
          </div>
        </aside>

        <div className="flex min-h-[calc(100dvh-8rem)] flex-col justify-center px-5 py-8 sm:min-h-0 sm:px-10 sm:py-12 lg:px-14 xl:px-16">
          {!merchant && (
            <div className="mb-9 grid grid-cols-2 rounded-xl bg-[#eef3eb] p-1" aria-label="Choose account action">
              <button type="button" onClick={() => switchMode('signin')} className={`focus-ring rounded-lg px-4 py-2.5 text-xs font-semibold transition ${mode === 'signin' ? 'bg-white text-[#17372f] shadow-sm' : 'text-[#31594f]/65 hover:text-[#17372f]'}`}>Sign in</button>
              <button type="button" onClick={() => switchMode('signup')} aria-label="Create an account" className={`focus-ring rounded-lg px-4 py-2.5 text-xs font-semibold transition ${mode === 'signup' ? 'bg-white text-[#17372f] shadow-sm' : 'text-[#31594f]/65 hover:text-[#17372f]'}`}>Create account</button>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-.045em] text-[#17372f] sm:text-4xl">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-[#31594f]/65">{subtitle}</p>
            </div>
            {merchant && <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#17372f] text-white"><Store size={18} /></span>}
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4" aria-busy={state.submitting}>
            {mode === 'signup' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <AuthField label="Display name" icon={UserRound}><input id="auth-display-name" autoComplete="name" required maxLength={150} disabled={state.submitting} value={registration.first_name} onChange={updateRegistration('first_name')} className={inputClass} placeholder="Your name" /></AuthField>
                <AuthField label="Email" icon={Mail}><input id="auth-email" type="email" autoComplete="email" required maxLength={254} disabled={state.submitting} value={registration.email} onChange={updateRegistration('email')} className={inputClass} placeholder="you@example.com" /></AuthField>
              </div>
            )}

            <AuthField label="Username" icon={UserRound}>
              <input id="auth-username" autoComplete="username" required minLength={mode === 'signup' ? 3 : 1} maxLength={150} disabled={state.submitting} value={mode === 'signup' ? registration.username : loginForm.username} onChange={mode === 'signup' ? updateRegistration('username') : (event) => setLoginForm((current) => ({ ...current, username: event.target.value }))} className={inputClass} placeholder="Your username" />
            </AuthField>

            <div className={mode === 'signup' ? 'grid gap-4 sm:grid-cols-2' : ''}>
              <AuthField label="Password" icon={LockKeyhole} action={passwordAction(passwordVisible, () => setPasswordVisible((visible) => !visible), 'password')}>
                <input id="auth-password" type={passwordVisible ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 1} maxLength={256} disabled={state.submitting} value={mode === 'signup' ? registration.password : loginForm.password} onChange={mode === 'signup' ? updateRegistration('password') : (event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} className={inputClass} placeholder="••••••••" />
              </AuthField>
              {mode === 'signup' && (
                <AuthField label="Confirm password" icon={ShieldCheck} action={passwordAction(confirmVisible, () => setConfirmVisible((visible) => !visible), 'confirmation password')}>
                  <input id="auth-password-confirmation" type={confirmVisible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={256} disabled={state.submitting} value={registration.password_confirm} onChange={updateRegistration('password_confirm')} className={inputClass} placeholder="••••••••" />
                </AuthField>
              )}
            </div>

            {state.error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700" role="alert">{state.error}</p>}
            <button type="submit" disabled={state.submitting || loading} className="focus-ring group flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#17372f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(23,55,47,.18)] transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:cursor-wait disabled:translate-y-0 disabled:opacity-75">
              {state.submitting || loading ? <span role="status" aria-label={state.submitting ? (mode === 'signup' ? 'Creating account' : 'Signing in') : 'Checking account'} className="flex w-28 items-center gap-2"><Skeleton className="nexora-skeleton-ink size-4 rounded-full" /><Skeleton className="nexora-skeleton-ink h-2.5 flex-1 rounded-full" /></span> : <>{mode === 'signup' ? <UserPlus size={16} /> : <LockKeyhole size={16} />}{mode === 'signup' ? 'Create account' : 'Sign in'}<ArrowRight size={15} className="transition group-hover:translate-x-1" /></>}
            </button>
          </form>

          <div className="mt-7 text-center text-xs text-[#31594f]/60">
            {merchant ? <Link to="/login" className="focus-ring font-semibold text-[#17372f] hover:text-violet-700" aria-label="Buyer sign in">Sign in as a buyer</Link> : mode === 'signup' ? <>Already have an account? <button type="button" onClick={() => switchMode('signin')} className="focus-ring font-semibold text-[#17372f]">Sign in</button></> : <>New to Nexora? <button type="button" onClick={() => switchMode('signup')} className="focus-ring font-semibold text-[#17372f]">Join Nexora</button></>}
          </div>
        </div>
      </section>
    </main>
  )
}
