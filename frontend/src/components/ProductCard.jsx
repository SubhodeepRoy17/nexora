import { ArrowUpRight, Laptop, ShieldCheck, Star } from 'lucide-react'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

export default function ProductCard({ product, featured = false, onBuy }) {
  const disabled = product.stock === 0

  return (
    <article className={`group relative min-w-[285px] flex-1 overflow-hidden rounded-2xl border bg-slate-900/90 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:shadow-glow md:min-w-0 ${featured ? 'border-indigo-500/40 shadow-glow' : 'border-slate-800'}`}>
      {featured && (
        <div className="absolute right-0 top-0 rounded-bl-xl bg-indigo-500 px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-white">Top match</div>
      )}

      <div className={`mb-4 grid h-28 place-items-center rounded-xl border border-slate-800/80 bg-gradient-to-br ${product.accent}`}>
        <div className="relative">
          <div className="absolute inset-0 scale-150 rounded-full bg-indigo-500/20 blur-2xl" />
          <Laptop className="relative text-slate-200 transition-transform duration-300 group-hover:scale-105" size={62} strokeWidth={1.15} />
          <div className="absolute left-1/2 top-[31px] h-5 w-10 -translate-x-1/2 rounded-sm bg-gradient-to-br from-indigo-400/30 to-violet-500/10" />
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="mono-label text-slate-500">{product.brand}</span>
        <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-mono text-[9px] font-semibold text-emerald-400">
          <Star size={10} fill="currentColor" /> {product.match}% match
        </span>
      </div>
      <h3 className="text-[15px] font-semibold text-white">{product.name}</h3>
      <p className="mt-1.5 min-h-10 text-[11px] leading-relaxed text-slate-400">{product.reason}</p>

      <div className="my-4 flex flex-wrap gap-1.5">
        {product.specs.map((spec) => <span key={spec} className="rounded-md border border-slate-700/70 bg-slate-800/70 px-2 py-1 font-mono text-[9px] text-slate-300">{spec}</span>)}
      </div>

      <div className="flex items-end justify-between border-t border-slate-800 pt-3">
        <div>
          <p className="font-mono text-[9px] text-slate-500 line-through">{money(product.originalPrice)}</p>
          <p className="mt-0.5 text-lg font-bold tracking-tight text-white">{money(product.price)}</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onBuy(product)}
          className="focus-ring flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-2.5 text-[11px] font-semibold text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {disabled ? 'Unavailable' : 'Approve & buy'}
          {!disabled && <ArrowUpRight size={13} />}
        </button>
      </div>
      {!disabled && <p className="mt-3 flex items-center gap-1.5 font-mono text-[9px] text-slate-500"><ShieldCheck size={11} className="text-emerald-400" /> Approval required before payment</p>}
    </article>
  )
}
