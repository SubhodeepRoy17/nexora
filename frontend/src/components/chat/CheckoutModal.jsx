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
    navigate('/login?next=%2Fbuyer')
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
  const stopped = ['blocked', 'error', 'terminal'].includes(stage)
  const stepIndex = stage === 'cart' ? 0 : ['quoting', 'quote', 'blocked', 'error'].includes(stage) ? 1 : ['approving', 'reserving', 'opening'].includes(stage) ? 2 : 3
  const stageTitle = stage === 'cart' ? 'Review your basket' : stage === 'quote' ? 'Approve the exact quote' : stage === 'paid' ? 'Payment verified' : ['verifying', 'opening', 'cancelling'].includes(stage) ? 'Waiting for backend verification' : stage === 'terminal' ? statusLabel : processing ? 'Securing your checkout' : 'Checkout stopped safely'
  const stageCopy = stage === 'paid' ? 'Razorpay’s signed webhook confirmed payment and the reservation was consumed exactly once.' : ['verifying', 'opening', 'cancelling'].includes(stage) ? 'The browser cannot mark this order paid. Nexora is polling the authoritative backend status.' : 'Review each line, see the exact total, and approve only when the basket matches your intent.'
  const displayLines = lines.length ? lines : [
    { product_title: product.name, merchant_name: product.merchant.name, quantity, line_total: product.price * quantity },
    ...selectedAddOns.map((item) => ({ product_title: item.name, merchant_name: item.merchant.name, quantity: 1, line_total: item.price, growth_offer: true })),
  ]
  const checkoutSteps = ['Basket', 'Exact quote', 'Payment', 'Verified']

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/75 backdrop-blur-md sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={(event) => event.target === event.currentTarget && safeClose()}>
      <div className="max-h-[96dvh] w-full overflow-y-auto border border-slate-300 bg-[#f6f5f1] text-slate-950 shadow-[0_30px_100px_rgba(2,6,23,.45)] sm:max-w-6xl">
        <header className={`relative border-b px-5 py-5 sm:px-7 ${stage === 'paid' ? 'border-emerald-300 bg-emerald-50' : stopped ? 'border-rose-300 bg-rose-50' : 'border-slate-800 bg-[#11131a] text-white'}`}>
          {!processing && <button type="button" onClick={onClose} aria-label="Close checkout" className={`focus-ring absolute right-4 top-4 grid size-9 place-items-center border ${stopped || stage === 'paid' ? 'border-slate-300 bg-white text-slate-600' : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}><X size={16} /></button>}
          <div className="flex max-w-3xl items-start gap-4 pr-10">
            <span className={`grid size-11 shrink-0 place-items-center border ${stage === 'paid' ? 'border-emerald-600 bg-emerald-500 text-white' : stopped ? 'border-rose-600 bg-rose-500 text-white' : 'border-violet-400 bg-violet-600 text-white shadow-[3px_3px_0_#fff]'}`}>{stage === 'paid' ? <PackageCheck size={21} /> : stopped ? <AlertTriangle size={20} /> : processing || ['verifying', 'cancelling'].includes(stage) ? <LoaderCircle size={21} className="animate-spin" /> : <LockKeyhole size={20} />}</span>
            <div><p className={`font-mono text-[8px] font-semibold uppercase tracking-[.16em] ${stopped ? 'text-rose-700' : stage === 'paid' ? 'text-emerald-700' : 'text-violet-300'}`}>Nexora protected checkout</p><h2 id="checkout-title" className="mt-2 text-xl font-semibold sm:text-2xl">{stageTitle}</h2><p className={`mt-2 text-xs leading-5 sm:text-sm ${stopped || stage === 'paid' ? 'text-slate-600' : 'text-slate-400'}`}>{stageCopy}</p></div>
          </div>
        </header>

        <nav className="grid grid-cols-4 border-b border-slate-300 bg-white" aria-label="Checkout progress">
          {checkoutSteps.map((label, index) => <div key={label} className={`relative flex items-center gap-2 border-r border-slate-200 px-3 py-3 last:border-r-0 sm:px-5 ${index < stepIndex ? 'text-emerald-700' : index === stepIndex ? 'bg-violet-50 text-violet-700' : 'text-slate-400'}`}><span className={`grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[8px] ${index < stepIndex ? 'border-emerald-500 bg-emerald-500 text-white' : index === stepIndex ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300'}`}>{index < stepIndex ? <Check size={10} /> : index + 1}</span><span className="hidden text-[10px] font-semibold sm:inline">{label}</span></div>)}
        </nav>

        <div className="grid lg:grid-cols-[1.18fr_.82fr]">
          <div className="border-slate-300 p-5 sm:p-7 lg:border-r">
            {processing && <div className="mb-5 flex items-center gap-3 border border-violet-200 bg-violet-50 p-4" aria-live="polite"><LoaderCircle size={16} className="animate-spin text-violet-600" /><div><p className="text-xs font-semibold text-violet-900">Securing the transaction</p><p className="mt-1 font-mono text-[8px] text-violet-600">LOCKING PRODUCTS · CHECKING STOCK · PRESERVING SNAPSHOTS</p></div></div>}
            {error && <div className="mb-5 border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800" role="alert"><p className="font-semibold">{error}</p>{reasonCode && <span className="mt-2 block font-mono text-[8px]">REASON · {reasonCode}</span>}</div>}

            {stage === 'cart' && <>
              <section aria-labelledby="basket-product"><div className="flex items-center justify-between"><div><p className="mono-label text-violet-600">01 · Selected product</p><h3 id="basket-product" className="mt-2 text-lg font-semibold">Review quantity</h3></div><span className="border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[8px] text-emerald-700">LIVE STOCK</span></div>
                <article className="mt-4 flex flex-col gap-4 border border-slate-300 bg-white p-4 sm:flex-row sm:items-center"><span className="grid size-16 shrink-0 place-items-center border border-slate-800 bg-slate-950 font-mono text-sm font-bold tracking-widest text-violet-300">{product.imageLabel}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{product.name}</p><p className="mt-1 text-[10px] text-slate-500">{product.merchant.name} · verified merchant</p><p className="mt-2 text-sm font-bold">{money(product.price)} <span className="text-[10px] font-normal text-slate-400">per item</span></p></div><div className="flex items-center border border-slate-300"><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="focus-ring grid size-9 place-items-center text-slate-600 hover:bg-slate-100"><Minus size={13} /></button><span className="grid h-9 w-10 place-items-center border-x border-slate-300 text-sm font-semibold">{quantity}</span><button type="button" aria-label="Increase quantity" onClick={() => setQuantity((value) => value + 1)} className="focus-ring grid size-9 place-items-center text-slate-600 hover:bg-slate-100"><Plus size={13} /></button></div></article>
              </section>

              {product.addOns?.length > 0 && <section className="mt-7" aria-label="Optional add-ons"><p className="mono-label text-violet-600">02 · Optional complements</p><div className="mt-2 flex items-end justify-between gap-4"><div><h3 className="text-lg font-semibold">Choose each offer</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">Nothing is preselected. Accepting and rejecting take one click each.</p></div><span className="shrink-0 font-mono text-[8px] text-slate-400">{Object.keys(addOnChoices).length}/{product.addOns.length} ANSWERED</span></div><div className="mt-4 space-y-3">{product.addOns.map((addOn) => <article key={addOn.offerId} className={`border bg-white p-4 transition ${addOnChoices[addOn.offerId] === true ? 'border-emerald-400 shadow-[3px_3px_0_rgba(16,185,129,.15)]' : addOnChoices[addOn.offerId] === false ? 'border-slate-300 opacity-75' : 'border-slate-300 hover:border-violet-300'}`}><div className="flex justify-between gap-4"><div><p className="text-xs font-semibold">{addOn.name}</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{addOn.benefit}</p>{addOn.tradeOff && <p className="mt-2 text-[9px] text-amber-700">Trade-off: {addOn.tradeOff}</p>}</div><p className="shrink-0 text-xs font-bold">+{money(addOn.price)}</p></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setAddOnChoices((current) => ({ ...current, [addOn.offerId]: true }))} className={`focus-ring border py-2 text-[10px] font-semibold ${addOnChoices[addOn.offerId] === true ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-slate-600 hover:border-emerald-500'}`}>Add to basket</button><button type="button" onClick={() => setAddOnChoices((current) => ({ ...current, [addOn.offerId]: false }))} className={`focus-ring border py-2 text-[10px] font-semibold ${addOnChoices[addOn.offerId] === false ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 text-slate-600 hover:border-slate-950'}`}>No thanks</button></div></article>)}</div></section>}
            </>}

            {stage === 'quote' && <>
              <section><p className="mono-label text-violet-600">Server-authoritative quote</p><h3 className="mt-2 text-xl font-semibold">Confirm the precise basket</h3><p className="mt-2 text-xs leading-6 text-slate-500">Prices, quantities, product ownership, stock and policy limits were recalculated on the backend.</p></section>
              {line?.explanation && <div className="mt-5 border-l-4 border-violet-500 bg-white p-4"><p className="font-mono text-[8px] text-violet-600">WHY THIS WAS RECOMMENDED</p><p className="mt-2 text-xs leading-6 text-slate-700">{line.explanation}</p>{line.trade_offs?.length > 0 && <p className="mt-2 text-[10px] text-amber-700">Trade-off: {line.trade_offs.join(' · ')}</p>}</div>}
              {quote?.policy_snapshot?.limits && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[[quote.policy_snapshot.limits.supported_currency, 'Currency'], [quote.policy_snapshot.limits.max_item_quantity, 'Max quantity'], [money(quote.policy_snapshot.limits.max_order_value), 'Order ceiling'], ['Test mode', 'Payment mode']].map(([value, label]) => <div key={label} className="border border-slate-300 bg-white p-3"><p className="text-[10px] font-semibold text-slate-900">{value}</p><p className="mt-1 font-mono text-[7px] uppercase text-slate-400">{label}</p></div>)}</div>}
              <label className={`mt-5 flex cursor-pointer items-start gap-3 border p-4 transition ${approvedExactQuote ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white'}`}><input type="checkbox" checked={approvedExactQuote} onChange={(event) => setApprovedExactQuote(event.target.checked)} className="mt-0.5 size-4 accent-emerald-600" /><span className="text-xs leading-6 text-slate-700"><strong className="block text-slate-950">I approve this exact quote.</strong>I confirm the products, quantities, unit prices, total and disclosed limits before expiry.</span></label>
            </>}

            {order && <section className={`border p-5 ${stage === 'paid' ? 'border-emerald-300 bg-emerald-50' : stopped ? 'border-rose-300 bg-rose-50' : 'border-amber-300 bg-amber-50'}`}><p className="font-mono text-[8px] text-slate-500">AUTHORITATIVE ORDER STATUS</p><div className="mt-2 flex items-center gap-3"><span className={`size-2 rounded-full ${stage === 'paid' ? 'bg-emerald-500' : stopped ? 'bg-rose-500' : 'animate-pulse bg-amber-500'}`} /><p className="text-lg font-semibold">{statusLabel}</p></div><p className="mt-3 text-xs leading-6 text-slate-600">Order {order.order_id?.slice(0, 8).toUpperCase()}{order.reservation_expires_at ? ` · reservation expires ${new Date(order.reservation_expires_at).toLocaleTimeString()}` : ''}</p></section>}
          </div>

          <aside className="bg-white p-5 sm:p-7">
            <div className="lg:sticky lg:top-0"><p className="mono-label text-slate-400">Order summary</p><div className="mt-4 divide-y divide-slate-200 border-y border-slate-300">{displayLines.map((item, index) => <div key={item.product ?? `${item.product_title}-${index}`} className="flex justify-between gap-4 py-4"><div><p className="text-xs font-semibold">{item.product_title}</p><p className="mt-1 font-mono text-[8px] text-slate-400">QTY {item.quantity ?? 1} · {item.merchant_name}{item.growth_offer ? ' · ADD-ON' : ''}</p></div><p className="shrink-0 text-xs font-bold">{money(item.line_total)}</p></div>)}</div>
              {quote && <div className="mt-4 flex items-center justify-between border border-amber-300 bg-amber-50 p-3"><div><p className="font-mono text-[7px] text-amber-700">QUOTE {quote.quote_id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-[9px] text-amber-800">Single-use approval window</p></div><span className={`font-mono text-sm font-bold ${remainingSeconds < 60 ? 'text-rose-600' : 'text-amber-700'}`}><Clock3 size={13} className="mr-1.5 inline" />{countdown}</span></div>}
              <div className="mt-5 flex items-end justify-between"><div><p className="text-xs text-slate-500">{quote ? 'Exact quote total' : 'Estimated total'}</p><p className="mt-1 font-mono text-[8px] text-slate-400">INR · taxes included where applicable</p></div><p className="text-2xl font-bold tracking-tight">{money(total)}</p></div>

              {stage === 'cart' && <button type="button" disabled={!choicesComplete} onClick={() => requestQuote()} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 border border-violet-700 bg-violet-600 py-3.5 text-sm font-semibold text-white shadow-[4px_4px_0_#111827] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:shadow-none">{user ? choicesComplete ? 'Generate exact quote' : 'Answer each add-on offer' : 'Sign in to continue'} <ChevronRight size={15} /></button>}
              {stage === 'quote' && <><button type="button" disabled={!approvedExactQuote || remainingSeconds <= 0} onClick={approveAndReserve} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 border border-violet-700 bg-violet-600 py-3.5 text-sm font-semibold text-white shadow-[4px_4px_0_#111827] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:shadow-none"><CreditCard size={16} /> Approve, reserve & pay</button><button type="button" onClick={() => requestQuote(Number(quote.policy_snapshot?.limits?.max_item_quantity ?? 5) + 1)} className="focus-ring mt-3 w-full py-2 text-[9px] text-slate-400 hover:text-rose-600">Demo safe block: exceed quantity limit</button></>}
              {['verifying', 'opening'].includes(stage) && order?.cancellable && <button type="button" onClick={cancelPendingOrder} className="focus-ring mt-6 w-full border border-rose-300 bg-rose-50 py-3 text-xs font-semibold text-rose-700">Cancel and release reserved stock</button>}
              {stage === 'paid' && <button type="button" onClick={onClose} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 border border-emerald-600 bg-emerald-600 py-3.5 text-sm font-semibold text-white"><Check size={16} /> Finish</button>}
              {stopped && <button type="button" onClick={onClose} className="focus-ring mt-6 w-full border border-slate-950 bg-slate-950 py-3 text-sm font-semibold text-white">Close checkout</button>}
              <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">{['Idempotent order creation', 'Atomic stock reservation', 'Signed webhook settlement'].map((item) => <p key={item} className="flex items-center gap-2 font-mono text-[8px] text-slate-500"><ShieldCheck size={11} className="text-emerald-600" /> {item}</p>)}</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
