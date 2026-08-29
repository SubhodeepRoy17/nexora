import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Eye, Lightbulb, Link2, PackageX, Puzzle, Target, TrendingDown } from 'lucide-react'
import DataFreshness from '../../components/common/DataFreshness'
import LoadMoreRecords from '../../components/common/LoadMoreRecords'
import { MerchantInsightsSkeleton } from '../../components/common/LoadingSkeletons'
import useProgressiveList from '../../hooks/useProgressiveList'

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))
const number = (value) => new Intl.NumberFormat('en-IN').format(Number(value ?? 0))

const metricConfig = [
  {
    key: 'total_agent_impressions',
    label: 'Product views',
    icon: Eye,
    format: number,
    trend: 'impressions_percent',
    color: 'indigo',
  },
  {
    key: 'agent_conversion_rate',
    label: 'Conversion rate',
    icon: Target,
    format: (value) => `${Number(value ?? 0).toFixed(2)}%`,
    trend: 'conversions_percent',
    color: 'emerald',
  },
  {
    key: 'agent_conversions',
    label: 'Completed purchases',
    icon: ArrowUpRight,
    format: number,
    trend: 'conversions_percent',
    color: 'emerald',
  },
  {
    key: 'agent_attributed_revenue',
    label: 'Product revenue',
    icon: CircleDollarSign,
    format: money,
    color: 'emerald',
  },
]

