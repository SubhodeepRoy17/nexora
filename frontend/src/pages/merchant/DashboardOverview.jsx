import { CircleDollarSign, Eye, Link2, Package, Sparkles, Target } from 'lucide-react'
import AgentTimelineFeed from '../../components/merchant/AgentTimelineFeed'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value ?? 0))
const number = (value) => new Intl.NumberFormat('en-IN').format(Number(value ?? 0))

export default function DashboardOverview({ analytics, inventory, events, onNavigate, merchantName }) {
  const activeProducts = inventory.filter((product) => product.active).length
  const stockUnits = inventory.reduce((total, product) => total + product.stock, 0)
  const growth = analytics?.growth?.real ?? {}
  const metrics = [
    { id: 'impressions', label: 'Agent impressions', value: number(analytics?.total_agent_impressions), detail: 'All recorded catalog impressions', icon: Eye },
    { id: 'conversions', label: 'Paid conversions', value: number(analytics?.agent_conversions), detail: `${Number(analytics?.agent_conversion_rate ?? 0).toFixed(2)}% of impressions`, icon: Target },
    { id: 'revenue', label: 'Paid catalog revenue', value: money(analytics?.agent_attributed_revenue), detail: 'Merchant order lines only', icon: CircleDollarSign },
    { id: 'growth', label: 'Add-on revenue', value: money(growth.incremental_paid_revenue), detail: `${number(growth.paid_attached_offers)} paid / ${number(growth.offer_impressions)} offered`, icon: Link2 },
  ]

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="border-l-2 border-violet-500 pl-4"><p className="mono-label text-violet-400">Live performance snapshot</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">{merchantName ?? 'Merchant'} overview</h1><p className="mt-1 text-xs text-slate-500">{number(analytics?.total_agent_impressions)} recorded catalog impressions in the measured dataset.</p></div>
        <div className="flex items-center gap-3 border border-slate-800 bg-slate-900 px-3.5 py-2.5"><span className="grid size-8 place-items-center bg-emerald-500/10 text-emerald-400"><Package size={14} /></span><div><p className="font-mono text-[8px] uppercase text-slate-600">Catalog live</p><p className="mt-0.5 text-[10px] font-medium text-slate-300">{activeProducts} indexed · {stockUnits} available units</p></div></div>
      </div>

      <section className="mt-6 grid gap-px border border-slate-800 bg-slate-800 sm:grid-cols-2 xl:grid-cols-4" aria-label="Merchant performance metrics">{metrics.map(({ id, label, value, detail, icon: Icon }, index) => <article key={id} className="group bg-slate-900 p-5 transition hover:bg-slate-900/70"><div className="flex items-start justify-between"><span className={`grid size-9 place-items-center ${id === 'revenue' || id === 'growth' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-violet-500/10 text-violet-400'}`}><Icon size={17} /></span><span className="font-mono text-[8px] text-slate-700">0{index + 1}</span></div><p className="mt-5 text-[10px] text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight text-white">{value}</p><p className="mt-2 font-mono text-[8px] text-slate-600">{detail}</p></article>)}</section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <AgentTimelineFeed events={events} />
        <section className="border border-slate-800 bg-slate-900 p-5"><div className="flex items-center gap-2"><Sparkles size={15} className="text-violet-400" /><h2 className="text-sm font-semibold text-white">Growth attribution</h2></div><dl className="mt-4 space-y-3 text-[10px]"><div className="flex justify-between"><dt className="text-slate-500">Offer responses</dt><dd className="text-white">{number(growth.responded_offers)} / {number(growth.offer_impressions)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Accept rate</dt><dd className="text-white">{Number(growth.accept_rate_percent ?? 0).toFixed(2)}%</dd></div><div className="flex justify-between"><dt className="text-slate-500">Paid attachment rate</dt><dd className="text-white">{Number(growth.paid_attachment_rate_percent ?? 0).toFixed(2)}%</dd></div></dl><p className="mt-4 border border-violet-500/20 bg-violet-500/5 p-3 text-[9px] leading-relaxed text-slate-400">{analytics?.growth?.attribution_note ?? 'No attribution data yet.'}</p><button type="button" onClick={() => onNavigate('insights')} className="mt-4 text-[10px] font-semibold text-violet-400">View denominators and gaps →</button></section>
      </div>
    </div>
  )
}
