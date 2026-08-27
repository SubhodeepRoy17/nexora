import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, Clock3, CreditCard, LoaderCircle, LockKeyhole, Minus, PackageCheck, Plus, ShieldCheck, X } from 'lucide-react'
import { approveQuote, cancelOrder, createCart, createCartQuote, createOrder, getApiError, getOrder, loadRazorpayCheckout, newIdempotencyKey, respondToGrowthOffer, verifyCheckoutPayment } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import DataFreshness from '../common/DataFreshness'
import useBoundedPolling from '../../hooks/useBoundedPolling'
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap'

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
const terminalStates = new Set(['PAID', 'PAYMENT_FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'MANUAL_REVIEW'])
const statusMessages = {
  PAYMENT_PENDING: 'Your payment is still being confirmed.',
  PAYMENT_FAILED: 'Payment failed. Your reserved items were released.',
  CANCELLED: 'Checkout cancelled. Your reserved items were released.',
  EXPIRED: 'The payment window expired.',
  REFUND_PENDING: 'Your full refund is being confirmed.',
  REFUNDED: 'Your refund is complete.',
  MANUAL_REVIEW: 'This payment needs a quick review.',
}

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
  const [checkoutProofVerified, setCheckoutProofVerified] = useState(false)
  const [pollingStopped, setPollingStopped] = useState(false)
  const [statusUpdatedAt, setStatusUpdatedAt] = useState(null)
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
    setCheckoutProofVerified(false)
    setPollingStopped(false)
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

  const pollOrder = useCallback(
    async (signal) => {
      if (!order?.order_id) return
      try {
        const { data } = await getOrder(order.order_id, signal)
        setOrder(data)
        setStatusUpdatedAt(new Date().toISOString())
        if (data.status === 'PAID' && !notifiedPaid.current) {
          notifiedPaid.current = true
          setStage('paid')
          onOrderPlaced({ product, order: data })
        } else if (terminalStates.has(data.status)) {
          setStage('terminal')
        } else if (data.status === 'REFUND_PENDING') {
          setStage('refunding')
        } else {
          setStage('verifying')
        }
      } catch (pollError) {
        if (!signal?.aborted) {
          setError(getApiError(pollError, 'Could not refresh the order status.'))
          if (pollError?.response?.status === 404) {
            setPollingStopped(true)
            setStage('error')
          }
        }
      }
    },
    [order?.order_id, onOrderPlaced, product],
  )
  useBoundedPolling(pollOrder, {
    enabled: Boolean(order?.order_id && !terminalStates.has(order.status) && !pollingStopped),
    intervalMs: 2500,
    maxCycles: 120,
  })

  const lines = quote?.items ?? []
  const line = lines[0]
  const processing = ['quoting', 'approving', 'reserving', 'opening'].includes(stage)
  const safeClose = useCallback(() => {
    if (!processing) onClose()
  }, [onClose, processing])
  const dialogRef = useDialogFocusTrap(Boolean(product), safeClose)
  const selectedAddOns = product?.addOns?.filter((item) => addOnChoices[item.offerId] === true) ?? []
  const choicesComplete = (product?.addOns ?? []).every((item) => typeof addOnChoices[item.offerId] === 'boolean')
  const total = quote?.total_amount ?? product?.price * quantity + selectedAddOns.reduce((sum, item) => sum + item.price, 0)
  const countdown = useMemo(() => `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`, [remainingSeconds])
  const quantityBlock = useMemo(() => {
    if (reasonCode !== 'QUANTITY_LIMIT_EXCEEDED') return null
    const limit = Number(quote?.policy_snapshot?.limits?.max_item_quantity)
    const requested = Math.max(...(quote?.items ?? []).map((item) => Number(item.quantity)), 0)
    if (!Number.isFinite(limit) || !requested) return null
    return {
      requested,
      limit,
      explanation: `You chose ${requested}. The limit is ${limit} per item. Nothing was charged. Choose ${limit} or fewer to continue.`,
    }
  }, [quote, reasonCode])

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
      await Promise.all(
        (product.addOns ?? []).map((addOn) =>
          respondToGrowthOffer({
            offerId: addOn.offerId,
            offerToken: addOn.offerToken,
            accepted: addOnChoices[addOn.offerId],
          }),
        ),
      )
      const items = [
        {
          decision_id: product.decisionId,
          decision_token: product.decisionToken,
          quantity: requestedQuantity,
        },
        ...selectedAddOns.map((addOn) => ({
          decision_id: addOn.decisionId,
          decision_token: addOn.decisionToken,
          growth_offer_id: addOn.offerId,
          quantity: 1,
        })),
      ]
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
    setError('')
    setReasonCode('')
    setStage('opening')
    try {
      await loadRazorpayCheckout()
    } catch (sdkError) {
      setError(getApiError(sdkError, 'Razorpay Checkout could not be loaded.'))
      setStage('error')
      return
    }

    setStage('approving')
    try {
      const approval = await approveQuote(quote.quote_id, approvalKey.current)
      setStage('reserving')
      const orderResponse = await createOrder({
        quoteId: quote.quote_id,
        approvalToken: approval.data.approval_token,
        idempotencyKey: paymentKey.current,
      })
      const authoritativeOrder = orderResponse.data
      setPollingStopped(false)
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
        handler: async (paymentResult) => {
          // Browser success is only a hint. The backend verifies it, then asks
          // Razorpay directly for authoritative capture state.
          setStage('verifying')
          setOrder((current) => ({ ...current, status: 'PAYMENT_PENDING' }))
          try {
            const { data } = await verifyCheckoutPayment(authoritativeOrder.order_id, paymentResult)
            setCheckoutProofVerified(Boolean(data.checkout_signature_verified))
            if (data.order) {
              setOrder(data.order)
              setStatusUpdatedAt(new Date().toISOString())
              if (data.order.status === 'PAID' && !notifiedPaid.current) {
                notifiedPaid.current = true
                setStage('paid')
                onOrderPlaced({ product, order: data.order })
              }
            }
          } catch (verificationError) {
            setCheckoutProofVerified(false)
            setError(getApiError(verificationError, 'Your payment is still being confirmed. You can safely close this window and check your order again shortly.'))
          }
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

  const statusLabel = order?.status?.replaceAll('_', ' ') ?? ''
  const stopped = ['blocked', 'error', 'terminal'].includes(stage)
  const stepIndex = stage === 'cart' ? 0 : ['quoting', 'quote', 'blocked', 'error'].includes(stage) ? 1 : stage === 'paid' ? 3 : 2
  const stageTitle = stage === 'cart' ? 'Review your order' : stage === 'quote' ? 'Confirm the total' : stage === 'paid' ? 'Order confirmed' : stage === 'refunding' ? 'Refund pending' : stage === 'opening' ? 'Opening payment' : ['verifying', 'cancelling'].includes(stage) ? 'Confirming payment' : stage === 'terminal' ? statusLabel : stage === 'blocked' ? 'Checkout paused' : processing ? 'Preparing checkout' : 'Checkout paused'
  const stageCopy = stage === 'paid' ? 'Payment received. Your order is complete.' : stage === 'refunding' ? 'Your refund is being confirmed.' : stage === 'opening' ? 'Razorpay will open in a moment.' : ['verifying', 'cancelling'].includes(stage) ? `${checkoutProofVerified ? 'Payment details accepted. ' : ''}Waiting for final confirmation.` : stopped ? 'Nothing else will happen until you choose what to do next.' : stage === 'quote' ? 'Check the items and approve the final amount.' : 'Check your item and quantity before continuing.'
  const displayLines = lines.length
    ? lines
    : [
        {
          product_title: product.name,
          merchant_name: product.merchant.name,
          quantity,
          line_total: product.price * quantity,
        },
        ...selectedAddOns.map((item) => ({
          product_title: item.name,
          merchant_name: item.merchant.name,
          quantity: 1,
          line_total: item.price,
          growth_offer: true,
        })),
      ]
  const checkoutSteps = [
    { label: 'Basket', hint: 'Check items' },
    { label: 'Review', hint: 'Approve total' },
    { label: 'Pay', hint: 'Use Razorpay' },
    { label: 'Done', hint: 'Confirmation' },
  ]

  return (
    <div className="fixed inset-x-0 bottom-0 top-20 z-50 grid place-items-end bg-[#17372f]/65 backdrop-blur-md sm:place-items-center sm:p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && safeClose()}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="modal-scroll max-h-full w-full overflow-y-auto rounded-t-[2rem] border border-white/75 bg-[#f6f8f2] text-slate-950 shadow-[0_30px_100px_rgba(2,6,23,.35)] sm:max-w-6xl sm:rounded-[2rem]">
        <header className={`relative border-b px-5 py-5 sm:px-7 ${stage === 'paid' ? 'border-emerald-300 bg-emerald-50' : stopped ? 'border-rose-300 bg-rose-50' : 'border-violet-200 bg-violet-50 text-slate-950'}`}>
          {!processing && (
            <button type="button" onClick={onClose} aria-label="Close checkout" className="focus-ring absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
              <X size={16} />
            </button>
          )}
          <div className="flex max-w-3xl items-start gap-4 pr-10">
            <span className={`grid size-11 shrink-0 place-items-center rounded-2xl border ${stage === 'paid' ? 'border-emerald-600 bg-emerald-500 text-white' : stopped ? 'border-rose-600 bg-rose-500 text-white' : 'border-violet-400 bg-violet-600 text-white shadow-sm'}`}>{stage === 'paid' ? <PackageCheck size={21} /> : stopped ? <AlertTriangle size={20} /> : processing || ['verifying', 'cancelling'].includes(stage) ? <LoaderCircle size={21} className="animate-spin" /> : <LockKeyhole size={20} />}</span>
            <div>
              <p className={`text-[10px] font-semibold uppercase tracking-[.12em] ${stopped ? 'text-rose-700' : stage === 'paid' ? 'text-emerald-700' : 'text-violet-700'}`}>Secure checkout</p>
              <h2 id="checkout-title" className="mt-2 text-xl font-semibold sm:text-2xl">
                {stageTitle}
              </h2>
              <p className="mt-2 text-xs leading-5 text-slate-600 sm:text-sm">{stageCopy}</p>
            </div>
          </div>
        </header>

        <nav className="border-b border-emerald-950/10 bg-[#edf3ea] px-3 py-3 sm:px-7 sm:py-4" aria-label="Checkout progress">
          <ol className="mx-auto grid max-w-4xl grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {checkoutSteps.map(({ label, hint }, index) => {
              const complete = index < stepIndex || (stage === 'paid' && index === stepIndex)
              const current = index === stepIndex && !complete
              return (
                <li
                  key={label}
                  aria-current={current ? 'step' : undefined}
                  aria-label={`${label}, ${complete ? 'completed' : current ? 'current step' : 'upcoming'}`}
                  className={`min-w-0 rounded-xl border px-2 py-2.5 transition-all duration-300 sm:px-3 sm:py-3 ${complete ? 'border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_20px_rgba(5,150,105,.2)]' : current ? 'border-[#17372f] bg-[#17372f] text-white shadow-[0_8px_20px_rgba(23,55,47,.18)]' : 'border-emerald-950/10 bg-white/75 text-[#31594f]/55'}`}
                >
                  <div className="flex items-center gap-1.5 sm:gap-2.5">
                    <span className={`grid size-6 shrink-0 place-items-center rounded-full border text-[9px] font-bold sm:size-8 sm:text-[11px] ${complete ? 'border-white/45 bg-white text-emerald-700' : current ? 'border-white/25 bg-white/10 text-white' : 'border-emerald-950/15 bg-white text-[#31594f]/55'}`}>
                      {complete ? <Check size={14} strokeWidth={3} /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[10px] font-semibold sm:text-xs">{label}</span>
                      <span className={`mt-0.5 hidden truncate text-[9px] md:block ${complete || current ? 'text-white/70' : 'text-[#31594f]/45'}`}>{hint}</span>
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </nav>

        <div className="grid lg:grid-cols-[1.18fr_.82fr]">
          <div className="border-slate-300 p-5 sm:p-7 lg:border-r">
            {processing && (
              <div className="mb-5 flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4" aria-live="polite">
                <LoaderCircle size={16} className="animate-spin text-violet-600" />
                <div>
                  <p className="text-xs font-semibold text-violet-900">Preparing your checkout</p>
                  <p className="mt-1 text-[10px] text-violet-700">This will only take a moment.</p>
                </div>
              </div>
            )}
            {error && (
              <div className="mb-5 border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800" role="alert">
                <p className="font-semibold">{error}</p>
                {quantityBlock && (
                  <div className="mt-3 border-t border-rose-200 pt-3" aria-label="Safe block outcome">
                    <p className="leading-5">{quantityBlock.explanation}</p>
                    <p className="mt-2 text-[10px] font-semibold">No payment · No stock change</p>
                  </div>
                )}
              </div>
            )}

            {stage === 'cart' && (
              <>
                <section aria-labelledby="basket-product">
                  <div className="flex items-center justify-between">
                    <h3 id="basket-product" className="text-lg font-semibold">Your item</h3>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">In stock</span>
                  </div>
                  <article className="mt-4 flex flex-col gap-4 rounded-2xl border border-emerald-950/10 bg-white p-4 shadow-[0_10px_28px_rgba(42,81,68,.07)] sm:flex-row sm:items-center">
                    <span className="grid size-16 shrink-0 place-items-center rounded-2xl border border-slate-800 bg-slate-950 font-mono text-sm font-bold tracking-widest text-violet-300">{product.imageLabel}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{product.name}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{product.merchant.name} · verified merchant</p>
                      <p className="mt-2 text-sm font-bold">
                        {money(product.price)} <span className="text-[10px] font-normal text-slate-400">per item</span>
                      </p>
                    </div>
                    <div className="flex items-center overflow-hidden rounded-full border border-slate-300">
                      <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="focus-ring grid size-9 place-items-center text-slate-600 hover:bg-slate-100">
                        <Minus size={13} />
                      </button>
                      <span className="grid h-9 w-10 place-items-center border-x border-slate-300 text-sm font-semibold">{quantity}</span>
                      <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((value) => value + 1)} className="focus-ring grid size-9 place-items-center text-slate-600 hover:bg-slate-100">
                        <Plus size={13} />
                      </button>
                    </div>
                  </article>
                </section>

                {product.addOns?.length > 0 && (
                  <section className="mt-7" aria-label="Optional add-ons">
                    <p className="mono-label text-violet-600">02 · Optional complements</p>
                    <div className="mt-2 flex items-end justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">Choose each offer</h3>
                        <p className="mt-1 text-[10px] leading-5 text-slate-500">Nothing is preselected. Accepting and rejecting take one click each.</p>
                      </div>
                      <span className="shrink-0 font-mono text-[8px] text-slate-400">
                        {Object.keys(addOnChoices).length}/{product.addOns.length} ANSWERED
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {product.addOns.map((addOn) => (
                        <article key={addOn.offerId} className={`border bg-white p-4 transition ${addOnChoices[addOn.offerId] === true ? 'border-emerald-400 shadow-[3px_3px_0_rgba(16,185,129,.15)]' : addOnChoices[addOn.offerId] === false ? 'border-slate-300 opacity-75' : 'border-slate-300 hover:border-violet-300'}`}>
                          <div className="flex justify-between gap-4">
                            <div>
                              <p className="text-xs font-semibold">{addOn.name}</p>
                              <p className="mt-1 text-[10px] leading-5 text-slate-500">{addOn.benefit}</p>
                              {addOn.tradeOff && <p className="mt-2 text-[9px] text-amber-700">Trade-off: {addOn.tradeOff}</p>}
                            </div>
                            <p className="shrink-0 text-xs font-bold">+{money(addOn.price)}</p>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setAddOnChoices((current) => ({
                                  ...current,
                                  [addOn.offerId]: true,
                                }))
                              }
                              className={`focus-ring border py-2 text-[10px] font-semibold ${addOnChoices[addOn.offerId] === true ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-slate-600 hover:border-emerald-500'}`}
                            >
                              Add to basket
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setAddOnChoices((current) => ({
                                  ...current,
                                  [addOn.offerId]: false,
                                }))
                              }
                              className={`focus-ring border py-2 text-[10px] font-semibold ${addOnChoices[addOn.offerId] === false ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 text-slate-600 hover:border-slate-950'}`}
                            >
                              No thanks
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {stage === 'quote' && (
              <>
                <section>
                  <h3 className="text-xl font-semibold">Review and approve</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-500">Check the items and final amount before paying.</p>
                </section>
                {line?.explanation && (
                  <div className="mt-5 border-l-4 border-violet-500 bg-white p-4">
                    <p className="font-mono text-[8px] text-violet-600">WHY THIS WAS RECOMMENDED</p>
                    <p className="mt-2 text-xs leading-6 text-slate-700">{line.explanation}</p>
                    {line.trade_offs?.length > 0 && <p className="mt-2 text-[10px] text-amber-700">Trade-off: {line.trade_offs.join(' · ')}</p>}
                  </div>
                )}
                {quote?.policy_snapshot?.limits && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      [quote.policy_snapshot.limits.supported_currency, 'Currency'],
                      [quote.policy_snapshot.limits.max_item_quantity, 'Max quantity'],
                      [money(quote.policy_snapshot.limits.max_order_value), 'Order ceiling'],
                      ['Practice checkout', 'Payment'],
                    ].map(([value, label]) => (
                      <div key={label} className="border border-slate-300 bg-white p-3">
                        <p className="text-[10px] font-semibold text-slate-900">{value}</p>
                        <p className="mt-1 font-mono text-[7px] uppercase text-slate-400">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
                <label className={`mt-5 flex cursor-pointer items-start gap-3 border p-4 transition ${approvedExactQuote ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white'}`}>
                  <input type="checkbox" checked={approvedExactQuote} onChange={(event) => setApprovedExactQuote(event.target.checked)} className="mt-0.5 size-4 accent-emerald-600" />
                  <span className="text-xs leading-6 text-slate-700">
                    <strong className="block text-slate-950">I approve {money(total)}.</strong>The items, quantities and total are correct.
                  </span>
                </label>
              </>
            )}

            {order && (
              <section className={`border p-5 ${stage === 'paid' ? 'border-emerald-300 bg-emerald-50' : stopped ? 'border-rose-300 bg-rose-50' : 'border-amber-300 bg-amber-50'}`} role="status" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[8px] text-slate-500">ORDER STATUS</p>
                  <DataFreshness updatedAt={statusUpdatedAt} staleAfterMs={10000} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className={`size-2 rounded-full ${stage === 'paid' ? 'bg-emerald-500' : stopped ? 'bg-rose-500' : 'animate-pulse bg-amber-500'}`} />
                  <p className="text-lg font-semibold">{statusLabel}</p>
                </div>
                <p className="mt-3 text-xs leading-6 text-slate-600">{statusMessages[order.status] ?? 'We are checking this order.'}</p>
                {order.refunds?.[0] && (
                  <p className="mt-2 font-mono text-[8px] text-slate-500">
                    REFUND {order.refunds[0].status} · {money(order.refunds[0].amount)}
                  </p>
                )}
              </section>
            )}
          </div>

          <aside className="bg-white p-5 sm:p-7">
            <div className="lg:sticky lg:top-0">
              <p className="mono-label text-slate-400">Order summary</p>
              <div className="mt-4 divide-y divide-slate-200 border-y border-slate-300">
                {displayLines.map((item, index) => (
                  <div key={item.product ?? `${item.product_title}-${index}`} className="flex justify-between gap-4 py-4">
                    <div>
                      <p className="text-xs font-semibold">{item.product_title}</p>
                      <p className="mt-1 font-mono text-[8px] text-slate-400">
                        QTY {item.quantity ?? 1} · {item.merchant_name}
                        {item.growth_offer ? ' · ADD-ON' : ''}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-bold">{money(item.line_total)}</p>
                  </div>
                ))}
              </div>
              {quote && (
                <div className="mt-4 flex items-center justify-between border border-amber-300 bg-amber-50 p-3">
                  <div>
                    <p className="text-[9px] font-semibold text-amber-800">Price held</p>
                    <p className="mt-1 text-[9px] text-amber-700">Complete before time runs out</p>
                  </div>
                  <span className={`font-mono text-sm font-bold ${remainingSeconds < 60 ? 'text-rose-600' : 'text-amber-700'}`}>
                    <Clock3 size={13} className="mr-1.5 inline" />
                    {countdown}
                  </span>
                </div>
              )}
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="text-xs text-slate-500">{quote ? 'Exact quote total' : 'Estimated total'}</p>
                  <p className="mt-1 font-mono text-[8px] text-slate-400">INR · taxes included where applicable</p>
                </div>
                <p className="text-2xl font-bold tracking-tight">{money(total)}</p>
              </div>

              {stage === 'cart' && (
                <button type="button" disabled={!choicesComplete} onClick={() => requestQuote()} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 border border-violet-700 bg-violet-600 py-3.5 text-sm font-semibold text-white shadow-[4px_4px_0_#111827] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:shadow-none">
                  {user ? (choicesComplete ? 'See final total' : 'Answer each add-on offer') : 'Sign in to continue'} <ChevronRight size={15} />
                </button>
              )}
              {stage === 'quote' && (
                <>
                  <button type="button" disabled={!approvedExactQuote || remainingSeconds <= 0} onClick={approveAndReserve} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 border border-violet-700 bg-violet-600 py-3.5 text-sm font-semibold text-white shadow-[4px_4px_0_#111827] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:shadow-none">
                    <CreditCard size={16} /> Approve & pay
                  </button>
                  <button type="button" onClick={() => requestQuote(Number(quote.policy_snapshot?.limits?.max_item_quantity ?? 5) + 1)} className="focus-ring mt-3 w-full py-2 text-[9px] text-slate-400 hover:text-rose-600">
                    See how Nexora safely stops an over-limit order
                  </button>
                </>
              )}
              {['verifying', 'opening'].includes(stage) && order?.cancellable && (
                <button type="button" onClick={cancelPendingOrder} className="focus-ring mt-6 w-full border border-rose-300 bg-rose-50 py-3 text-xs font-semibold text-rose-700">
                  Cancel and release reserved stock
                </button>
              )}
              {stage === 'paid' && (
                <button type="button" onClick={onClose} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 border border-emerald-600 bg-emerald-600 py-3.5 text-sm font-semibold text-white">
                  <Check size={16} /> Finish
                </button>
              )}
              {['blocked', 'error'].includes(stage) && (
                <button
                  type="button"
                  onClick={() => {
                    setStage('cart')
                    setError('')
                    setReasonCode('')
                    setQuote(null)
                    approvalKey.current = newIdempotencyKey('quote-approval')
                    paymentKey.current = newIdempotencyKey('payment-order')
                  }}
                  className="focus-ring mt-6 w-full border border-violet-700 bg-violet-600 py-3 text-sm font-semibold text-white"
                >
                  Return to basket and retry
                </button>
              )}
              {stage === 'terminal' && (
                <button type="button" onClick={onClose} className="focus-ring mt-6 w-full border border-slate-950 bg-slate-950 py-3 text-sm font-semibold text-white">
                  Close checkout
                </button>
              )}
              <div className="mt-6 border-t border-slate-200 pt-5">
                <p className="flex items-center gap-2 text-[11px] text-slate-500">
                  <ShieldCheck size={14} className="text-emerald-600" /> Payment completes only after confirmation.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
