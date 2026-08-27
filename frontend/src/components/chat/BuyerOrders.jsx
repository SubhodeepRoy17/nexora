import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, CreditCard, Package, RefreshCw, X } from 'lucide-react'
import DataFreshness from '../common/DataFreshness'
import useBoundedPolling from '../../hooks/useBoundedPolling'
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap'
import { cancelOrder, extractResults, getApiError, getOrder, getOrders, loadRazorpayCheckout, verifyCheckoutPayment } from '../../services/api'

const TERMINAL = new Set(['PAID', 'PAYMENT_FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'MANUAL_REVIEW'])
const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value ?? 0))
const statusCopy = {
  PAYMENT_PENDING: 'Waiting for verified Razorpay webhook or server reconciliation.',
  PAID: 'Payment and inventory fulfillment were confirmed by the backend.',
  PAYMENT_FAILED: 'Payment failed safely; reserved stock was released.',
  CANCELLED: 'Cancelled by the buyer; reserved stock was released.',
  EXPIRED: 'The payment window expired; reserved stock was released.',
  REFUND_PENDING: 'A bounded refund is awaiting verified provider confirmation.',
  REFUNDED: 'The refund was confirmed by Razorpay.',
  MANUAL_REVIEW: 'An operator must resolve this payment without guessing.',
}

function OrderDetail({ summary, onClose, onChanged, onRetry }) {
  const [order, setOrder] = useState(summary)
  const [state, setState] = useState({ loading: true, error: '', updatedAt: null, action: '' })
  const close = useCallback(() => { if (!state.action) onClose() }, [onClose, state.action])
  const dialogRef = useDialogFocusTrap(true, close)

  const refresh = useCallback(async (signal) => {
    try {
      const { data } = await getOrder(summary.order_id, signal)
      setOrder(data)
      setState((current) => ({ ...current, loading: false, error: '', updatedAt: new Date().toISOString() }))
      onChanged?.(data)
    } catch (error) {
      if (!signal?.aborted) setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Could not refresh this order.') }))
    }
  }, [summary.order_id, onChanged])

  useEffect(() => { const controller = new AbortController(); refresh(controller.signal); return () => controller.abort() }, [refresh])
  useBoundedPolling(refresh, { enabled: order?.status === 'PAYMENT_PENDING' || order?.status === 'REFUND_PENDING', intervalMs: 2500, maxCycles: 120, immediate: false })

  const cancel = async () => {
    if (state.action) return
    setState((current) => ({ ...current, action: 'cancel', error: '' }))
    try {
      const { data } = await cancelOrder(order.order_id)
      setOrder(data); onChanged?.(data)
    } catch (error) {
      setState((current) => ({ ...current, error: getApiError(error, 'This order could not be cancelled.') }))
    } finally {
      setState((current) => ({ ...current, action: '' }))
    }
  }

  const resumePayment = async () => {
    if (state.action || order.status !== 'PAYMENT_PENDING') return
    setState((current) => ({ ...current, action: 'payment', error: '' }))
    try {
      await loadRazorpayCheckout()
      const checkout = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: 'Nexora',
        description: `Resume order ${order.order_id.slice(0, 8).toUpperCase()}`,
        order_id: order.razorpay_order_id,
        handler: async (proof) => {
          try { await verifyCheckoutPayment(order.order_id, proof); await refresh(); setState((current) => ({ ...current, action: '' })) }
          catch (error) { setState((current) => ({ ...current, action: '', error: getApiError(error, 'Checkout returned, but verification remains pending.') })) }
        },
        modal: { ondismiss: () => setState((current) => ({ ...current, action: '' })) },
      })
      checkout.on('payment.failed', () => setState((current) => ({ ...current, action: '', error: 'Razorpay reported a failed attempt. The backend remains authoritative; you may retry or cancel.' })))
      checkout.open()
    } catch (error) {
      setState((current) => ({ ...current, action: '', error: getApiError(error, 'Razorpay Checkout could not be reopened.') }))
    }
  }

  const paid = order.status === 'PAID'
  return (
    <div className="fixed inset-x-0 bottom-0 top-20 z-50 grid place-items-end bg-slate-950/75 backdrop-blur-sm sm:place-items-center sm:p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="order-detail-title" className="modal-scroll max-h-full w-full overflow-y-auto border border-slate-300 bg-[#f6f5f1] p-5 shadow-2xl sm:max-w-2xl sm:p-7">
        <header className="flex items-start justify-between gap-4"><div><p className="mono-label text-violet-600">Authoritative receipt</p><h2 id="order-detail-title" className="mt-2 text-xl font-semibold">Order {order.order_id.slice(0, 8).toUpperCase()}</h2><div className="mt-2"><DataFreshness updatedAt={state.updatedAt} loading={state.loading} staleAfterMs={10000} /></div></div><button type="button" onClick={close} disabled={Boolean(state.action)} aria-label="Close order receipt" className="focus-ring grid size-9 place-items-center border border-slate-300 bg-white"><X size={16} /></button></header>
        <div className={`mt-5 border p-4 ${paid ? 'border-emerald-300 bg-emerald-50' : TERMINAL.has(order.status) ? 'border-rose-300 bg-rose-50' : 'border-amber-300 bg-amber-50'}`} role="status" aria-live="polite"><div className="flex items-center gap-2">{paid ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Clock3 size={17} className="text-amber-600" />}<p className="text-sm font-semibold">{order.status.replaceAll('_', ' ')}</p></div><p className="mt-2 text-xs leading-5 text-slate-600">{statusCopy[order.status]}</p></div>
        {state.error && <p id="order-action-error" className="mt-4 border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800" role="alert">{state.error}</p>}
        <div className="mt-5 divide-y divide-slate-200 border-y border-slate-300 bg-white">{order.items?.map((item) => <div key={item.product} className="flex justify-between gap-4 p-4"><div><p className="text-xs font-semibold">{item.product_title}</p><p className="mt-1 font-mono text-[8px] text-slate-500">{item.merchant_name} · QTY {item.quantity}{item.growth_offer ? ' · BUYER-APPROVED ADD-ON' : ''}</p></div><p className="text-xs font-bold">{money(item.line_total, order.currency)}</p></div>)}</div>
        <div className="mt-4 flex items-end justify-between"><div><p className="text-xs text-slate-500">Exact approved total</p><p className="mt-1 font-mono text-[8px] text-slate-400">Created {new Date(order.created_at).toLocaleString('en-IN')}</p></div><p className="text-xl font-bold">{money(order.total_amount, order.currency)}</p></div>
        {order.refunds?.map((refund) => <div key={refund.refund_id} className="mt-4 border border-violet-200 bg-violet-50 p-3 text-[10px] text-violet-800">Refund {refund.status} · {money(refund.amount, refund.currency)} · {refund.reason_code}</div>)}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {order.status === 'PAYMENT_PENDING' && order.key && <button type="button" onClick={resumePayment} disabled={Boolean(state.action)} aria-describedby={state.error ? 'order-action-error' : undefined} className="focus-ring flex flex-1 items-center justify-center gap-2 border border-violet-700 bg-violet-600 px-4 py-3 text-xs font-semibold text-white disabled:opacity-50"><CreditCard size={15} /> {state.action === 'payment' ? 'Opening…' : 'Resume Razorpay payment'}</button>}
          {order.cancellable && <button type="button" onClick={cancel} disabled={Boolean(state.action)} className="focus-ring flex-1 border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 disabled:opacity-50">Cancel and release stock</button>}
          {['PAYMENT_FAILED', 'CANCELLED', 'EXPIRED'].includes(order.status) && <button type="button" onClick={() => { onRetry(order.items?.[0]?.product_title ?? ''); onClose() }} className="focus-ring flex-1 border border-slate-950 bg-slate-950 px-4 py-3 text-xs font-semibold text-white"><RefreshCw size={14} className="mr-2 inline" /> Start a fresh search</button>}
        </div>
      </section>
    </div>
  )
}

