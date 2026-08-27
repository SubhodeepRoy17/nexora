import { Check, CircleDashed, Search } from 'lucide-react'
import LogoMark from '../LogoMark'

export default function AgentThinkingStep({ steps, activeIndex }) {
  return (
    <div className="flex max-w-2xl gap-3" aria-live="polite" aria-label="Agent progress">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-violet-200 bg-white shadow-[0_8px_22px_rgba(109,40,217,.1)]"><LogoMark className="size-6" alt="" /></span>
      <div className="thinking-border w-full rounded-2xl bg-white/78 p-4 shadow-[0_12px_34px_rgba(109,40,217,.1)] backdrop-blur-md">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2"><Search size={13} className="animate-pulse text-violet-600" /><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-violet-700">Finding your best options</span></div>
          <span className="font-mono text-[8px] text-slate-400">STEP {Math.min(activeIndex + 1, steps.length)}/{steps.length}</span>
        </div>
        <div className="space-y-3">
          {steps.map((step, index) => {
            const complete = index < activeIndex
            const active = index === activeIndex
            return (
              <div key={step.id} className={`flex items-start gap-3 transition-opacity duration-300 ${index > activeIndex ? 'opacity-30' : 'opacity-100'}`}>
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${complete ? 'border-emerald-500 bg-emerald-500 text-white' : active ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-300 text-slate-400'}`}>
                  {complete ? <Check size={11} strokeWidth={3} /> : <CircleDashed size={11} className={active ? 'animate-spin' : ''} />}
                </span>
                <div><p className={`font-mono text-[10px] font-medium ${complete ? 'text-emerald-700' : active ? 'text-slate-950' : 'text-slate-400'}`}>{step.label}{active && <span className="animate-pulse">...</span>}</p><p className="mt-1 text-[10px] text-slate-500">{step.detail}</p></div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
