import { useEffect, useState } from 'react'
import { Check, ChevronRight, CreditCard, LoaderCircle, LockKeyhole, PackageCheck, ShieldCheck, X } from 'lucide-react'
import { createOrder, getApiError, loadRazorpayCheckout } from '../../services/api'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

export default function CheckoutModal({ product, onClose, onOrderPlaced }) {
  const [paymentState, setPaymentState] = useState('review')
  const [buyerEmail, setBuyerEmail] = useState('aarav.kapoor@example.com')
  const [errorMessage, setErrorMessage] = useState('')
  const [orderDetails, setOrderDetails] = useState(null)

  useEffect(() => {
    setPaymentState('review')
    setErrorMessage('')
    setOrderDetails(null)
  }, [product])

  if (!product) return null

  const processing = paymentState === 'creating' || paymentState === 'opening'
  const placed = paymentState === 'placed'

  const approvePayment = async () => {
    if (!buyerEmail.trim()) return
    setPaymentState('creating')
    setErrorMessage('')

    try {
      const [orderResponse] = await Promise.all([
        createOrder({ productId: product.id, quantity: 1, buyerEmail: buyerEmail.trim() }),
        loadRazorpayCheckout(),
      ])
      const order = orderResponse.data
      setOrderDetails(order)
      setPaymentState('opening')

      const checkout = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: 'Nexora',
        description: product.name,
        order_id: order.razorpay_order_id,
        prefill: { email: buyerEmail.trim() },
        theme: { color: '#6366F1', backdrop_color: '#020617' },
        handler: (payment) => {
          setPaymentState('placed')
          onOrderPlaced({ product, order, payment })
        },
        modal: {
          ondismiss: () => setPaymentState((current) => current === 'placed' ? current : 'review'),
        },
      })

      checkout.on('payment.failed', (response) => {
        setErrorMessage(response?.error?.description ?? 'Razorpay could not complete the payment.')
        setPaymentState('error')
      })
      checkout.open()
    } catch (error) {
      setErrorMessage(getApiError(error, error?.message ?? 'Unable to initialize Razorpay Checkout.'))
      setPaymentState('error')
    }
  }

  const safeClose = () => {
    if (!processing) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/85 backdrop-blur-md sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={(event) => event.target === event.currentTarget && safeClose()}>
      <div className="w-full overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl shadow-indigo-950/70 sm:max-w-md sm:rounded-3xl">
        <div className={`relative border-b p-6 ${placed ? 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 to-slate-900' : 'border-slate-800 bg-gradient-to-br from-indigo-500/15 via-slate-900 to-slate-900'}`}>
          {!processing && <button type="button" onClick={onClose} aria-label="Close checkout" className="focus-ring absolute right-4 top-4 rounded-full border border-slate-700 bg-slate-900/80 p-2 text-slate-400 transition hover:text-white"><X size={16} /></button>}
          <div className={`mb-4 grid size-11 place-items-center rounded-2xl text-white ${placed ? 'bg-emerald-500 shadow-[0_0_32px_rgba(16,185,129,.3)]' : 'bg-indigo-500 shadow-glow'}`}>
            {placed ? <PackageCheck size={21} /> : processing ? <LoaderCircle size={21} className="animate-spin" /> : <LockKeyhole size={20} />}
          </div>
          <p className={`mono-label ${placed ? 'text-emerald-400' : 'text-indigo-400'}`}>{placed ? 'Payment response received' : processing ? 'Secure Razorpay checkout' : 'Human approval checkpoint'}</p>
          <h2 id="checkout-title" className="mt-2 text-xl font-semibold tracking-tight text-white">{placed ? 'Order Placed' : paymentState === 'creating' ? 'Creating your order' : paymentState === 'opening' ? 'Opening Razorpay' : 'Review your order'}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{placed ? 'Your payment response was accepted. Nexora will finalize the paid state after Razorpay’s signed webhook arrives.' : processing ? 'The amount and stock are being validated by the Django backend.' : 'Payment begins only after you explicitly approve this order.'}</p>
        </div>

        <div className="p-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-white">{product.name}</p><p className="mt-1 font-mono text-[9px] text-slate-500">PRODUCT #{product.id} · {product.specs?.switches}</p></div><p className="shrink-0 text-sm font-bold text-white">{money(product.price)}</p></div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 font-mono text-[8px] text-slate-500"><span>{product.merchant.name} · verified</span><span>QTY 1</span></div>
          </div>

          {!placed && (
            <label className="mt-4 block text-[10px] font-medium text-slate-400">Receipt email
              <input type="email" required disabled={processing} value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 focus:border-indigo-500 disabled:opacity-60" />
            </label>
          )}

          {processing && <div className="my-5 flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3" aria-live="polite"><LoaderCircle size={14} className="animate-spin text-indigo-400" /><p className="font-mono text-[9px] text-indigo-300">{paymentState === 'creating' ? 'VALIDATING STOCK · CREATING RAZORPAY ORDER' : 'RAZORPAY CHECKOUT READY · OPENING'}</p></div>}

          {errorMessage && <div className="my-4 rounded-xl border border-[#DC143C]/30 bg-[#DC143C]/10 p-3 text-[11px] text-rose-300" role="alert">{errorMessage}</div>}

          {placed && (
            <div className="my-5 space-y-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-2 font-mono text-[9px] text-emerald-300"><Check size={13} /> Razorpay payment response received</p>
              <p className="flex items-center gap-2 font-mono text-[9px] text-slate-400"><ShieldCheck size={13} /> Awaiting signed webhook confirmation</p>
              <p className="border-t border-emerald-500/10 pt-3 font-mono text-[8px] text-slate-500">ORDER · {orderDetails?.order_id}</p>
            </div>
          )}

          {!processing && !placed && (
            <>
              <div className="my-5 flex items-center justify-between border-y border-slate-800 py-4"><span className="text-sm text-slate-400">Total payable</span><span className="text-xl font-bold text-white">{money(product.price)}</span></div>
              <button type="button" disabled={!buyerEmail.trim()} onClick={approvePayment} className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"><CreditCard size={16} /> Approve & Pay securely <ChevronRight size={15} /></button>
              <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-xs text-slate-500 transition hover:text-slate-300">Cancel</button>
            </>
          )}
          {placed && <button type="button" onClick={onClose} className="focus-ring mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400"><Check size={16} /> Done</button>}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[8px] text-slate-600"><ShieldCheck size={10} /> Razorpay Checkout · server-authoritative amount · verified webhook settlement</p>
        </div>
      </div>
    </div>
  )
}
