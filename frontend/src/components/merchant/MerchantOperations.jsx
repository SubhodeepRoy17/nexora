import { AlertTriangle, CheckCircle2, Clock3, CreditCard, Inbox, ShieldAlert } from 'lucide-react'
import DataFreshness from '../common/DataFreshness'
import LoadMoreRecords from '../common/LoadMoreRecords'
import useProgressiveList from '../../hooks/useProgressiveList'
import { OperationsSkeleton } from '../common/LoadingSkeletons'

const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value ?? 0))

export default function MerchantOperations({ orders, workspace, state, onRetry }) {
  const operations = workspace?.operations ?? {}
  const orderStates = operations.orders_by_status ?? {}
  const webhookStates = operations.webhooks_by_state ?? {}
  const paidOrders = orders.filter((order) => order.status === 'PAID')
  const { visibleItems: visiblePaidOrders, shownCount, remainingCount, nextBatchCount, loadMore } = useProgressiveList(paidOrders, 5)
  if (state.loading && !workspace) return <OperationsSkeleton />
  if (state.error && !workspace)
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
        <p className="text-sm text-rose-700">{state.error}</p>
        <button type="button" onClick={onRetry} className="mt-3 rounded-full border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700">
          Try again
        </button>
      </section>
    )
  return (
    <section className="merchant-card merchant-reveal rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.07)] backdrop-blur" aria-labelledby="merchant-operations-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-violet-100 text-violet-700"><ShieldAlert size={15} /></span>
            <h2 id="merchant-operations-title" className="text-base font-semibold text-[#17372f]">
              Payments and orders
            </h2>
          </div>
          <p className="mt-2 text-sm text-[#31594f]/65">Completed payments and orders that need attention.</p>
        </div>
        <DataFreshness updatedAt={state.updatedAt} loading={state.loading} staleAfterMs={30000} dark />
      </header>
      {state.error && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700" role="alert">
          Showing the last successful snapshot. {state.error}
        </p>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] p-4">
          <CreditCard size={15} className="text-emerald-700" />
          <p className="mt-3 text-xs text-slate-500">Paid orders</p>
          <p className="mt-1 text-2xl font-semibold text-[#17372f]">{orderStates.PAID ?? 0}</p>
        </article>
        <article className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] p-4">
          <Clock3 size={15} className="text-amber-600" />
          <p className="mt-3 text-xs text-slate-500">Payment pending</p>
          <p className="mt-1 text-2xl font-semibold text-[#17372f]">{orderStates.PAYMENT_PENDING ?? 0}</p>
        </article>
        <article className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] p-4">
          <Inbox size={15} className="text-violet-700" />
          <p className="mt-3 text-xs text-slate-500">Payments confirmed</p>
          <p className="mt-1 text-2xl font-semibold text-[#17372f]">{webhookStates.PROCESSED ?? 0}</p>
        </article>
        <article className={`rounded-xl border p-4 ${(operations.open_reconciliation_exceptions ?? 0) > 0 ? 'border-rose-200 bg-rose-50' : 'border-emerald-950/10 bg-[#f7faf5]'}`}>
          <AlertTriangle size={15} className={(operations.open_reconciliation_exceptions ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-700'} />
          <p className="mt-3 text-xs text-slate-500">Payments needing review</p>
          <p className="mt-1 text-2xl font-semibold text-[#17372f]">{operations.open_reconciliation_exceptions ?? 0}</p>
        </article>
      </div>
      <div className="mt-5">
        <p className="text-sm font-semibold text-[#17372f]">Recent completed orders</p>
        {paidOrders.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-emerald-950/15 bg-[#f7faf5] p-4 text-sm text-slate-500">No completed payments yet.</p>
        ) : (
          <div className="mt-2 divide-y divide-emerald-950/10 border-y border-emerald-950/10">
            {visiblePaidOrders.map((order) => (
              <article key={order.order_id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-[#17372f]">{order.items.map((item) => item.product_title).join(', ')}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Order {order.order_id.slice(0, 8).toUpperCase()} · {new Date(order.paid_at ?? order.updated_at).toLocaleString('en-IN')}
                  </p>
                </div>
                <p className="flex items-center gap-1 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 size={12} /> {money(order.total_amount, order.currency)}
                </p>
              </article>
            ))}
          </div>
        )}
        <LoadMoreRecords shownCount={shownCount} totalCount={paidOrders.length} remainingCount={remainingCount} nextBatchCount={nextBatchCount} onLoadMore={loadMore} noun="orders" />
      </div>
    </section>
  )
}
