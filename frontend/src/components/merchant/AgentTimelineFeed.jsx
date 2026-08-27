import { AlertTriangle, Check, CircleDollarSign, Radio, RotateCcw, Search, Sparkles } from 'lucide-react'

const typeStyles = {
  converted: { icon: CircleDollarSign, color: 'bg-emerald-500 text-white', label: 'Sale completed', labelColor: 'text-emerald-700' },
  recommended: { icon: Sparkles, color: 'bg-violet-600 text-white', label: 'Recommended', labelColor: 'text-violet-700' },
  searched: { icon: Search, color: 'bg-slate-600 text-white', label: 'Search match', labelColor: 'text-slate-600' },
  warning: { icon: AlertTriangle, color: 'bg-rose-600 text-white', label: 'Action stopped', labelColor: 'text-rose-700' },
  refunded: { icon: RotateCcw, color: 'bg-violet-600 text-white', label: 'Refund confirmed', labelColor: 'text-violet-700' },
}

export default function AgentTimelineFeed({ events, expanded = false }) {
  const visibleEvents = expanded ? events : events.slice(0, 5)

  return (
    <section className="merchant-card merchant-reveal rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.07)] backdrop-blur">
      <header className="flex items-center justify-between gap-4"><div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><Radio size={16} /></span><h2 className="text-base font-semibold text-[#17372f]">Recent shopper activity</h2></div><span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"><span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />Live</span></header>

      <div className="relative mt-5 space-y-5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-emerald-950/10">
        {visibleEvents.length === 0 && <p className="rounded-xl border border-dashed border-emerald-950/15 bg-[#f7faf5] p-4 text-sm text-[#31594f]/65">No shopper activity yet. New searches and order updates will appear automatically.</p>}
        {visibleEvents.map((event) => {
          const style = typeStyles[event.type] ?? typeStyles.searched
          const Icon = style.icon
          return (
            <article key={event.id} className="relative flex gap-3.5">
              <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border-4 border-white ${style.color}`}><Icon size={10} strokeWidth={2.5} /></span>
              <div className="min-w-0 flex-1 border-b border-emerald-950/10 pb-4 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className={`text-xs font-semibold ${style.labelColor}`}>{style.label}</p><span className="text-xs text-slate-400">{event.time}</span></div>
                <p className="mt-1.5 text-sm leading-6 text-[#31594f]/80"><span className="font-semibold text-[#17372f]">{event.actionLabel ?? style.label}</span> for <span className="font-semibold text-[#17372f]">{event.product}</span> · {event.buyer}</p>
                <p className="mt-2 rounded-lg bg-[#f4f7f1] px-3 py-2 text-xs leading-5 text-slate-500">{event.reason}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">{event.score != null && <span>{event.score}% match</span>}{event.amount && <span className="flex items-center gap-1 font-semibold text-emerald-700"><Check size={11} /> ₹{event.amount.toLocaleString('en-IN')}</span>}{event.orderId && <span>Order {String(event.orderId).slice(0, 8).toUpperCase()}</span>}</div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
