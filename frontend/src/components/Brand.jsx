import { Sparkles } from 'lucide-react'

export default function Brand({ compact = false, inverse = false, wordmark = false }) {
  if (wordmark) {
    return <span className="nexora-wordmark text-[1.7rem] font-semibold leading-none text-[#17372f] sm:text-[2rem]">NEXORA</span>
  }

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid size-8 place-items-center bg-violet-600 text-white shadow-[3px_3px_0_#111827]">
        <Sparkles size={16} strokeWidth={2.2} />
        <span className={`absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 bg-emerald-400 ${inverse ? 'border-[#f6f5f1]' : 'border-white'}`} />
      </div>
      {!compact && (
        <div>
          <p className="text-sm font-extrabold leading-none tracking-[-0.03em] text-slate-950">NEXORA</p>
          <p className="mt-1 font-mono text-[7px] font-semibold uppercase tracking-[0.2em] text-slate-500">Intent to order</p>
        </div>
      )}
    </div>
  )
}
