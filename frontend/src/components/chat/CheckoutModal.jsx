import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, Clock3, CreditCard, LoaderCircle, LockKeyhole, Minus, PackageCheck, Plus, ShieldCheck, X } from 'lucide-react'
import { approveQuote, cancelOrder, createCart, createCartQuote, createOrder, getApiError, getOrder, loadRazorpayCheckout, newIdempotencyKey, respondToGrowthOffer } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
const terminalStates = new Set(['PAID', 'PAYMENT_FAILED', 'CANCELLED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED'])

export default function CheckoutModal({ product, onClose, onOrderPlaced }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stage, setStage] = useState('cart')
  const [quantity, setQuantity] = useState(1)
  const [addOnChoices, setAddOnChoices] = useState({})
  const [quote, setQuote] = useState(null)
  const [approvedExactQuote, setApprovedExactQuote] = useState(false)
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const approvalKey = useRef(newIdempotencyKey('quote-approval'))
  const paymentKey = useRef(newIdempotencyKey('payment-order'))
  const notifiedPaid = useRef(false)

  useEffect(() => {
    setStage('cart')
    setQuantity(1)
    setAddOnChoices({})
    setQuote(null)
    setApprovedExactQuote(false)
    setOrder(null)
    setError('')
    setReasonCode('')
    notifiedPaid.current = false
    approvalKey.current = newIdempotencyKey('quote-approval')
    paymentKey.current = newIdempotencyKey('payment-order')
  }, [product])

  useEffect(() => {
    if (!quote?.expires_at) return undefined
    const update = () => setRemainingSeconds(Math.max(0, Math.floor((new Date(quote.expires_at).getTime() - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [quote?.expires_at])

  useEffect(() => {
    if (!order?.order_id || terminalStates.has(order.status)) return undefined
    const controller = new AbortController()
    const poll = async () => {
      try {
        const { data } = await getOrder(order.order_id, controller.signal)
        setOrder(data)
        if (data.status === 'PAID' && !notifiedPaid.current) {
          notifiedPaid.current = true
          setStage('paid')
          onOrderPlaced({ product, order: data })
        } else if (terminalStates.has(data.status)) {
          setStage('terminal')
        } else {
          setStage('verifying')
        }
      } catch (pollError) {
        if (!controller.signal.aborted) setError(getApiError(pollError, 'Could not refresh authoritative order status.'))
      }
    }
    poll()
    const timer = window.setInterval(poll, 2500)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [order?.order_id, order?.status, onOrderPlaced, product])

  const lines = quote?.items ?? []
  const line = lines[0]
  const processing = ['quoting', 'approving', 'reserving', 'opening'].includes(stage)
  const selectedAddOns = product?.addOns?.filter((item) => addOnChoices[item.offerId] === true) ?? []
  const choicesComplete = (product?.addOns ?? []).every((item) => typeof addOnChoices[item.offerId] === 'boolean')
  const total = quote?.total_amount ?? product?.price * quantity + selectedAddOns.reduce((sum, item) => sum + item.price, 0)
  const countdown = useMemo(() => `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`, [remainingSeconds])

  if (!product) return null

  const requireLogin = () => {
    if (user) return false
    onClose()
    navigate('/login?next=%2F')
    return true
  }

  const requestQuote = async (requestedQuantity = quantity) => {
    if (requireLogin()) return
    if (!product.decisionId || !product.decisionToken) {
      setStage('error')
      setError('Run a fresh catalog search to create an attributable cart.')
      return
    }
    setStage('quoting')
    setError('')
    setReasonCode('')
    try {
      await Promise.all((product.addOns ?? []).map((addOn) => respondToGrowthOffer({
        offerId: addOn.offerId,
        offerToken: addOn.offerToken,
        accepted: addOnChoices[addOn.offerId],
      })))
      const items = [{
        decision_id: product.decisionId,
        decision_token: product.decisionToken,
        quantity: requestedQuantity,
      }, ...selectedAddOns.map((addOn) => ({
        decision_id: addOn.decisionId,
        decision_token: addOn.decisionToken,
        growth_offer_id: addOn.offerId,
        quantity: 1,
      }))]
      const cartResponse = await createCart(items)
      const quoteResponse = await createCartQuote(cartResponse.data.cart_id)
      setQuote(quoteResponse.data)
      setApprovedExactQuote(false)
      setStage('quote')
    } catch (requestError) {
      const payload = requestError?.response?.data
      if (payload?.quote_id) setQuote(payload)
      setReasonCode(payload?.reason_code ?? '')
      setError(getApiError(requestError, 'The basket could not be quoted.'))
      setStage(payload?.reason_code ? 'blocked' : 'error')
    }
  }

  const approveAndReserve = async () => {
    if (!quote || !approvedExactQuote || remainingSeconds <= 0) return
    setStage('approving')
    setError('')
    try {
      const approval = await approveQuote(quote.quote_id, approvalKey.current)
      setStage('reserving')
      const [orderResponse] = await Promise.all([
        createOrder({
          quoteId: quote.quote_id,
          approvalToken: approval.data.approval_token,
          idempotencyKey: paymentKey.current,
        }),
        loadRazorpayCheckout(),
      ])
      const authoritativeOrder = orderResponse.data
      setOrder(authoritativeOrder)
      setStage('opening')
      const checkout = new window.Razorpay({
        key: authoritativeOrder.key,
        amount: authoritativeOrder.amount,
        currency: authoritativeOrder.currency,
        name: 'Nexora',
        description: `${authoritativeOrder.items.length} reserved item${authoritativeOrder.items.length === 1 ? '' : 's'}`,
        order_id: authoritativeOrder.razorpay_order_id,
        prefill: { email: user.email },
        theme: { color: '#6366F1', backdrop_color: '#020617' },
        handler: () => {
          // Browser success is only a hint. Polling waits for the verified webhook.
          setStage('verifying')
          setOrder((current) => ({ ...current, status: 'PAYMENT_PENDING' }))
        },
        modal: { ondismiss: () => setStage('verifying') },
      })
      checkout.on('payment.failed', () => setStage('verifying'))
      checkout.open()
    } catch (checkoutError) {
      setReasonCode(checkoutError?.response?.data?.reason_code ?? '')
      setError(getApiError(checkoutError, 'Checkout could not be initialized safely.'))
      setStage(checkoutError?.response?.data?.reason_code ? 'blocked' : 'error')
    }
  }

  const cancelPendingOrder = async () => {
    if (!order?.order_id) return
    setStage('cancelling')
    setError('')
    try {
      const { data } = await cancelOrder(order.order_id)
      setOrder(data)
      setStage('terminal')
    } catch (cancelError) {
      setError(getApiError(cancelError, 'This order could not be cancelled.'))
      setStage('verifying')
    }
  }

  const safeClose = () => { if (!processing) onClose() }
  const statusLabel = order?.status?.replaceAll('_', ' ') ?? ''

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/85 backdrop-blur-md sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={(event) => event.target === event.currentTarget && safeClose()}>
      <div className="max-h-[95dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl shadow-indigo-950/70 sm:max-w-lg sm:rounded-3xl">
        <header className={`relative border-b p-6 ${stage === 'paid' ? 'border-emerald-500/20 bg-emerald-500/10' : ['blocked', 'error', 'terminal'].includes(stage) ? 'border-rose-500/20 bg-rose-500/10' : 'border-slate-800 bg-gradient-to-br from-indigo-500/15 via-slate-900 to-slate-900'}`}>
          {!processing && <button type="button" onClick={onClose} aria-label="Close checkout" className="focus-ring absolute right-4 top-4 rounded-full border border-slate-700 bg-slate-900/80 p-2 text-slate-400"><X size={16} /></button>}
          <div className={`mb-4 grid size-11 place-items-center rounded-2xl text-white ${stage === 'paid' ? 'bg-emerald-500' : ['blocked', 'error', 'terminal'].includes(stage) ? 'bg-rose-500' : 'bg-indigo-500 shadow-glow'}`}>
            {stage === 'paid' ? <PackageCheck size={21} /> : ['blocked', 'error', 'terminal'].includes(stage) ? <AlertTriangle size={20} /> : processing || ['verifying', 'cancelling'].includes(stage) ? <LoaderCircle size={21} className="animate-spin" /> : <LockKeyhole size={20} />}
          </div>
          <p className="mono-label text-indigo-300">Reserved cart lifecycle</p>
          <h2 id="checkout-title" className="mt-2 text-xl font-semibold text-white">{stage === 'cart' ? 'Review cart quantities' : stage === 'quote' ? 'Approve the exact quote' : stage === 'paid' ? 'Payment verified' : ['verifying', 'opening'].includes(stage) ? 'Pending backend verification' : stage === 'terminal' ? statusLabel : processing ? 'Securing your checkout' : 'Action stopped safely'}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{stage === 'paid' ? 'The verified backend webhook consumed your reservation exactly once.' : ['verifying', 'opening'].includes(stage) ? 'The browser callback cannot mark this order paid. Nexora is polling the authoritative backend state.' : 'Stock is reserved only after explicit quote approval and released on eligible failure, cancellation, or expiry.'}</p>
        </header>

        <div className="p-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            {(lines.length ? lines : [{ product_title: product.name, merchant_name: product.merchant.name, line_total: product.price * quantity }]).map((item, index) => <div key={item.product ?? index} className={`flex justify-between gap-4 ${index ? 'mt-3 border-t border-slate-800 pt-3' : ''}`}><div><p className="text-sm font-semibold text-white">{item.product_title}</p><p className="mt-1 font-mono text-[9px] text-slate-500">{item.merchant_name}{item.growth_offer ? ' · BUYER-APPROVED ADD-ON' : ''}</p></div><p className="text-sm font-bold text-white">{money(item.line_total)}</p></div>)}
            {stage === 'cart' && <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3"><span className="text-[10px] text-slate-500">Quantity</span><div className="flex items-center gap-3"><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-700 p-1.5 text-slate-300"><Minus size={12} /></button><span className="w-5 text-center text-sm text-white">{quantity}</span><button type="button" aria-label="Increase quantity" onClick={() => setQuantity((value) => value + 1)} className="rounded-lg border border-slate-700 p-1.5 text-slate-300"><Plus size={12} /></button></div></div>}
            {quote && <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 font-mono text-[8px] text-slate-500"><span>QUOTE {quote.quote_id.slice(0, 8).toUpperCase()}</span><span className={remainingSeconds < 60 ? 'text-rose-300' : 'text-amber-300'}><Clock3 size={10} className="mr-1 inline" />{countdown}</span></div>}
          </div>

          {line?.explanation && <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3"><p className="font-mono text-[8px] text-indigo-300">WHY RECOMMENDED</p><p className="mt-1 text-[11px] leading-relaxed text-slate-300">{line.explanation}</p>{line.trade_offs?.length > 0 && <p className="mt-2 text-[10px] text-slate-500">Trade-off: {line.trade_offs.join(' · ')}</p>}</div>}
          {quote?.policy_snapshot?.limits && <p className="mt-3 rounded-xl border border-slate-800 p-3 text-[10px] text-slate-400">Limits: {quote.policy_snapshot.limits.supported_currency} · max {quote.policy_snapshot.limits.max_item_quantity} per item · max {money(quote.policy_snapshot.limits.max_order_value)} total · test mode</p>}
          {order && <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3"><p className="font-mono text-[8px] text-slate-500">AUTHORITATIVE ORDER STATUS</p><p className={`mt-1 text-sm font-semibold ${order.status === 'PAID' ? 'text-emerald-300' : 'text-amber-300'}`}>{statusLabel}</p>{order.reservation_expires_at && <p className="mt-1 text-[9px] text-slate-500">Reservation expires {new Date(order.reservation_expires_at).toLocaleTimeString()}</p>}</div>}
          {processing && <div className="my-4 flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3" aria-live="polite"><LoaderCircle size={14} className="animate-spin text-indigo-400" /><p className="font-mono text-[9px] text-indigo-300">LOCKING PRODUCTS · CHECKING STOCK · PRESERVING SNAPSHOTS</p></div>}
          {error && <div className="my-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[11px] text-rose-300" role="alert">{error}{reasonCode && <span className="mt-1 block font-mono text-[8px]">REASON · {reasonCode}</span>}</div>}

          {stage === 'cart' && <>{product.addOns?.length > 0 && <section className="mt-4" aria-label="Optional add-ons"><p className="font-mono text-[8px] text-indigo-300">OPTIONAL · CHOOSE EACH ITEM</p><p className="mt-1 text-[10px] text-slate-500">Compatibility is catalog-defined. No item is preselected and rejecting is equally available.</p><div className="mt-3 space-y-2">{product.addOns.map((addOn) => <article key={addOn.offerId} className="rounded-xl border border-slate-800 p-3"><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold text-white">{addOn.name}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{addOn.benefit}</p>{addOn.constraintEvidence?.map((evidence) => <p key={evidence} className="mt-1 text-[8px] text-indigo-300">✓ {evidence}</p>)}{addOn.tradeOff && <p className="mt-1 text-[9px] text-slate-600">Trade-off: {addOn.tradeOff}</p>}</div><p className="shrink-0 text-xs font-semibold text-white">+{money(addOn.price)}</p></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setAddOnChoices((current) => ({ ...current, [addOn.offerId]: true }))} className={`rounded-lg border py-2 text-[10px] ${addOnChoices[addOn.offerId] === true ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300'}`}>Add to quote</button><button type="button" onClick={() => setAddOnChoices((current) => ({ ...current, [addOn.offerId]: false }))} className={`rounded-lg border py-2 text-[10px] ${addOnChoices[addOn.offerId] === false ? 'border-slate-400 bg-slate-800 text-white' : 'border-slate-700 text-slate-300'}`}>No thanks</button></div></article>)}</div></section>}<div className="my-5 flex items-center justify-between border-y border-slate-800 py-4"><span className="text-sm text-slate-400">Estimated cart total</span><span className="text-xl font-bold text-white">{money(total)}</span></div><button type="button" disabled={!choicesComplete} onClick={() => requestQuote()} className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{user ? choicesComplete ? 'Generate exact server quote' : 'Choose add or no thanks for each offer' : 'Sign in to continue'} <ChevronRight size={15} /></button></>}

          {stage === 'quote' && <><label className="my-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 bg-slate-950 p-3"><input type="checkbox" checked={approvedExactQuote} onChange={(event) => setApprovedExactQuote(event.target.checked)} className="mt-0.5 size-4 accent-indigo-500" /><span className="text-[11px] leading-relaxed text-slate-300">I approve these exact products, quantities, prices, total, and disclosed limits before the countdown expires.</span></label><button type="button" disabled={!approvedExactQuote || remainingSeconds <= 0} onClick={approveAndReserve} className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><CreditCard size={16} /> Approve, reserve stock & pay</button><button type="button" onClick={() => requestQuote(Number(quote.policy_snapshot?.limits?.max_item_quantity ?? 5) + 1)} className="mt-2 w-full py-2 text-[10px] text-slate-500 hover:text-rose-300">Demo safe block: exceed quantity limit</button></>}

          {['verifying', 'opening'].includes(stage) && order?.cancellable && <button type="button" onClick={cancelPendingOrder} className="mt-4 w-full rounded-xl border border-rose-500/30 py-3 text-sm text-rose-300">Cancel pending order and release stock</button>}
          {stage === 'paid' && <button type="button" onClick={onClose} className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-semibold text-white"><Check size={16} /> Done</button>}
          {['blocked', 'error', 'terminal'].includes(stage) && <button type="button" onClick={onClose} className="focus-ring mt-4 w-full rounded-xl border border-slate-700 py-3 text-sm text-slate-200">Close</button>}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[8px] text-slate-600"><ShieldCheck size={10} /> idempotent · reserved · webhook-authoritative</p>
        </div>
      </div>
    </div>
  )
}