export default function BuyerOrders({ user, refreshNonce = 0, onRetry }) {
  const [orders, setOrders] = useState([])
  const [selected, setSelected] = useState(null)
  const [state, setState] = useState({ loading: false, error: '', updatedAt: null })
  const refresh = useCallback(async (signal) => {
    if (!user) return
    setState((current) => ({ ...current, loading: true }))
    try {
      const { data } = await getOrders(signal)
      setOrders(extractResults(data))
      setState({ loading: false, error: '', updatedAt: new Date().toISOString() })
    } catch (error) {
      if (!signal?.aborted) setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Could not load your orders.') }))
    }
  }, [user])
  useEffect(() => { const controller = new AbortController(); refresh(controller.signal); return () => controller.abort() }, [refresh, refreshNonce])
  useBoundedPolling(refresh, { enabled: Boolean(user && orders.some((item) => !TERMINAL.has(item.status))), intervalMs: 10000, maxCycles: 60, immediate: false })
  const closeSelectedOrder = useCallback(() => setSelected(null), [])
  const updateSelectedOrder = useCallback((changed) => {
    setOrders((current) => current.map((item) => item.order_id === changed.order_id ? changed : item))
  }, [])
  if (!user) return null
  return <>
    <section className="mt-6 border-t border-emerald-950/10 pt-5" aria-labelledby="buyer-orders-title"><div className="flex items-center justify-between px-2"><p id="buyer-orders-title" className="mono-label text-[#31594f]/55">Your orders</p><DataFreshness updatedAt={state.updatedAt} loading={state.loading} staleAfterMs={30000} /></div>
      {state.error && <button type="button" onClick={() => refresh()} className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50 p-2 text-left text-[9px] text-rose-700">{state.error} Retry</button>}
      {!state.loading && !orders.length && <p className="mt-2 px-2 text-[10px] leading-5 text-slate-500">No orders yet. Approved checkouts appear here from the backend.</p>}
      <div className="mt-2 space-y-1">{orders.slice(0, 4).map((order) => <button key={order.order_id} type="button" onClick={() => setSelected(order)} className="focus-ring flex w-full items-center gap-2 rounded-xl border border-emerald-950/10 bg-white/58 px-2.5 py-2 text-left transition hover:bg-white"><Package size={12} className="shrink-0 text-violet-600" /><span className="min-w-0 flex-1"><span className="block truncate text-[9px] font-semibold">{order.items?.[0]?.product_title ?? 'Order'}</span><span className="mt-0.5 block font-mono text-[7px] text-slate-500">{order.status.replaceAll('_', ' ')} · {money(order.total_amount, order.currency)}</span></span></button>)}</div>
    </section>
    {selected && <OrderDetail summary={selected} onClose={closeSelectedOrder} onChanged={updateSelectedOrder} onRetry={onRetry} />}
  </>
}
