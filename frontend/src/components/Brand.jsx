import { Sparkles } from 'lucide-react'

export default function Brand({ compact = false, inverse = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid size-8 place-items-center rounded-xl bg-indigo-500 text-white shadow-glow">
        <Sparkles size={16} strokeWidth={2.2} />
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-slate-950 bg-emerald-400" />
      </div>
      {!compact && (
        <div>
          <p className={`text-sm font-bold leading-none tracking-tight ${inverse ? 'text-slate-950' : 'text-white'}`}>NEXORA</p>
          <p className={`mt-1 font-mono text-[8px] uppercase tracking-[0.22em] ${inverse ? 'text-slate-500' : 'text-slate-500'}`}>Intent to order</p>
        </div>
      )}
    </div>
  )
}
