import { Bot, LogIn, LogOut, Menu, Store, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Brand from '../Brand'

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const landing = location.pathname === '/'
  const merchantMode = location.pathname.startsWith('/merchant')
  const buyerMode = location.pathname.startsWith('/buyer')
  const workspaceMode = merchantMode || buyerMode
  const centerLinks = landing
    ? [
        ['Product', '#product'],
        ['How it works', '#how-it-works'],
        ['Safety', '#safety'],
      ]
    : [
        ['Shopping assistant', '/buyer'],
        ['Seller workspace', '/merchant'],
      ]

  const go = (path) => {
    setMobileOpen(false)
    navigate(path)
  }

  return (
    <header className={`${landing ? 'fixed backdrop-blur-md' : workspaceMode ? 'pointer-events-none fixed' : 'sticky backdrop-blur-md'} top-0 z-[60] h-16 w-full bg-transparent px-3 text-slate-950 sm:px-5`}>
      <div className="relative mx-auto flex h-full max-w-[1440px] items-center justify-between gap-4">
        {!workspaceMode && <Link to="/" className="focus-ring shrink-0" aria-label="Nexora home"><Brand /></Link>}

        <nav className="pointer-events-auto absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 lg:flex xl:gap-11" aria-label={landing ? 'Landing navigation' : 'Application navigation'}>
          {centerLinks.map(([label, href]) => {
            const active = href === '/buyer' ? buyerMode : href === '/merchant' ? merchantMode : false
            const className = `focus-ring relative py-2 text-[11px] font-semibold text-[#31594f] drop-shadow-[0_1px_0_rgba(255,255,255,.95)] transition after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-center after:bg-[#17372f] after:transition-transform hover:text-[#17372f] ${active ? 'text-[#17372f] after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100'}`
            return href.startsWith('/') && !href.startsWith('/api/')
              ? <Link key={label} to={href} className={className} aria-current={active ? 'page' : undefined}>{label}</Link>
              : <a key={label} href={href} className={className}>{label}</a>
          })}
        </nav>

        {!workspaceMode && <div className="hidden items-center gap-2 lg:flex">
          {!loading && !user && <button type="button" onClick={() => go('/login?mode=signup')} className="focus-ring flex items-center gap-2 rounded-full border border-violet-300 bg-white/55 px-4 py-2.5 text-[10px] font-bold text-violet-700 backdrop-blur-sm transition hover:border-violet-600 hover:bg-white"><UserPlus size={13} /> Sign up</button>}
          <button type="button" onClick={() => user ? signOut() : go('/login')} title={user ? `Signed in as ${user.display_name}` : 'Sign in'} className="focus-ring flex items-center gap-2 rounded-full border border-black bg-black px-4 py-2.5 text-[10px] font-bold text-white transition hover:border-violet-700 hover:bg-violet-700">
            {user ? <LogOut size={13} /> : <LogIn size={13} />}<span>{user ? 'Sign out' : 'Sign in'}</span>
          </button>
        </div>}

        <button type="button" onClick={() => setMobileOpen((open) => !open)} className="focus-ring pointer-events-auto ml-auto grid size-10 place-items-center rounded-full bg-white/70 text-emerald-950 shadow-sm backdrop-blur-sm lg:hidden" aria-expanded={mobileOpen} aria-label="Toggle navigation">{mobileOpen ? <X size={18} /> : <Menu size={18} />}</button>
      </div>

      {mobileOpen && (
        <div className="pointer-events-auto absolute inset-x-0 top-16 border-b border-emerald-950/10 bg-[#f6f8f2]/95 p-4 shadow-xl backdrop-blur-xl lg:hidden">
          <div className="grid gap-2">
            {landing && <><a href="#product" onClick={() => setMobileOpen(false)} className="border border-slate-200 px-4 py-3 text-xs font-semibold">Product</a><a href="#how-it-works" onClick={() => setMobileOpen(false)} className="border border-slate-200 px-4 py-3 text-xs font-semibold">How it works</a><a href="#safety" onClick={() => setMobileOpen(false)} className="border border-slate-200 px-4 py-3 text-xs font-semibold">Safety</a></>}
            {!landing && <><button type="button" onClick={() => go('/buyer')} className="flex items-center gap-2 border border-slate-200 px-4 py-3 text-left text-xs font-semibold"><Bot size={14} /> Shopping assistant</button><button type="button" onClick={() => go('/merchant')} className="flex items-center gap-2 border border-slate-200 px-4 py-3 text-left text-xs font-semibold"><Store size={14} /> Seller workspace</button></>}
            {!workspaceMode && !loading && !user && <button type="button" onClick={() => go('/login?mode=signup')} className="flex items-center justify-center gap-2 border border-violet-300 bg-violet-50 px-4 py-3 text-xs font-semibold text-violet-700"><UserPlus size={14} /> Sign up</button>}
            {!workspaceMode && !loading && <button type="button" onClick={() => { setMobileOpen(false); user ? signOut() : navigate('/login') }} className="flex items-center justify-center gap-2 bg-slate-950 px-4 py-3 text-xs font-semibold text-white">{user ? <LogOut size={14} /> : <LogIn size={14} />}{user ? 'Sign out' : 'Sign in'}</button>}
          </div>
        </div>
      )}
    </header>
  )
}