export default function AgentAnalytics({ analytics, state, onRetry }) {
  const losses = analytics?.lost_opportunities?.breakdown ?? []
  const growth = analytics?.growth?.real ?? {}
  const topComplements = analytics?.growth?.top_converting_complements ?? []
  const rejectedOffers = analytics?.growth?.rejected_offers ?? []
  const compatibilityGaps = analytics?.growth?.compatibility_gaps ?? []
  const complementList = useProgressiveList(topComplements, 3)
  const rejectedList = useProgressiveList(rejectedOffers, 3)
  const gapList = useProgressiveList(compatibilityGaps, 3)
  const lossList = useProgressiveList(losses, 4)

  if (state.loading && !analytics)
    return <MerchantInsightsSkeleton />
  if (state.error && !analytics)
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        <p>{state.error}</p>
        <button type="button" onClick={onRetry} className="mt-3 rounded-full border border-rose-300 px-3 py-2 text-xs font-semibold">
          Try again
        </button>
      </div>
    )
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <DataFreshness updatedAt={state.updatedAt} loading={state.loading} staleAfterMs={30000} dark />
      </div>
      {state.error && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700" role="alert">
          Showing the last successful sales information. {state.error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricConfig.map(({ key, label, icon: Icon, format, trend, color }) => {
          const trendValue = trend ? Number(analytics?.trends?.[trend] ?? 0) : null
          const positive = trendValue == null || trendValue >= 0
          return (
            <article key={key} className="merchant-card merchant-reveal rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.07)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-violet-300">
              <div className="flex items-start justify-between">
                <span className={`grid size-10 place-items-center rounded-xl ${color === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                  <Icon size={17} />
                </span>
                {trendValue != null && (
                  <span className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${positive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                    {positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                    {Math.abs(trendValue)}%
                  </span>
                )}
              </div>
              <p className="mt-5 text-sm font-medium text-[#31594f]/70">{label}</p>
              <p className="mt-1 text-3xl font-semibold tracking-[-.04em] text-[#17372f]">{format(analytics?.[key])}</p>
              <p className="mt-2 text-xs text-slate-500">Past {analytics?.window_days} days</p>
            </article>
          )
        })}
      </div>

      <section className="merchant-card merchant-reveal mt-5 rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.07)] backdrop-blur">
        <header>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><Link2 size={16} /></span>
            <h2 className="text-base font-semibold text-[#17372f]">Optional offer performance</h2>
          </div>
          <p className="mt-2 text-sm text-[#31594f]/65">See how shoppers responded to related-product offers.</p>
        </header>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-xs text-slate-500">Optional item revenue</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{money(growth.incremental_paid_revenue)}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Revenue from purchased optional products</p>
          </article>
          <article className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] p-4">
            <p className="text-xs text-slate-500">Purchased offer rate</p>
            <p className="mt-2 text-2xl font-semibold text-[#17372f]">{Number(growth.paid_attachment_rate_percent ?? 0).toFixed(2)}%</p>
            <p className="mt-1 text-xs text-slate-500">
              {number(growth.paid_attached_offers)} purchased / {number(growth.offer_impressions)} offered
            </p>
          </article>
          <article className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] p-4">
            <p className="text-xs text-slate-500">Offers accepted</p>
            <p className="mt-2 text-2xl font-semibold text-[#17372f]">{number(growth.accepted_offers)}</p>
            <p className="mt-1 text-xs text-slate-500">{Number(growth.accept_rate_percent ?? 0).toFixed(2)}% of responses</p>
          </article>
          <article className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] p-4">
            <p className="text-xs text-slate-500">Offers declined</p>
            <p className="mt-2 text-2xl font-semibold text-[#17372f]">{number(growth.rejected_offers)}</p>
            <p className="mt-1 text-xs text-slate-500">Declined without changing checkout</p>
          </article>
        </div>
        <div className="mt-4 grid items-start gap-3 lg:grid-cols-3">
          <div className="h-fit rounded-xl border border-emerald-950/10 bg-[#f7faf5] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#17372f]">
              <ArrowUpRight size={14} className="text-emerald-700" /> Top product pairings
            </p>
            {complementList.visibleItems.map((item) => (
              <p key={`${item.product_id}-${item.product_title}`} className="mt-3 text-xs text-slate-600">
                {item.product_title} · {item.paid_attachments} paid · {money(item.revenue)}
              </p>
            ))}
            {!topComplements.length && <p className="mt-3 text-xs text-slate-500">No purchased pairing yet.</p>}
            <LoadMoreRecords shownCount={complementList.shownCount} totalCount={topComplements.length} remainingCount={complementList.remainingCount} nextBatchCount={complementList.nextBatchCount} onLoadMore={complementList.loadMore} noun="pairings" />
          </div>
          <div className="h-fit rounded-xl border border-emerald-950/10 bg-[#f7faf5] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#17372f]">
              <PackageX size={14} className="text-rose-600" /> Declined offers
            </p>
            {rejectedList.visibleItems.map((item) => (
              <p key={`${item.product_id}-${item.product__title}`} className="mt-3 text-xs text-slate-600">
                {item.product__title} · {item.rejections} rejected
              </p>
            ))}
            {!rejectedOffers.length && <p className="mt-3 text-xs text-slate-500">No declined offers yet.</p>}
            <LoadMoreRecords shownCount={rejectedList.shownCount} totalCount={rejectedOffers.length} remainingCount={rejectedList.remainingCount} nextBatchCount={rejectedList.nextBatchCount} onLoadMore={rejectedList.loadMore} noun="offers" />
          </div>
          <div className="h-fit rounded-xl border border-emerald-950/10 bg-[#f7faf5] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#17372f]">
              <Puzzle size={14} className="text-amber-600" /> Pairings needing attention
            </p>
            {gapList.visibleItems.map((item) => (
              <p key={item.source_product_id} className="mt-3 text-xs text-slate-600">
                {item.source_product__title} · {item.gap_count} pairing
                {item.gap_count === 1 ? ' needs' : 's need'} attention
              </p>
            ))}
            {!compatibilityGaps.length && <p className="mt-3 text-xs text-slate-500">All linked products are available.</p>}
            <LoadMoreRecords shownCount={gapList.shownCount} totalCount={compatibilityGaps.length} remainingCount={gapList.remainingCount} nextBatchCount={gapList.nextBatchCount} onLoadMore={gapList.loadMore} noun="gaps" />
          </div>
        </div>
      </section>

      <section className="merchant-card merchant-reveal mt-5 rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.07)] backdrop-blur">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-rose-100 text-rose-700"><TrendingDown size={16} /></span>
              <h2 className="text-base font-semibold text-[#17372f]">Missed sales</h2>
            </div>
            <p className="mt-2 text-sm text-[#31594f]/65">Price and stock issues that prevented a suitable match.</p>
          </div>
          <span className="w-fit rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700">{number(analytics?.lost_opportunities?.total)} missed</span>
        </header>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {lossList.visibleItems.map((insight) => (
            <article key={`${insight.reason}-${insight.product_id}-${insight.product_title}`} className={`rounded-xl border p-4 ${insight.reason === 'PRICE' ? 'border-rose-200 bg-rose-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">{insight.reason === 'PRICE' ? 'Pricing gap' : 'Stock gap'}</p>
                  <p className="mt-1.5 text-sm font-semibold text-[#17372f]">{insight.product_title}</p>
                </div>
                <span className="rounded-full bg-white/80 px-2 py-1 text-xs text-rose-700">{insight.count} missed</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">{insight.message}</p>
            </article>
          ))}
          {losses.length === 0 && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">No price or stock losses have been recorded yet.</div>}
        </div>
        <LoadMoreRecords shownCount={lossList.shownCount} totalCount={losses.length} remainingCount={lossList.remainingCount} nextBatchCount={lossList.nextBatchCount} onLoadMore={lossList.loadMore} noun="missed-sale records" />

        <div className="mt-4 flex gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3">
          <Lightbulb size={15} className="mt-0.5 shrink-0 text-violet-700" />
          <p className="text-xs leading-5 text-slate-600">
            <span className="font-semibold text-violet-700">Suggested action:</span> Fix the most common pricing gap first, then restore repeatedly requested products.
          </p>
        </div>
      </section>
    </div>
  )
}
