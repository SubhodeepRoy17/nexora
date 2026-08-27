import { ArrowUpRight, BatteryCharging, Bluetooth, CheckCircle2, Keyboard, Radio, ShieldCheck, Star, Wrench } from 'lucide-react'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

const specIcons = {
  wireless: Radio,
  hotSwappable: Wrench,
  switches: Keyboard,
  battery: BatteryCharging,
}

export default function ProductRecommendationCard({ product, featured = false, onApprove }) {
  const primarySpecs = ['wireless', 'hotSwappable', 'switches', 'battery']

  return (
    <article className={`group relative min-w-[300px] snap-start overflow-hidden rounded-[1.5rem] border bg-white/88 shadow-[0_14px_36px_rgba(42,81,68,.08)] transition duration-300 hover:-translate-y-1 hover:border-violet-400 hover:shadow-[0_20px_45px_rgba(42,81,68,.13)] md:min-w-0 ${featured ? 'border-violet-300 ring-2 ring-violet-100' : 'border-emerald-950/10'}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-violet-600 opacity-0 transition group-hover:opacity-100" />
      {featured && <span className="absolute right-3 top-3 z-10 rounded-full border border-violet-600 bg-violet-600 px-2.5 py-1 font-mono text-[8px] font-semibold uppercase tracking-wider text-white shadow-sm">Best match</span>}

      <div className="product-grid relative h-32 overflow-hidden border-b border-emerald-950/10 bg-[#f2f6ee]">
        <div className="absolute -left-8 -top-10 size-32 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -bottom-16 right-0 size-36 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative h-[62px] w-[155px] rotate-[-3deg] border border-slate-700 bg-slate-900 p-2 shadow-2xl transition duration-300 group-hover:rotate-0 group-hover:scale-105">
            <div className="grid h-full grid-cols-12 gap-1">
              {Array.from({ length: 48 }, (_, index) => <span key={index} className={`rounded-[2px] border border-slate-600/60 ${index === 35 ? 'col-span-5 bg-indigo-500/70' : 'bg-slate-700'}`} />)}
            </div>
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-mono text-[8px] font-semibold tracking-[0.2em] text-violet-700">{product.imageLabel}</span>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[8px] text-emerald-700"><CheckCircle2 size={10} /> {product.merchant.name} · Verified</span>
          <span className="flex items-center gap-1 font-mono text-[9px] font-semibold text-violet-700"><Star size={10} fill="currentColor" /> {product.matchScore}% match</span>
        </div>

        <h3 className="mt-3 text-base font-semibold tracking-tight text-slate-950">{product.name}</h3>
        <p className="mt-1.5 min-h-[42px] text-[11px] leading-relaxed text-slate-600">{product.reason}</p>

        <div className="my-4 grid grid-cols-2 gap-1.5">
          {primarySpecs.map((key) => {
            const Icon = specIcons[key]
            const label = key === 'hotSwappable' ? 'Hot-swap' : key.charAt(0).toUpperCase() + key.slice(1)
            return (
              <div key={key} className="min-w-0 rounded-xl border border-emerald-950/10 bg-[#f5f7f1] p-2">
                <p className="flex items-center gap-1 font-mono text-[7px] uppercase tracking-wider text-slate-400"><Icon size={9} /> {label}</p>
                <p className="mt-1 truncate font-mono text-[9px] text-slate-700" title={product.specs[key]}>{product.specs[key]}</p>
              </div>
            )
          })}
        </div>

        <div className="flex items-end justify-between border-t border-slate-200 pt-3">
          <div>{product.originalPrice > product.price && <p className="font-mono text-[9px] text-slate-400 line-through">{money(product.originalPrice)}</p>}<p className="mt-0.5 text-lg font-bold tracking-tight text-slate-950">{money(product.price)}</p><p className="mt-1 font-mono text-[8px] text-emerald-700">{product.stock}</p></div>
          <button type="button" disabled={product.historical} onClick={() => onApprove(product)} className="focus-ring flex items-center gap-1.5 rounded-full border border-[#17372f] bg-[#17372f] px-3 py-2.5 text-[11px] font-semibold text-white shadow-[0_8px_20px_rgba(23,55,47,.18)] transition hover:-translate-y-0.5 hover:border-violet-700 hover:bg-violet-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">{product.historical ? 'Historical result' : 'Approve & Buy'} {!product.historical && <ArrowUpRight size={13} />}</button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 font-mono text-[8px] text-slate-600"><Bluetooth size={10} /> {product.specs.layout} · {product.specs.keycaps}</p>
        {product.addOns?.length > 0 && <p className="mt-2 border border-violet-200 bg-violet-50 px-2.5 py-2 text-[9px] text-violet-700">{product.addOns.length} compatible optional add-on{product.addOns.length === 1 ? '' : 's'} · nothing added automatically</p>}
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[8px] text-slate-500"><ShieldCheck size={10} className="text-emerald-400" /> {product.delivery}</p>
      </div>
    </article>
  )
}
