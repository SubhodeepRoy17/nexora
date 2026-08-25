import { AlertTriangle, CheckCircle2, Clock3, CreditCard, Inbox, ShieldAlert } from 'lucide-react'
import DataFreshness from '../common/DataFreshness'

const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value ?? 0))

export default function MerchantOperations({ orders, workspace, state, onRetry }) {
  const operations = workspace?.operations ?? {}
  const orderStates = operations.orders_by_status ?? {}
  const webhookStates = operations.webhooks_by_state ?? {}
  const paidOrders = orders.filter((order) => order.status === 'PAID')
  if (state.loading && !workspace) return <section className="border border-violet-500/20 bg-violet-500/5 p-5 font-mono text-[9px] text-violet-300">LOADING OWNER-SCOPED PAYMENT OPERATIONS…</section>
  if (state.error && !workspace) return <section className="border border-rose-500/30 bg-rose-500/10 p-5"><p className="text-xs text-rose-300">{state.error}</p><button type="button" onClick={onRetry} className="mt-3 border border-rose-400/40 px-3 py-2 text-[9px] font-semibold text-rose-200">Retry operations</button></section>
  return (
    <section className="border border-slate-800 bg-slate-900 p-5" aria-labelledby="merchant-operations-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><ShieldAlert size={15} className="text-violet-400" /><h2 id="merchant-operations-title" className="text-sm font-semibold text-white">Payment operations</h2></div><p className="mt-1 text-[10px] text-slate-500">Webhook inbox, reconciliation exceptions, and owner-scoped order states.</p></div><DataFreshness updatedAt={state.updatedAt} loading={state.loading} staleAfterMs={30000} dark /></header>
      {state.error && <p className="mt-3 border border-amber-500/30 bg-amber-500/10 p-3 text-[10px] text-amber-300" role="alert">Showing the last successful snapshot. {state.error}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <article className="border border-slate-800 bg-slate-950/60 p-3"><CreditCard size={13} className="text-emerald-400" /><p className="mt-2 font-mono text-[8px] text-slate-500">PAID ORDERS</p><p className="mt-1 text-xl font-semibold text-white">{orderStates.PAID ?? 0}</p></article>
        <article className="border border-slate-800 bg-slate-950/60 p-3"><Clock3 size={13} className="text-amber-400" /><p className="mt-2 font-mono text-[8px] text-slate-500">PAYMENT PENDING</p><p className="mt-1 text-xl font-semibold text-white">{orderStates.PAYMENT_PENDING ?? 0}</p></article>
        <article className="border border-slate-800 bg-slate-950/60 p-3"><Inbox size={13} className="text-violet-400" /><p className="mt-2 font-mono text-[8px] text-slate-500">WEBHOOK PROCESSED</p><p className="mt-1 text-xl font-semibold text-white">{webhookStates.PROCESSED ?? 0}</p></article>
        <article className={`border p-3 ${(operations.open_reconciliation_exceptions ?? 0) > 0 ? 'border-rose-500/30 bg-rose-500/10' : 'border-slate-800 bg-slate-950/60'}`}><AlertTriangle size={13} className={(operations.open_reconciliation_exceptions ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400'} /><p className="mt-2 font-mono text-[8px] text-slate-500">OPEN RECONCILIATION</p><p className="mt-1 text-xl font-semibold text-white">{operations.open_reconciliation_exceptions ?? 0}</p></article>
      </div>
      <div className="mt-5"><p className="font-mono text-[8px] text-slate-500">RECENT PAID RECEIPTS</p>{paidOrders.length === 0 ? <p className="mt-3 border border-slate-800 p-4 text-[10px] text-slate-500">No webhook-confirmed paid orders yet.</p> : <div className="mt-2 divide-y divide-slate-800 border-y border-slate-800">{paidOrders.slice(0, 5).map((order) => <article key={order.order_id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"><div><p className="text-[10px] font-semibold text-white">{order.items.map((item) => item.product_title).join(', ')}</p><p className="mt-1 font-mono text-[8px] text-slate-600">ORDER {order.order_id.slice(0, 8).toUpperCase()} · {new Date(order.paid_at ?? order.updated_at).toLocaleString('en-IN')}</p></div><p className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300"><CheckCircle2 size={12} /> {money(order.total_amount, order.currency)}</p></article>)}</div>}</div>
    </section>
  )
}
