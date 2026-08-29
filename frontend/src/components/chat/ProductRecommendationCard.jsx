import { ArrowUpRight, Star } from 'lucide-react'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

export default function ProductRecommendationCard({ product, featured = false, onApprove, className = '' }) {
  const keySpecs = [
    product.specs.color,
    product.specs.material,
    product.specs.wireless !== 'See connectivity details' ? product.specs.wireless : null,
    product.specs.switches !== 'Not specified' ? product.specs.switches : null,
  ].filter(Boolean).slice(0, 3)
  const discount = product.originalPrice > product.price
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : 0

  return (
    <article className={`group relative flex min-w-[300px] snap-start flex-col overflow-hidden rounded-[1.5rem] border bg-white/88 shadow-[0_14px_36px_rgba(42,81,68,.08)] transition duration-300 hover:-translate-y-1 hover:border-violet-400 hover:shadow-[0_20px_45px_rgba(42,81,68,.13)] md:min-w-0 ${featured ? 'border-violet-300 ring-2 ring-violet-100' : 'border-emerald-950/10'} ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-violet-600 opacity-0 transition group-hover:opacity-100" />
      {featured && <span className="absolute right-3 top-3 z-10 rounded-full bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">Best match</span>}

      <div className="product-grid relative h-44 overflow-hidden border-b border-emerald-950/10 bg-[#f2f6ee]">
        <div className="absolute -left-8 -top-10 size-32 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -bottom-16 right-0 size-36 rounded-full bg-emerald-500/15 blur-3xl" />
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-contain p-5 transition duration-500 group-hover:scale-105" /> : <div className="absolute inset-0 grid place-items-center">
          <div className="relative h-[62px] w-[155px] rotate-[-3deg] border border-slate-700 bg-slate-900 p-2 shadow-2xl transition duration-300 group-hover:rotate-0 group-hover:scale-105">
            <div className="grid h-full grid-cols-12 gap-1">
              {Array.from({ length: 48 }, (_, index) => <span key={index} className={`rounded-[2px] border border-slate-600/60 ${index === 35 ? 'col-span-5 bg-indigo-500/70' : 'bg-slate-700'}`} />)}
            </div>
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-violet-700">{product.imageLabel}</span>
          </div>
        </div>}
        {discount > 0 && <span className="absolute bottom-3 left-3 rounded-full bg-emerald-700 px-2.5 py-1 text-[10px] font-bold text-white">{discount}% off</span>}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-emerald-700">{product.merchant.name}</span>
          <span title="Based on your request and the product details" className="flex shrink-0 items-center gap-1 font-semibold text-violet-700"><Star size={12} fill="currentColor" /> {product.matchScore}% match</span>
        </div>

        <h3 className="mt-3 text-base font-semibold tracking-tight text-slate-950">{product.name}</h3>
        <p className="mt-1.5 min-h-[42px] text-xs leading-relaxed text-slate-600">{product.reason}</p>

        {keySpecs.length > 0 && <p className="my-4 truncate text-xs text-slate-500" title={keySpecs.join(' · ')}>{keySpecs.join(' · ')}</p>}

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-slate-200 pt-4">
          <div>{product.originalPrice > product.price && <p className="text-xs text-slate-400 line-through">{money(product.originalPrice)}</p>}<p className="mt-0.5 text-lg font-bold tracking-tight text-slate-950">{money(product.price)}</p><p className="mt-1 text-xs text-emerald-700">{product.stock}</p></div>
          <button type="button" onClick={() => onApprove(product)} className="focus-ring flex items-center gap-1.5 rounded-full border border-[#17372f] bg-[#17372f] px-3 py-2.5 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(23,55,47,.18)] transition hover:-translate-y-0.5 hover:border-violet-700 hover:bg-violet-700">Approve & Buy <ArrowUpRight size={13} /></button>
        </div>
        {product.addOns?.length > 0 && <p className="mt-3 border border-violet-200 bg-violet-50 px-2.5 py-2 text-xs text-violet-700">{product.addOns.length} optional add-on{product.addOns.length === 1 ? '' : 's'} available</p>}
      </div>
    </article>
  )
}
