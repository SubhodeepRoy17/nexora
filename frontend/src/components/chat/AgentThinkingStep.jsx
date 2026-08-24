import { Check, CircleDashed, Search, Sparkles } from 'lucide-react'

export default function AgentThinkingStep({ steps, activeIndex }) {
  return (
    <div className="flex max-w-2xl gap-3" aria-live="polite" aria-label="Agent progress">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-indigo-400/40 bg-indigo-500/15 text-indigo-400 shadow-glow"><Sparkles size={13} /></span>
      <div className="thinking-border w-full rounded-2xl bg-slate-900 p-4 shadow-glow-strong">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2"><Search size={13} className="animate-pulse text-indigo-400" /><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-indigo-300">Agent working</span></div>
          <span className="font-mono text-[8px] text-slate-600">STEP {Math.min(activeIndex + 1, steps.length)}/{steps.length}</span>
        </div>
        <div className="space-y-3">
          {steps.map((step, index) => {
            const complete = index < activeIndex
            const active = index === activeIndex
            return (
              <div key={step.id} className={`flex items-start gap-3 transition-opacity duration-300 ${index > activeIndex ? 'opacity-30' : 'opacity-100'}`}>
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${complete ? 'border-emerald-400 bg-emerald-500 text-white' : active ? 'border-indigo-400 bg-indigo-500/15 text-indigo-300 shadow-glow' : 'border-slate-700 text-slate-600'}`}>
                  {complete ? <Check size={11} strokeWidth={3} /> : <CircleDashed size={11} className={active ? 'animate-spin' : ''} />}
                </span>
                <div><p className={`font-mono text-[10px] font-medium ${complete ? 'text-emerald-400' : active ? 'text-slate-100' : 'text-slate-500'}`}>{step.label}{active && <span className="animate-pulse">...</span>}</p><p className="mt-1 text-[10px] text-slate-500">{step.detail}</p></div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
