import { AlertTriangle, ArrowDownRight, IndianRupee, Lightbulb, TrendingDown } from 'lucide-react'

export default function AgentAnalyticsCard({ insights, funnel, expanded = false }) {
  const lostDeals = insights.reduce((total, insight) => total + insight.count, 0)

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-slate-950/20">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><TrendingDown size={16} className="text-[#ff607f]" /><h2 className="text-sm font-semibold text-white">Lost conversions</h2></div><p className="mt-1 text-[10px] text-slate-500">Agentic reasons extracted from buyer decisions.</p></div><span className="flex w-fit items-center gap-1.5 rounded-full border border-[#DC143C]/25 bg-[#DC143C]/10 px-2.5 py-1.5 font-mono text-[8px] font-semibold text-[#ff607f]"><ArrowDownRight size={11} /> {lostDeals} DEALS LOST</span></header>

      <div className={`mt-5 grid gap-5 ${expanded ? 'xl:grid-cols-[1.1fr_.9fr]' : ''}`}>
        <div className="space-y-3">
          {insights.map((insight) => (
            <article key={insight.id} className={`rounded-xl border p-3.5 ${insight.severity === 'critical' ? 'border-rose-500/20 bg-rose-500/5' : 'border-amber-500/15 bg-amber-500/5'}`}>
              <div className="flex items-start gap-3"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${insight.severity === 'critical' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}><AlertTriangle size={14} /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-slate-200">{insight.title}</p><span className="font-mono text-[8px] text-rose-400">-{insight.impact}</span></div><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{insight.message}</p><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${insight.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${insight.share}%` }} /></div></div></div>
            </article>
          ))}
          <div className="flex gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3"><Lightbulb size={14} className="mt-0.5 shrink-0 text-indigo-400" /><p className="text-[9px] leading-relaxed text-slate-400"><span className="font-semibold text-indigo-300">Suggested action:</span> Reduce K2 Pro pricing to ₹7,499 and restore K3 Max stock to recover an estimated 14 conversions next week.</p></div>
        </div>

        {expanded && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center gap-2"><IndianRupee size={14} className="text-emerald-400" /><p className="font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-300">Agent conversion funnel</p></div>
            <div className="mt-5 space-y-4">{funnel.map((stage, index) => <div key={stage.label}><div className="mb-1.5 flex items-center justify-between"><span className="text-[10px] text-slate-500">{stage.label}</span><span className={`font-mono text-[9px] ${index === funnel.length - 1 ? 'text-emerald-400' : 'text-slate-300'}`}>{stage.display}</span></div><div className="h-7 overflow-hidden rounded-md bg-slate-800/80"><div className={`flex h-full items-center rounded-md px-2 transition-all ${index === funnel.length - 1 ? 'bg-emerald-500/70' : 'bg-indigo-500/50'}`} style={{ width: `${stage.width}%` }}><span className="font-mono text-[7px] text-white/70">{index === 0 ? '100%' : `${((stage.value / funnel[0].value) * 100).toFixed(1)}%`}</span></div></div></div>)}</div>
            <div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-lg border border-slate-800 p-3"><p className="font-mono text-[7px] uppercase text-slate-600">Recommendation CTR</p><p className="mt-1 text-lg font-semibold text-white">60.3%</p></div><div className="rounded-lg border border-slate-800 p-3"><p className="font-mono text-[7px] uppercase text-slate-600">Final conversion</p><p className="mt-1 text-lg font-semibold text-emerald-400">7.42%</p></div></div>
          </div>
        )}
      </div>
    </section>
  )
}
