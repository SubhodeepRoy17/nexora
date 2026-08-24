import { Bot, LogIn, LogOut, Radio, Store } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Brand from '../Brand'

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading, signOut } = useAuth()
  const merchantMode = location.pathname.startsWith('/merchant')

  return (
    <header className="sticky top-0 z-[45] h-16 border-b border-slate-800 bg-slate-950/90 px-3 backdrop-blur-xl sm:px-5">
      <div className="mx-auto flex h-full max-w-[1800px] items-center justify-between gap-3">
        <Link to="/" className="focus-ring rounded-xl transition hover:drop-shadow-[0_0_12px_rgba(99,102,241,.45)]" aria-label="Nexora buyer home"><Brand /></Link>

        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5 md:gap-2 md:px-3">
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" /><span className="relative inline-flex size-2 rounded-full bg-emerald-400" /></span>
          <Radio size={11} className="hidden text-emerald-400 md:block" />
          <span className="hidden font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-emerald-300 md:inline">Agent Network Active</span>
          <span className="font-mono text-[7px] font-semibold uppercase tracking-wider text-emerald-300 md:hidden">Live</span>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1 shadow-lg shadow-slate-950/30" role="group" aria-label="Application mode and account">
          <button type="button" onClick={() => navigate('/')} aria-pressed={!merchantMode} className={`focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold transition sm:px-3 ${!merchantMode ? 'bg-indigo-500 text-white shadow-glow' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'}`}><Bot size={13} /><span className="hidden sm:inline">Buyer Mode</span><span className="sm:hidden">B2C</span></button>
          <button type="button" onClick={() => navigate('/merchant')} aria-pressed={merchantMode} className={`focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold transition sm:px-3 ${merchantMode ? 'bg-indigo-500 text-white shadow-glow' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'}`}><Store size={13} /><span className="hidden sm:inline">Merchant Portal</span><span className="sm:hidden">B2B</span></button>
          {!loading && (user
            ? <button type="button" onClick={signOut} title={`Signed in as ${user.display_name}`} className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white"><LogOut size={13} /><span className="hidden lg:inline">Sign out</span></button>
            : <button type="button" onClick={() => navigate('/login')} className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white"><LogIn size={13} /><span className="hidden lg:inline">Sign in</span></button>)}
        </div>
      </div>
    </header>
  )
}
