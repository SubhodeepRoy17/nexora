import { useEffect, useRef, useState } from 'react'
import { LogIn, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

function accountIdentity(user) {
  if (!user) return { name: 'Guest mode', initials: 'G', detail: 'History is not saved' }
  const name = (user.display_name || user.username || user.email || 'Nexora user').trim()
  const initialSource = name.includes('@') ? name.split('@')[0] : name
  const parts = initialSource.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts.at(-1)[0]}`
    : parts[0]?.slice(0, 2) || 'N'
  return { name, initials: initials.toUpperCase(), detail: 'Signed in' }
}

export function WorkspaceSidebarToggle({ open, onToggle, controls, label }) {
  const accessibleLabel = label || (open ? 'Close sidebar' : 'Open sidebar')
  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      aria-controls={controls}
      aria-expanded={open}
      onClick={onToggle}
      className="focus-ring grid size-10 shrink-0 cursor-ew-resize place-items-center rounded-xl text-[#31594f] transition hover:bg-white/75 hover:text-[#17372f]"
    >
      {open ? <PanelLeftClose size={20} strokeWidth={1.8} /> : <PanelLeftOpen size={20} strokeWidth={1.8} />}
    </button>
  )
}

export function WorkspaceAccountMenu({ user, compact = false, detail }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const identity = accountIdentity(user)

  useEffect(() => {
    if (!open) return undefined
    const dismissOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const dismissOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', dismissOutside)
    window.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      window.removeEventListener('keydown', dismissOnEscape)
    }
  }, [open])

  const action = async () => {
    setOpen(false)
    if (user) await signOut()
    else navigate('/login')
  }

  return (
    <div ref={rootRef} className={`relative ${compact ? 'flex justify-center' : ''}`}>
      {open && (
        <div role="menu" aria-label="Account options" className={`absolute bottom-full z-50 mb-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,.18)] ${compact ? 'left-0 w-56' : 'inset-x-0'}`}>
          <button type="button" role="menuitem" onClick={action} className="focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
            {user ? <LogOut size={16} /> : <LogIn size={16} />}
            {user ? 'Sign out' : 'Sign in'}
          </button>
        </div>
      )}
      <button
        type="button"
        aria-label={`Open account menu for ${identity.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`focus-ring flex items-center rounded-xl text-left transition hover:bg-white/75 ${compact ? 'justify-center p-1.5' : 'w-full gap-3 px-2 py-2'}`}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-300 text-xs font-semibold tracking-wide text-slate-700 ring-1 ring-slate-400/35">
          {identity.initials}
        </span>
        {!compact && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-800">{identity.name}</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">{detail || identity.detail}</span>
          </span>
        )}
      </button>
    </div>
  )
}
