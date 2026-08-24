import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Eye, Lightbulb, RefreshCw, Target, TrendingDown } from 'lucide-react'
import { getApiError, getMerchantAnalytics } from '../../services/api'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value ?? 0))
const number = (value) => new Intl.NumberFormat('en-IN').format(Number(value ?? 0))

const metricConfig = [
  { key: 'total_agent_impressions', label: 'Agent impressions', icon: Eye, format: number, trend: 'impressions_percent', color: 'indigo' },
  { key: 'agent_conversion_rate', label: 'Conversion rate', icon: Target, format: (value) => `${Number(value ?? 0).toFixed(2)}%`, trend: 'conversions_percent', color: 'emerald' },
  { key: 'agent_conversions', label: 'Paid conversions', icon: ArrowUpRight, format: number, trend: 'conversions_percent', color: 'emerald' },
  { key: 'agent_attributed_revenue', label: 'Agent revenue', icon: CircleDollarSign, format: money, color: 'emerald' },
]

export default function AgentAnalytics({ merchantId }) {
  const [state, setState] = useState({ data: null, loading: true, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const { data } = await getMerchantAnalytics(merchantId, controller.signal)
        setState({ data, loading: false, error: '' })
      } catch (error) {
        if (!controller.signal.aborted) setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Unable to load merchant analytics.') }))
      }
    }
    load()
    const poll = window.setInterval(load, 15000)
    return () => {
      window.clearInterval(poll)
      controller.abort()
    }
  }, [merchantId])

  if (state.loading && !state.data) return <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5 font-mono text-[9px] text-indigo-300"><RefreshCw size={13} className="mr-2 inline animate-spin" /> CALCULATING LIVE AGENT ATTRIBUTION…</div>
  if (state.error && !state.data) return <div className="rounded-2xl border border-[#DC143C]/30 bg-[#DC143C]/10 p-5 text-[11px] text-rose-300">{state.error}</div>

  const analytics = state.data
  const losses = analytics?.lost_opportunities?.breakdown ?? []

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricConfig.map(({ key, label, icon: Icon, format, trend, color }) => {
          const trendValue = trend ? Number(analytics?.trends?.[trend] ?? 0) : null
          const positive = trendValue == null || trendValue >= 0
          return (
            <article key={key} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:border-indigo-500/30">
              <div className="flex items-start justify-between"><span className={`grid size-9 place-items-center rounded-xl ${color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}><Icon size={17} /></span>{trendValue != null && <span className={`flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[8px] ${positive ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/20 bg-rose-500/10 text-rose-400'}`}>{positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}{Math.abs(trendValue)}%</span>}</div>
              <p className="mt-5 text-[10px] text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{format(analytics?.[key])}</p>
              <p className="mt-2 font-mono text-[8px] text-slate-600">LIVE · {analytics?.window_days}-DAY TREND</p>
            </article>
          )
        })}
      </div>

      <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-slate-950/20">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><TrendingDown size={16} className="text-rose-400" /><h2 className="text-sm font-semibold text-white">Lost Deals Insights</h2></div><p className="mt-1 text-[10px] text-slate-500">Actionable price and inventory gaps observed in real buyer searches.</p></div><span className="w-fit rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 font-mono text-[8px] text-rose-400">{number(analytics?.lost_opportunities?.total)} OPPORTUNITIES</span></header>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {losses.map((insight) => (
            <article key={`${insight.reason}-${insight.product_id}-${insight.product_title}`} className={`rounded-xl border p-4 ${insight.reason === 'PRICE' ? 'border-rose-500/20 bg-rose-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[8px] uppercase tracking-wider text-slate-500">{insight.reason === 'PRICE' ? 'Pricing gap' : 'Stock gap'}</p><p className="mt-1.5 text-xs font-semibold text-white">{insight.product_title}</p></div><span className="rounded-full bg-slate-950/70 px-2 py-1 font-mono text-[8px] text-rose-300">{insight.count} LOST</span></div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-400">{insight.message}</p>
            </article>
          ))}
          {losses.length === 0 && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-[11px] text-emerald-300">No price or stock losses have been recorded yet.</div>}
        </div>

        <div className="mt-4 flex gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3"><Lightbulb size={14} className="mt-0.5 shrink-0 text-indigo-400" /><p className="text-[9px] leading-relaxed text-slate-400"><span className="font-semibold text-indigo-300">Suggested action:</span> Prioritize the highest-frequency pricing gap, then restore stock for products repeatedly excluded from agent results.</p></div>
      </section>
    </div>
  )
}
