import { CircleDollarSign, Eye, Link2, Package, Sparkles, Target } from 'lucide-react'
import AgentTimelineFeed from '../../components/merchant/AgentTimelineFeed'
import MerchantOperations from '../../components/merchant/MerchantOperations'
import DataFreshness from '../../components/common/DataFreshness'

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))
const number = (value) => new Intl.NumberFormat('en-IN').format(Number(value ?? 0))

export default function DashboardOverview({ analytics, inventory, events, onNavigate, merchantName, analyticsState, timelineState, orders, workspace, operationsState, onRetryOperations }) {
  const activeProducts = inventory.filter((product) => product.active).length
  const stockUnits = inventory.reduce((total, product) => total + product.stock, 0)
  const growth = analytics?.growth?.real ?? {}
  const metrics = [
    {
      id: 'impressions',
      label: 'Product views',
      value: number(analytics?.total_agent_impressions),
      detail: 'Times your products were shown',
      icon: Eye,
    },
    {
      id: 'conversions',
      label: 'Completed purchases',
      value: number(analytics?.agent_conversions),
      detail: `${Number(analytics?.agent_conversion_rate ?? 0).toFixed(2)}% of product views`,
      icon: Target,
    },
    {
      id: 'revenue',
      label: 'Product revenue',
      value: money(analytics?.agent_attributed_revenue),
      detail: 'Completed product sales',
      icon: CircleDollarSign,
    },
    {
      id: 'growth',
      label: 'Optional item revenue',
      value: money(growth.incremental_paid_revenue),
      detail: `${number(growth.paid_attached_offers)} purchased from ${number(growth.offer_impressions)} offers`,
      icon: Link2,
    },
  ]

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="border-l-2 border-violet-500 pl-4">
          <p className="mono-label text-violet-400">Current performance</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">{merchantName ?? 'Merchant'} overview</h1>
          <p className="mt-1 text-xs text-slate-500">Your products were shown {number(analytics?.total_agent_impressions)} times in the selected period.</p>
        </div>
        <div className="flex items-center gap-3 border border-slate-800 bg-slate-900 px-3.5 py-2.5">
          <span className="grid size-8 place-items-center bg-emerald-500/10 text-emerald-400">
            <Package size={14} />
          </span>
          <div>
            <p className="font-mono text-[8px] uppercase text-slate-600">Your live products</p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-300">
              {activeProducts} visible · {stockUnits} available units
            </p>
          </div>
        </div>
      </div>

      <section className="mt-6 grid gap-px border border-slate-800 bg-slate-800 sm:grid-cols-2 xl:grid-cols-4" aria-label="Merchant performance metrics">
        {metrics.map(({ id, label, value, detail, icon: Icon }, index) => (
          <article key={id} className="group bg-slate-900 p-5 transition hover:bg-slate-900/70">
            <div className="flex items-start justify-between">
              <span className={`grid size-9 place-items-center ${id === 'revenue' || id === 'growth' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-violet-500/10 text-violet-400'}`}>
                <Icon size={17} />
              </span>
              <span className="font-mono text-[8px] text-slate-700">0{index + 1}</span>
            </div>
            <p className="mt-5 text-[10px] text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{value}</p>
            <p className="mt-2 font-mono text-[8px] text-slate-600">{detail}</p>
          </article>
        ))}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div>
          <div className="mb-2 flex justify-end">
            <DataFreshness updatedAt={timelineState.updatedAt} loading={timelineState.loading} staleAfterMs={20000} dark />
          </div>
          <AgentTimelineFeed events={events} />
        </div>
        <section className="border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-violet-400" />
              <h2 className="text-sm font-semibold text-white">Offer performance</h2>
            </div>
            <DataFreshness updatedAt={analyticsState.updatedAt} loading={analyticsState.loading} staleAfterMs={30000} dark />
          </div>
          <dl className="mt-4 space-y-3 text-[10px]">
            <div className="flex justify-between">
              <dt className="text-slate-500">Shopper responses</dt>
              <dd className="text-white">
                {number(growth.responded_offers)} / {number(growth.offer_impressions)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Acceptance rate</dt>
              <dd className="text-white">{Number(growth.accept_rate_percent ?? 0).toFixed(2)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Purchased offer rate</dt>
              <dd className="text-white">{Number(growth.paid_attachment_rate_percent ?? 0).toFixed(2)}%</dd>
            </div>
          </dl>
          <p className="mt-4 border border-violet-500/20 bg-violet-500/5 p-3 text-[9px] leading-relaxed text-slate-400">Only real shopper activity is included in these figures.</p>
          <button type="button" onClick={() => onNavigate('insights')} className="mt-4 text-[10px] font-semibold text-violet-400">
            View offer details and missed demand →
          </button>
        </section>
      </div>
      <div className="mt-5">
        <MerchantOperations orders={orders} workspace={workspace} state={operationsState} onRetry={onRetryOperations} />
      </div>
    </div>
  )
}
