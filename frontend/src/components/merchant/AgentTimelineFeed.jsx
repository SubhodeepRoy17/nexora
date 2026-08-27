import { AlertTriangle, Check, CircleDollarSign, Radio, RotateCcw, Search, Sparkles } from 'lucide-react'

const typeStyles = {
  converted: { icon: CircleDollarSign, color: 'bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,.28)]', label: 'Sale completed', labelColor: 'text-emerald-400' },
  recommended: { icon: Sparkles, color: 'bg-indigo-500 text-white shadow-glow', label: 'Recommended', labelColor: 'text-indigo-400' },
  searched: { icon: Search, color: 'bg-slate-700 text-slate-300', label: 'Search match', labelColor: 'text-slate-400' },
  warning: { icon: AlertTriangle, color: 'bg-[#DC143C] text-white shadow-[0_0_18px_rgba(220,20,60,.22)]', label: 'Action stopped', labelColor: 'text-[#ff607f]' },
  refunded: { icon: RotateCcw, color: 'bg-violet-600 text-white', label: 'Refund confirmed', labelColor: 'text-violet-300' },
}

export default function AgentTimelineFeed({ events, expanded = false }) {
  const visibleEvents = expanded ? events : events.slice(0, 5)

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-slate-950/20">
      <header className="flex items-start justify-between"><div><div className="flex items-center gap-2"><Radio size={16} className="text-indigo-400" /><h2 className="text-sm font-semibold text-white">Recent shopper activity</h2></div><p className="mt-1 text-[10px] text-slate-500">See why products were suggested and what happened next.</p></div><span className="flex items-center gap-1.5 border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[8px] text-slate-400">LIVE ACTIVITY</span></header>

      <div className="relative mt-6 space-y-5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-slate-800">
        {visibleEvents.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-[10px] text-slate-500">No shopper activity yet. New searches and order updates will appear automatically.</p>}
        {visibleEvents.map((event) => {
          const style = typeStyles[event.type] ?? typeStyles.searched
          const Icon = style.icon
          return (
            <article key={event.id} className="relative flex gap-3.5">
              <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border-4 border-slate-900 ${style.color}`}><Icon size={10} strokeWidth={2.5} /></span>
              <div className="min-w-0 flex-1 border-b border-slate-800/70 pb-4 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-1"><p className={`font-mono text-[8px] font-semibold uppercase tracking-wider ${style.labelColor}`}>{style.label}</p><span className="font-mono text-[8px] text-slate-600">{event.time}</span></div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-white">{event.actionLabel ?? style.label}</span> for <span className="font-semibold text-white">{event.product}</span> · {event.buyer}</p>
                <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5"><p className="font-mono text-[8px] uppercase tracking-wider text-slate-600">Reason</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{event.reason}</p></div>
                <div className="mt-2 flex items-center gap-3 font-mono text-[8px] text-slate-600">{event.score != null && <span>MATCH {event.score}%</span>}{event.amount && <span className="flex items-center gap-1 text-emerald-400"><Check size={9} /> ₹{event.amount.toLocaleString('en-IN')}</span>}<span>{event.orderId ? `ORDER ${String(event.orderId).slice(0, 8).toUpperCase()}` : 'ACTIVITY SAVED'}</span></div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
