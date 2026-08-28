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
    <div className="merchant-section-stack">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Merchant performance metrics">
        {metrics.map(({ id, label, value, detail, icon: Icon }, index) => (
          <article key={id} className="merchant-card merchant-reveal group relative overflow-hidden rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.07)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_18px_45px_rgba(109,40,217,.1)]" style={{ animationDelay: `${index * 70}ms` }}>
            <span className="absolute -right-10 -top-10 size-24 rounded-full bg-violet-100 opacity-0 blur-2xl transition group-hover:opacity-100" />
            <div className="flex items-start justify-between">
              <span className={`grid size-10 place-items-center rounded-xl ${id === 'revenue' || id === 'growth' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                <Icon size={17} />
              </span>
              <span className="text-xs font-semibold text-[#31594f]/35">0{index + 1}</span>
            </div>
            <p className="mt-5 text-sm font-medium text-[#31594f]/70">{label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-[-.04em] text-[#17372f]">{value}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      <section className="merchant-reveal flex flex-col gap-4 rounded-2xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50/90 via-white/80 to-violet-50/80 p-5 shadow-[0_12px_36px_rgba(42,81,68,.06)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#17372f] text-white shadow-[0_8px_22px_rgba(23,55,47,.16)]"><Package size={18} /></span>
          <div>
            <h2 className="text-sm font-semibold text-[#17372f]">{merchantName ?? 'Your store'} catalog</h2>
            <p className="mt-1 text-xs text-[#31594f]/70">{activeProducts} products visible to shoppers · {stockUnits} units available</p>
          </div>
        </div>
        <button type="button" onClick={() => onNavigate('inventory')} className="focus-ring rounded-full bg-[#17372f] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-700">Manage products</button>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div>
          <div className="mb-2 flex justify-end">
            <DataFreshness updatedAt={timelineState.updatedAt} loading={timelineState.loading} staleAfterMs={20000} dark />
          </div>
          <AgentTimelineFeed events={events} />
        </div>
        <section className="merchant-card merchant-reveal h-fit self-start rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.07)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-violet-100 text-violet-700"><Sparkles size={15} /></span>
              <h2 className="text-base font-semibold text-[#17372f]">Offer performance</h2>
            </div>
            <DataFreshness updatedAt={analyticsState.updatedAt} loading={analyticsState.loading} staleAfterMs={30000} dark />
          </div>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between border-b border-emerald-950/10 pb-3">
              <dt className="text-[#31594f]/70">Shopper responses</dt>
              <dd className="font-semibold text-[#17372f]">
                {number(growth.responded_offers)} / {number(growth.offer_impressions)}
              </dd>
            </div>
            <div className="flex justify-between border-b border-emerald-950/10 pb-3">
              <dt className="text-[#31594f]/70">Acceptance rate</dt>
              <dd className="font-semibold text-[#17372f]">{Number(growth.accept_rate_percent ?? 0).toFixed(2)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#31594f]/70">Purchased offer rate</dt>
              <dd className="font-semibold text-[#17372f]">{Number(growth.paid_attachment_rate_percent ?? 0).toFixed(2)}%</dd>
            </div>
          </dl>
          <button type="button" onClick={() => onNavigate('insights')} className="mt-5 text-xs font-semibold text-violet-700 transition hover:text-violet-900">
            View sales insights →
          </button>
        </section>
      </div>
      <div>
        <MerchantOperations orders={orders} workspace={workspace} state={operationsState} onRetry={onRetryOperations} />
      </div>
    </div>
  )
}
