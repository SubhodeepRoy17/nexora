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
    <article className={`group relative min-w-[300px] snap-start overflow-hidden rounded-2xl border bg-slate-900/95 transition duration-300 hover:-translate-y-1 hover:border-indigo-400/60 hover:shadow-glow md:min-w-0 ${featured ? 'border-indigo-400/50 shadow-glow-strong' : 'border-slate-800'}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/80 to-transparent opacity-0 transition group-hover:opacity-100" />
      {featured && <span className="absolute right-3 top-3 z-10 rounded-full border border-indigo-300/30 bg-indigo-500 px-2.5 py-1 font-mono text-[8px] font-semibold uppercase tracking-wider text-white shadow-glow">Best match</span>}

      <div className="relative h-32 overflow-hidden border-b border-slate-800 bg-gradient-to-br from-indigo-500/20 via-violet-500/5 to-slate-950">
        <div className="absolute -left-8 -top-10 size-32 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-16 right-0 size-36 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative h-[62px] w-[155px] rotate-[-3deg] rounded-xl border border-slate-600 bg-slate-800 p-2 shadow-2xl transition duration-300 group-hover:rotate-0 group-hover:scale-105">
            <div className="grid h-full grid-cols-12 gap-1">
              {Array.from({ length: 48 }, (_, index) => <span key={index} className={`rounded-[2px] border border-slate-600/60 ${index === 35 ? 'col-span-5 bg-indigo-500/70' : 'bg-slate-700'}`} />)}
            </div>
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-mono text-[8px] font-semibold tracking-[0.2em] text-indigo-300">{product.imageLabel}</span>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-mono text-[8px] text-emerald-400"><CheckCircle2 size={10} /> {product.merchant.name} · Verified</span>
          <span className="flex items-center gap-1 font-mono text-[9px] font-semibold text-indigo-300"><Star size={10} fill="currentColor" /> {product.matchScore}% match</span>
        </div>

        <h3 className="mt-3 text-base font-semibold tracking-tight text-white">{product.name}</h3>
        <p className="mt-1.5 min-h-[42px] text-[11px] leading-relaxed text-slate-400">{product.reason}</p>

        <div className="my-4 grid grid-cols-2 gap-1.5">
          {primarySpecs.map((key) => {
            const Icon = specIcons[key]
            const label = key === 'hotSwappable' ? 'Hot-swap' : key.charAt(0).toUpperCase() + key.slice(1)
            return (
              <div key={key} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                <p className="flex items-center gap-1 font-mono text-[7px] uppercase tracking-wider text-slate-600"><Icon size={9} /> {label}</p>
                <p className="mt-1 truncate font-mono text-[9px] text-slate-300" title={product.specs[key]}>{product.specs[key]}</p>
              </div>
            )
          })}
        </div>

        <div className="flex items-end justify-between border-t border-slate-800 pt-3">
          <div>{product.originalPrice > product.price && <p className="font-mono text-[9px] text-slate-600 line-through">{money(product.originalPrice)}</p>}<p className="mt-0.5 text-lg font-bold tracking-tight text-white">{money(product.price)}</p><p className="mt-1 font-mono text-[8px] text-emerald-400">{product.stock}</p></div>
          <button type="button" onClick={() => onApprove(product)} className="focus-ring flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-2.5 text-[11px] font-semibold text-white shadow-lg shadow-indigo-950/60 transition hover:bg-indigo-400">Approve & Buy <ArrowUpRight size={13} /></button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 font-mono text-[8px] text-slate-600"><Bluetooth size={10} /> {product.specs.layout} · {product.specs.keycaps}</p>
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[8px] text-slate-500"><ShieldCheck size={10} className="text-emerald-400" /> {product.delivery}</p>
      </div>
    </article>
  )
}
