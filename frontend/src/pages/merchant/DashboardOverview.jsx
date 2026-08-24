import { ArrowUpRight, CircleDollarSign, Eye, Package, Scale, Sparkles, Target } from 'lucide-react'
import AgentAnalyticsCard from '../../components/merchant/AgentAnalyticsCard'
import AgentTimelineFeed from '../../components/merchant/AgentTimelineFeed'

const metricIcons = { revenue: CircleDollarSign, appearances: Eye, conversions: Target, ratio: Scale }

function SparkBars({ values, emerald = false }) {
  return <div className="flex h-10 items-end gap-1">{values.map((value, index) => <span key={index} className={`w-1.5 rounded-full ${emerald ? 'bg-emerald-400/70' : 'bg-indigo-400/70'}`} style={{ height: `${value}%` }} />)}</div>
}

export default function DashboardOverview({ metrics, inventory, events, insights, funnel, onNavigate }) {
  const activeProducts = inventory.filter((product) => product.active).length
  const stockUnits = inventory.reduce((total, product) => total + product.stock, 0)

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mono-label text-indigo-400">Performance snapshot</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Good morning, Aether.</h1><p className="mt-1 text-xs text-slate-500">Your catalog appeared in 3,814 high-intent searches this week.</p></div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5"><span className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400"><Package size={14} /></span><div><p className="font-mono text-[8px] uppercase text-slate-600">Catalog live</p><p className="mt-0.5 text-[10px] font-medium text-slate-300">{activeProducts} indexed · {stockUnits} units</p></div></div>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Merchant performance metrics">
        {metrics.map((metric) => {
          const Icon = metricIcons[metric.id]
          const emerald = metric.id === 'revenue' || metric.id === 'conversions'
          return (
            <article key={metric.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:border-slate-700">
              <div className="flex items-start justify-between"><span className={`grid size-9 place-items-center rounded-xl ${emerald ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}><Icon size={17} /></span><SparkBars values={metric.trend} emerald={emerald} /></div>
              <p className="mt-5 text-[10px] font-medium text-slate-500">{metric.label}</p><div className="mt-1 flex items-end justify-between"><p className="text-2xl font-semibold tracking-tight text-white">{metric.value}</p><span className="flex items-center gap-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-mono text-[8px] font-semibold text-emerald-400"><ArrowUpRight size={10} />{metric.change}</span></div><p className="mt-2 font-mono text-[8px] text-slate-600">{metric.detail}</p>
            </article>
          )
        })}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <AgentTimelineFeed events={events} />
        <AgentAnalyticsCard insights={insights} funnel={funnel} />
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl shadow-slate-950/20">
        <header className="flex items-center justify-between border-b border-slate-800 p-5"><div><div className="flex items-center gap-2"><Sparkles size={15} className="text-indigo-400" /><h2 className="text-sm font-semibold text-white">Top agent-ready products</h2></div><p className="mt-1 text-[10px] text-slate-500">Ranked by attributed conversions.</p></div><button type="button" onClick={() => onNavigate('inventory')} className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300">Manage inventory →</button></header>
        <div className="grid gap-px bg-slate-800 sm:grid-cols-3">{[...inventory].sort((a, b) => b.conversions - a.conversions).slice(0, 3).map((product, index) => <article key={product.id} className="bg-slate-900 p-4"><div className="flex items-center justify-between"><span className="font-mono text-[8px] text-slate-600">#{index + 1} · {product.sku}</span><span className={`size-2 rounded-full ${product.active ? 'bg-emerald-400' : 'bg-slate-600'}`} /></div><p className="mt-2 text-xs font-semibold text-slate-200">{product.name}</p><div className="mt-3 flex items-end justify-between"><div><p className="font-mono text-[8px] text-slate-600">AGENT CONVERSIONS</p><p className="mt-1 text-lg font-semibold text-emerald-400">{product.conversions}</p></div><p className="font-mono text-[8px] text-slate-500">{product.agentViews.toLocaleString()} views</p></div></article>)}</div>
      </section>
    </div>
  )
}
