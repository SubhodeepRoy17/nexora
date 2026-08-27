import { useMemo, useState } from 'react'
import { Link2, Plus, Trash2 } from 'lucide-react'

const emptyForm = {
  source_product: '',
  related_product: '',
  relationship_type: 'COMPLEMENT',
  benefit: '',
  trade_off: '',
  offer_label: '',
}

export default function ProductRelationshipManager({ products, relationships, onCreate, onToggle, onDelete }) {
  const [form, setForm] = useState(emptyForm)
  const activeProducts = useMemo(() => products.filter((product) => product.active && product.stock > 0), [products])
  const ready = form.source_product && form.related_product && form.source_product !== form.related_product && form.benefit.trim()

  const submit = async (event) => {
    event.preventDefault()
    if (!ready) return
    const saved = await onCreate({
      ...form,
      source_product: Number(form.source_product),
      related_product: Number(form.related_product),
      compatibility: {},
      priority: 100,
      is_active: true,
    })
    if (saved) setForm(emptyForm)
  }

  return (
    <section className="merchant-card merchant-reveal mt-5 rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.07)] backdrop-blur">
      <header>
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-violet-100 text-violet-700"><Link2 size={16} /></span>
          <h2 className="text-base font-semibold text-[#17372f]">Product pairings and offers</h2>
        </div>
        <p className="mt-2 text-sm text-[#31594f]/65">Choose optional products that genuinely work well together.</p>
      </header>
      <form onSubmit={submit} className="mt-4 grid gap-2 lg:grid-cols-3">
        <select
          aria-label="Primary product"
          value={form.source_product}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              source_product: event.target.value,
            }))
          }
          className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] px-3 py-2.5 text-xs text-[#31594f]"
        >
          <option value="">Primary product</option>
          {activeProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Related product"
          value={form.related_product}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              related_product: event.target.value,
            }))
          }
          className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] px-3 py-2.5 text-xs text-[#31594f]"
        >
          <option value="">Related in-stock product</option>
          {activeProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Relationship type"
          value={form.relationship_type}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              relationship_type: event.target.value,
            }))
          }
          className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] px-3 py-2.5 text-xs text-[#31594f]"
        >
          <option value="ACCESSORY">Accessory</option>
          <option value="COMPLEMENT">Complement</option>
          <option value="SUBSTITUTE">Substitute</option>
          <option value="BUNDLE">Bundle component</option>
        </select>
        <input required value={form.benefit} onChange={(event) => setForm((current) => ({ ...current, benefit: event.target.value }))} placeholder="Why it helps the shopper" className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] px-3 py-2.5 text-xs text-[#17372f]" />
        <input
          value={form.trade_off}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              trade_off: event.target.value,
            }))
          }
          placeholder="Honest trade-off (optional)"
          className="rounded-xl border border-emerald-950/10 bg-[#f7faf5] px-3 py-2.5 text-xs text-[#17372f]"
        />
        <div className="flex gap-2">
          <input
            value={form.offer_label}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                offer_label: event.target.value,
              }))
            }
            placeholder="Offer label"
            className="min-w-0 flex-1 rounded-xl border border-emerald-950/10 bg-[#f7faf5] px-3 py-2.5 text-xs text-[#17372f]"
          />
          <button type="submit" disabled={!ready} className="rounded-xl bg-[#17372f] px-3 text-white transition hover:bg-violet-700 disabled:opacity-40" aria-label="Add product pairing">
            <Plus size={14} />
          </button>
        </div>
      </form>
      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {relationships.map((item) => (
          <article key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-950/10 bg-[#f7faf5] p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#17372f]">
                {item.source_title} → {item.related_title}
              </p>
              <p className="mt-1 text-xs text-violet-700">
                {item.relationship_type.toLowerCase()} · +₹
                {Number(item.incremental_cost).toLocaleString('en-IN')}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">{item.benefit}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => onToggle(item)} className={`rounded-lg border px-2 py-1.5 text-xs ${item.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
                {item.is_active ? 'Active' : 'Paused'}
              </button>
              <button type="button" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.source_title} relationship`} className="rounded-lg border border-rose-500/20 p-1.5 text-rose-400">
                <Trash2 size={12} />
              </button>
            </div>
          </article>
        ))}
        {relationships.length === 0 && <p className="rounded-xl border border-dashed border-emerald-950/15 bg-[#f7faf5] p-4 text-sm text-slate-500">No product pairings yet. No optional offers will be shown.</p>}
      </div>
    </section>
  )
}
