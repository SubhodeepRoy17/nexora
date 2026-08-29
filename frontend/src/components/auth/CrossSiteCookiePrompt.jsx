import { useCallback, useMemo, useState } from 'react'
import { CheckCircle2, Cookie, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap'
import { Skeleton } from '../common/LoadingSkeletons'

function browserGuidance(userAgent = '') {
  if (/Edg\//i.test(userAgent)) {
    return 'In Edge, select the cookie icon in the address bar and allow third-party cookies for Nexora.'
  }
  if (/Firefox\//i.test(userAgent)) {
    return 'In Firefox, select the shield in the address bar and turn off Enhanced Tracking Protection for Nexora.'
  }
  if (/Safari\//i.test(userAgent) && !/Chrome|Chromium|Edg\//i.test(userAgent)) {
    return 'In Safari, open Settings → Privacy and allow cross-site tracking for this demo, then return here.'
  }
  return 'In Chrome, select the third-party-cookie icon in the address bar and allow cookies for Nexora.'
}

export default function CrossSiteCookiePrompt() {
  const { cookieAccess, recheckCookieAccess } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const open = cookieAccess === 'blocked' && !dismissed
  const guidance = useMemo(
    () => browserGuidance(typeof navigator === 'undefined' ? '' : navigator.userAgent),
    [],
  )
  const close = useCallback(() => setDismissed(true), [])
  const dialogRef = useDialogFocusTrap(open, close)

  const recheck = async () => {
    setChecking(true)
    setMessage('')
    const nextCookieAccess = await recheckCookieAccess()
    setChecking(false)
    if (nextCookieAccess === 'available' || nextCookieAccess === 'same-origin') {
      setMessage('Cookie access is ready. You can sign in securely.')
      window.setTimeout(close, 700)
      return
    }
    setMessage('Cookies are still blocked. Update the browser setting, then try again.')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[240] grid place-items-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm" role="presentation">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-permission-title"
        aria-describedby="cookie-permission-copy"
        tabIndex={-1}
        className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_32px_100px_rgba(15,23,42,.28)]"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Continue without signing in"
          className="focus-ring absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <X size={18} />
        </button>

        <div className="border-b border-emerald-950/10 bg-[linear-gradient(135deg,#eef7ef_0%,#f8f4e8_52%,#f5f0ff_100%)] px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
          <div className="grid size-12 place-items-center rounded-2xl border border-white/80 bg-white text-emerald-800 shadow-sm">
            <Cookie size={23} />
          </div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[.18em] text-emerald-800/70">Browser permission needed</p>
          <h2 id="cookie-permission-title" className="mt-2 pr-10 text-2xl font-semibold tracking-[-.035em] text-[#17372f] sm:text-3xl">
            Allow third-party cookies to sign in
          </h2>
          <p id="cookie-permission-copy" className="mt-3 max-w-md text-sm leading-6 text-[#31594f]">
            Nexora’s deployed app and secure API currently use different sites. Your browser must return Django’s session and CSRF cookies for private chats, merchant access, and checkout.
          </p>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm leading-6 text-amber-950">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            <p>{guidance} Then select <strong>I’ve enabled cookies</strong>.</p>
          </div>

          {message && (
            <p role="status" className={`flex items-center gap-2 text-sm font-medium ${message.startsWith('Cookie access') ? 'text-emerald-700' : 'text-rose-700'}`}>
              {message.startsWith('Cookie access') && <CheckCircle2 size={17} />}
              {message}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              className="focus-ring rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Continue as guest
            </button>
            <button
              type="button"
              onClick={recheck}
              disabled={checking}
              aria-label={checking ? 'Checking cookie access' : undefined}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[#17372f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(23,55,47,.2)] transition hover:bg-[#244b41] disabled:cursor-wait disabled:opacity-65"
            >
              {checking ? <span role="status" aria-label="Checking cookie access" className="flex w-36 items-center gap-2"><Skeleton className="nexora-skeleton-ink size-4 rounded-full" /><Skeleton className="nexora-skeleton-ink h-2.5 flex-1 rounded-full" /></span> : <><RefreshCw size={16} />I’ve enabled cookies</>}
            </button>
          </div>

          <p className="text-center text-[11px] leading-5 text-slate-400">
            Browsers do not provide websites a location-style button for changing this global privacy setting. Nexora only verifies whether its credential cookie was returned.
          </p>
        </div>
      </section>
    </div>
  )
}
