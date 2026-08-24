import { Check, ChevronRight, LockKeyhole, ShieldCheck, X } from 'lucide-react'
import { orderStates } from '../data/mockData'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

export default function ApprovalModal({ product, onClose, onApprove, approved }) {
  if (!product) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/80 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="approval-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl shadow-indigo-950/60 sm:max-w-md sm:rounded-3xl">
        <div className="relative border-b border-slate-800 bg-gradient-to-br from-indigo-500/15 via-slate-900 to-slate-900 p-6">
          <button type="button" onClick={onClose} aria-label="Close modal" className="focus-ring absolute right-4 top-4 rounded-full border border-slate-700 bg-slate-900/80 p-2 text-slate-400 transition hover:text-white"><X size={16} /></button>
          <div className={`mb-4 grid size-11 place-items-center rounded-2xl ${approved ? 'bg-emerald-500 text-white' : 'bg-indigo-500 text-white shadow-glow'}`}>
            {approved ? <Check size={22} /> : <LockKeyhole size={20} />}
          </div>
          <p className="mono-label text-indigo-400">Human approval checkpoint</p>
          <h2 id="approval-title" className="mt-2 text-xl font-semibold tracking-tight text-white">{approved ? 'Order approved' : 'Review before you buy'}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{approved ? 'Your mock approval was recorded. No payment was charged.' : 'Nexora will never complete a purchase without your explicit approval.'}</p>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div>
              <p className="text-sm font-semibold text-white">{product.name}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-500">{product.id.toUpperCase()} · Qty 1</p>
            </div>
            <p className="text-sm font-bold text-white">{money(product.price)}</p>
          </div>

          <div className="my-5 space-y-3">
            {orderStates.map((item, index) => {
              const state = approved && index < 2 ? 'complete' : item.state
              return (
                <div key={item.label} className="flex items-center gap-3">
                  <span className={`grid size-5 place-items-center rounded-full border ${state === 'complete' ? 'border-emerald-500 bg-emerald-500 text-white' : state === 'active' ? 'border-indigo-400 bg-indigo-500/15 text-indigo-400 shadow-glow' : 'border-slate-700 text-slate-600'}`}>
                    {state === 'complete' ? <Check size={11} /> : <span className="size-1 rounded-full bg-current" />}
                  </span>
                  <span className={`text-xs ${state === 'pending' ? 'text-slate-600' : 'text-slate-300'}`}>{item.label}</span>
                </div>
              )
            })}
          </div>

          <div className="mb-4 flex items-center justify-between border-y border-slate-800 py-4">
            <span className="text-sm text-slate-400">Total payable</span>
            <span className="text-xl font-bold text-white">{money(product.price)}</span>
          </div>

          {approved ? (
            <button type="button" onClick={onClose} className="focus-ring w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400">Done</button>
          ) : (
            <button type="button" onClick={onApprove} className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:bg-indigo-400">
              Approve order <ChevronRight size={16} />
            </button>
          )}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[9px] text-slate-500"><ShieldCheck size={11} /> Mock checkout · no payment will be processed</p>
        </div>
      </div>
    </div>
  )
}
