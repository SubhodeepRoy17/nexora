import { Bot, LogIn, LogOut, Menu, Radio, Store, UserPlus, X } from 'lucide-react'
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

  const go = (path) => {
    setMobileOpen(false)
    navigate(path)
  }

  return (
    <header className="sticky top-0 z-[60] h-16 border-b border-slate-300 bg-white/95 px-3 text-slate-950 backdrop-blur-xl sm:px-5">
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-4">
        <Link to="/" className="focus-ring shrink-0" aria-label="Nexora home"><Brand inverse /></Link>

        {landing && (
          <nav className="hidden h-full items-stretch border-x border-slate-200 lg:flex" aria-label="Landing navigation">
            {[
              ['Product', '#product'],
              ['How it works', '#how-it-works'],
              ['Safety', '#safety'],
              ['Agent API', '/api/commerce/v1/openapi.json'],
            ].map(([label, href]) => <a key={label} href={href} className="focus-ring grid min-w-28 place-items-center border-r border-slate-200 px-5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition last:border-0 hover:bg-violet-50 hover:text-violet-700">{label}</a>)}
          </nav>
        )}

        {!landing && (
          <div className="hidden items-center gap-1 border border-slate-200 bg-[#f6f5f1] p-1 md:flex" role="group" aria-label="Application workspace">
            <button type="button" onClick={() => go('/buyer')} aria-pressed={buyerMode} className={`focus-ring flex items-center gap-2 px-4 py-2 text-[10px] font-semibold transition ${buyerMode ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-white hover:text-slate-950'}`}><Bot size={13} /> Buyer agent</button>
            <button type="button" onClick={() => go('/merchant')} aria-pressed={merchantMode} className={`focus-ring flex items-center gap-2 px-4 py-2 text-[10px] font-semibold transition ${merchantMode ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-white hover:text-slate-950'}`}><Store size={13} /> Merchant OS</button>
          </div>
        )}

        <div className="hidden items-center gap-2 sm:flex">
          <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 xl:flex"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-30" /><span className="relative size-2 rounded-full bg-emerald-500" /></span><Radio size={11} className="text-emerald-600" /><span className="font-mono text-[7px] font-semibold uppercase tracking-[0.13em] text-emerald-700">Agent network live</span></span>
          {landing && <button type="button" onClick={() => go('/buyer')} className="focus-ring border border-slate-300 bg-white px-4 py-2.5 text-[10px] font-bold transition hover:border-slate-950">Try buyer</button>}
          {!loading && !user && <button type="button" onClick={() => go('/login?mode=signup')} className="focus-ring flex items-center gap-2 border border-violet-300 bg-violet-50 px-4 py-2.5 text-[10px] font-bold text-violet-700 transition hover:border-violet-600 hover:bg-violet-100"><UserPlus size={13} /> Sign up</button>}
          <button type="button" onClick={() => user ? signOut() : go('/login')} title={user ? `Signed in as ${user.display_name}` : 'Sign in'} className="focus-ring flex items-center gap-2 border border-slate-950 bg-slate-950 px-4 py-2.5 text-[10px] font-bold text-white transition hover:bg-violet-600">
            {user ? <LogOut size={13} /> : <LogIn size={13} />}<span>{user ? 'Sign out' : 'Sign in'}</span>
          </button>
        </div>

        <button type="button" onClick={() => setMobileOpen((open) => !open)} className="focus-ring grid size-10 place-items-center border border-slate-300 sm:hidden" aria-expanded={mobileOpen} aria-label="Toggle navigation">{mobileOpen ? <X size={18} /> : <Menu size={18} />}</button>
      </div>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-16 border-b border-slate-300 bg-white p-4 shadow-xl sm:hidden">
          <div className="grid gap-2">
            {landing && <><a href="#product" onClick={() => setMobileOpen(false)} className="border border-slate-200 px-4 py-3 text-xs font-semibold">Product</a><a href="#how-it-works" onClick={() => setMobileOpen(false)} className="border border-slate-200 px-4 py-3 text-xs font-semibold">How it works</a><a href="#safety" onClick={() => setMobileOpen(false)} className="border border-slate-200 px-4 py-3 text-xs font-semibold">Safety</a></>}
            <button type="button" onClick={() => go('/buyer')} className="flex items-center gap-2 border border-slate-200 px-4 py-3 text-left text-xs font-semibold"><Bot size={14} /> Buyer agent</button>
            <button type="button" onClick={() => go('/merchant')} className="flex items-center gap-2 border border-slate-200 px-4 py-3 text-left text-xs font-semibold"><Store size={14} /> Merchant OS</button>
            {!loading && !user && <button type="button" onClick={() => go('/login?mode=signup')} className="flex items-center justify-center gap-2 border border-violet-300 bg-violet-50 px-4 py-3 text-xs font-semibold text-violet-700"><UserPlus size={14} /> Sign up</button>}
            {!loading && <button type="button" onClick={() => { setMobileOpen(false); user ? signOut() : navigate('/login') }} className="flex items-center justify-center gap-2 bg-slate-950 px-4 py-3 text-xs font-semibold text-white">{user ? <LogOut size={14} /> : <LogIn size={14} />}{user ? 'Sign out' : 'Sign in'}</button>}
          </div>
        </div>
      )}
    </header>
  )
}
