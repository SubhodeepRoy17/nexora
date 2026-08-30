import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Clock3, CreditCard, Package, RefreshCw, X } from 'lucide-react'
import useBoundedPolling from '../../hooks/useBoundedPolling'
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap'
import { OrdersListSkeleton, Skeleton } from '../common/LoadingSkeletons'
import { cancelOrder, extractResults, getApiError, getOrder, getOrders, loadRazorpayCheckout, verifyCheckoutPayment } from '../../services/api'

const TERMINAL = new Set(['PAID', 'PAYMENT_FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'MANUAL_REVIEW'])
const money = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value ?? 0))
const statusCopy = {
  PAYMENT_PENDING: 'Razorpay is still confirming this payment. Your reserved stock remains protected.',
  PAID: 'Payment was confirmed and your order is complete.',
  PAYMENT_FAILED: 'Payment failed safely; reserved stock was released.',
  CANCELLED: 'Cancelled by the buyer; reserved stock was released.',
  EXPIRED: 'The payment window expired; reserved stock was released.',
  REFUND_PENDING: 'Your full refund is being confirmed.',
  REFUNDED: 'The refund was confirmed by Razorpay.',
  MANUAL_REVIEW: 'Our support team is reviewing this payment.',
}

function OrderDetail({ summary, onClose, onChanged, onRetry }) {
  const [order, setOrder] = useState(summary)
  const [state, setState] = useState({
    loading: true,
    error: '',
    updatedAt: null,
    action: '',
  })
  const close = useCallback(() => {
    if (!state.action) onClose()
  }, [onClose, state.action])
  const dialogRef = useDialogFocusTrap(true, close)

  const refresh = useCallback(
    async (signal) => {
      try {
        const { data } = await getOrder(summary.order_id, signal)
        setOrder(data)
        setState((current) => ({
          ...current,
          loading: false,
          error: '',
          updatedAt: new Date().toISOString(),
        }))
        onChanged?.(data)
      } catch (error) {
        if (!signal?.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            error: getApiError(error, 'Could not refresh this order.'),
          }))
      }
    },
    [summary.order_id, onChanged],
  )

  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])
  useBoundedPolling(refresh, {
    enabled: order?.status === 'PAYMENT_PENDING' || order?.status === 'REFUND_PENDING',
    intervalMs: 2500,
    maxCycles: 120,
    immediate: false,
  })

  const cancel = async () => {
    if (state.action) return
    setState((current) => ({ ...current, action: 'cancel', error: '' }))
    try {
      const { data } = await cancelOrder(order.order_id)
      setOrder(data)
      onChanged?.(data)
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getApiError(error, 'This order could not be cancelled.'),
      }))
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
          try {
            await verifyCheckoutPayment(order.order_id, proof)
            await refresh()
            setState((current) => ({ ...current, action: '' }))
          } catch (error) {
            setState((current) => ({
              ...current,
              action: '',
              error: getApiError(error, 'Checkout returned, but verification remains pending.'),
            }))
          }
        },
        modal: {
          ondismiss: () => setState((current) => ({ ...current, action: '' })),
        },
      })
      checkout.on('payment.failed', () =>
        setState((current) => ({
          ...current,
          action: '',
          error: 'The payment did not go through. You can retry or cancel.',
        })),
      )
      checkout.open()
    } catch (error) {
      setState((current) => ({
        ...current,
        action: '',
        error: getApiError(error, 'Razorpay Checkout could not be reopened.'),
      }))
    }
  }

  const successful = order.status === 'PAID' || order.status === 'REFUNDED'
  const terminalFailure = ['PAYMENT_FAILED', 'CANCELLED', 'EXPIRED'].includes(order.status)
  const statusStyle = successful
    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
    : terminalFailure
      ? 'border-rose-200 bg-rose-50 text-rose-950'
      : 'border-amber-200 bg-amber-50 text-amber-950'
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[#17372f]/30 px-3 pt-[12vh] backdrop-blur-sm sm:px-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="order-detail-title" className="buyer-order-dialog modal-scroll max-h-[calc(100dvh-5rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/70 bg-[#f7f9f4] shadow-[0_30px_90px_rgba(23,55,47,.24)] sm:max-h-[76vh]">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-emerald-950/10 bg-[#f7f9f4]/95 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#17372f] text-white"><Package size={18} /></span>
            <div className="min-w-0">
              <h2 id="order-detail-title" className="truncate text-base font-semibold text-[#17372f]">Order details</h2>
              <p className="mt-0.5 text-xs text-[#31594f]/65">{order.order_id.slice(0, 8).toUpperCase()} · {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>
          <button type="button" onClick={close} disabled={Boolean(state.action)} aria-label="Close order receipt" className="focus-ring grid size-9 shrink-0 place-items-center rounded-xl text-[#31594f] transition hover:bg-white hover:text-[#17372f] disabled:opacity-40">
            <X size={18} />
          </button>
        </header>

        <div className="p-4 sm:p-5">
          <div className={`rounded-2xl border p-4 ${statusStyle}`} role="status" aria-live="polite">
            <div className="flex items-center gap-2">
              {state.loading ? <Skeleton className="size-4 rounded-full" /> : successful ? <CheckCircle2 size={17} className="text-emerald-600" /> : terminalFailure ? <AlertTriangle size={17} className="text-rose-600" /> : <Clock3 size={17} className="text-amber-600" />}
              {state.loading ? <Skeleton className="h-3 w-28 rounded-full" /> : <p className="text-sm font-semibold">{order.status.replaceAll('_', ' ')}</p>}
            </div>
            {state.loading ? <div className="mt-3 space-y-2"><Skeleton className="h-2.5 w-full rounded-full" /><Skeleton className="h-2.5 w-3/4 rounded-full" /></div> : <p className="mt-2 text-xs leading-5 opacity-75">{statusCopy[order.status] ?? 'We are checking the latest order status.'}</p>}
          </div>

          {state.error && (
            <p id="order-action-error" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800" role="alert">
              {state.error}
            </p>
          )}

          <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-950/10 bg-white/75">
            {order.items?.map((item, index) => (
              <div key={item.product} className={`flex items-start justify-between gap-4 px-4 py-3.5 ${index ? 'border-t border-emerald-950/10' : ''}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#17372f]">{item.product_title}</p>
                  <p className="mt-1 text-xs text-[#31594f]/65">
                    {item.merchant_name} · Qty {item.quantity}{item.growth_offer ? ' · Add-on' : ''}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-[#17372f]">{money(item.line_total, order.currency)}</p>
              </div>
            ))}
            <div className="flex items-end justify-between gap-4 border-t border-emerald-950/10 bg-[#edf3ea]/70 px-4 py-4">
              <div>
                <p className="text-xs text-[#31594f]/65">Approved total</p>
                <p className="mt-1 text-xs text-[#31594f]/45">{new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              <p className="text-xl font-semibold tracking-tight text-[#17372f]">{money(order.total_amount, order.currency)}</p>
            </div>
          </div>

          {order.refunds?.map((refund) => (
            <div key={refund.refund_id} className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800">
              Refund {refund.status.replaceAll('_', ' ').toLowerCase()} · {money(refund.amount, refund.currency)}
            </div>
          ))}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {order.status === 'PAYMENT_PENDING' && order.key && (
              <button type="button" onClick={resumePayment} disabled={Boolean(state.action)} aria-describedby={state.error ? 'order-action-error' : undefined} className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl border border-violet-700 bg-violet-600 px-4 py-3 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50">
                {state.action === 'payment' ? <span role="status" aria-label="Opening payment" className="flex w-28 items-center gap-2"><Skeleton className="nexora-skeleton-ink size-3.5 rounded-full" /><Skeleton className="nexora-skeleton-ink h-2.5 flex-1 rounded-full" /></span> : <><CreditCard size={15} /> Resume Razorpay payment</>}
              </button>
            )}
            {order.cancellable && (
              <button type="button" onClick={cancel} disabled={Boolean(state.action)} className="focus-ring flex-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">
                {state.action === 'cancel' ? <span role="status" aria-label="Cancelling order" className="mx-auto flex w-28 items-center gap-2"><Skeleton className="size-3.5 rounded-full" /><Skeleton className="h-2.5 flex-1 rounded-full" /></span> : 'Cancel and release stock'}
              </button>
            )}
            {['PAYMENT_FAILED', 'CANCELLED', 'EXPIRED'].includes(order.status) && (
              <button
                type="button"
                onClick={() => {
                  onRetry(order.items?.[0]?.product_title ?? '')
                  onClose()
                }}
                className="focus-ring flex-1 rounded-xl border border-[#17372f] bg-[#17372f] px-4 py-3 text-xs font-semibold text-white transition hover:bg-[#244b41]"
              >
                <RefreshCw size={14} className="mr-2 inline" /> Start a fresh search
              </button>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default function BuyerOrders({ user, refreshNonce = 0, onRetry }) {
  const [orders, setOrders] = useState([])
  const [selected, setSelected] = useState(null)
  const [state, setState] = useState({
    loading: false,
    error: '',
    updatedAt: null,
  })
  const refresh = useCallback(
    async (signal) => {
      if (!user) return
      setState((current) => ({ ...current, loading: true }))
      try {
        const { data } = await getOrders(signal)
        setOrders(extractResults(data))
        setState({
          loading: false,
          error: '',
          updatedAt: new Date().toISOString(),
        })
      } catch (error) {
        if (!signal?.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            error: getApiError(error, 'Could not load your orders.'),
          }))
      }
    },
    [user],
  )
  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal)
    return () => controller.abort()
  }, [refresh, refreshNonce])
  useBoundedPolling(refresh, {
    enabled: Boolean(user && orders.some((item) => !TERMINAL.has(item.status))),
    intervalMs: 10000,
    maxCycles: 60,
    immediate: false,
  })
  const closeSelectedOrder = useCallback(() => setSelected(null), [])
  const updateSelectedOrder = useCallback((changed) => {
    setOrders((current) => current.map((item) => (item.order_id === changed.order_id ? changed : item)))
  }, [])
  if (!user) return null
  return (
    <>
      <section className="flex min-h-0 flex-[2] flex-col border-t border-emerald-950/10 pt-4" aria-labelledby="buyer-orders-title">
        <div className="px-2">
          <p id="buyer-orders-title" className="text-sm font-semibold text-[#17372f]">
            Orders
          </p>
        </div>
        {state.error && (
          <button type="button" onClick={() => refresh()} className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50 p-2 text-left text-xs text-rose-700">
            {state.error} Retry
          </button>
        )}
        {!state.loading && !orders.length && <p className="mt-2 px-2 text-xs leading-5 text-slate-500">No orders yet.</p>}
        <div className="modal-scroll mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {state.loading && !orders.length && <OrdersListSkeleton />}
          {orders.map((order) => (
            <button key={order.order_id} type="button" onClick={() => setSelected(order)} className="focus-ring flex w-full items-center gap-2 rounded-xl border border-emerald-950/10 bg-white/58 px-2.5 py-2 text-left transition hover:bg-white">
              <Package size={12} className="shrink-0 text-violet-600" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{order.items?.[0]?.product_title ?? 'Order'}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  {order.status.replaceAll('_', ' ')} · {money(order.total_amount, order.currency)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
      {selected && <OrderDetail summary={selected} onClose={closeSelectedOrder} onChanged={updateSelectedOrder} onRetry={onRetry} />}
    </>
  )
}
