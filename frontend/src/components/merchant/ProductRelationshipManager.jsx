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
    await onCreate({
      ...form,
      source_product: Number(form.source_product),
      related_product: Number(form.related_product),
      compatibility: {},
      priority: 100,
      is_active: true,
    })
    setForm(emptyForm)
  }

  return (
    <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <header><div className="flex items-center gap-2"><Link2 size={16} className="text-indigo-400" /><h2 className="text-sm font-semibold text-white">Compatibility & offers</h2></div><p className="mt-1 text-[10px] text-slate-500">Deterministic links used for optional add-ons. Prices always come from the live product catalog.</p></header>
      <form onSubmit={submit} className="mt-4 grid gap-2 lg:grid-cols-3">
        <select aria-label="Primary product" value={form.source_product} onChange={(event) => setForm((current) => ({ ...current, source_product: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-[10px] text-slate-300"><option value="">Primary product</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
        <select aria-label="Related product" value={form.related_product} onChange={(event) => setForm((current) => ({ ...current, related_product: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-[10px] text-slate-300"><option value="">Related in-stock product</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
        <select aria-label="Relationship type" value={form.relationship_type} onChange={(event) => setForm((current) => ({ ...current, relationship_type: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-[10px] text-slate-300"><option value="ACCESSORY">Accessory</option><option value="COMPLEMENT">Complement</option><option value="SUBSTITUTE">Substitute</option><option value="BUNDLE">Bundle component</option></select>
        <input required value={form.benefit} onChange={(event) => setForm((current) => ({ ...current, benefit: event.target.value }))} placeholder="Catalog-grounded benefit" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-[10px] text-white" />
        <input value={form.trade_off} onChange={(event) => setForm((current) => ({ ...current, trade_off: event.target.value }))} placeholder="Honest trade-off (optional)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-[10px] text-white" />
        <div className="flex gap-2"><input value={form.offer_label} onChange={(event) => setForm((current) => ({ ...current, offer_label: event.target.value }))} placeholder="Offer label (no savings claim)" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-[10px] text-white" /><button type="submit" disabled={!ready} className="rounded-xl bg-indigo-500 px-3 text-white disabled:opacity-40" aria-label="Create relationship"><Plus size={14} /></button></div>
      </form>
      <div className="mt-4 grid gap-2 lg:grid-cols-2">{relationships.map((item) => <article key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-white">{item.source_title} → {item.related_title}</p><p className="mt-1 font-mono text-[8px] text-indigo-300">{item.relationship_type} · +₹{Number(item.incremental_cost).toLocaleString('en-IN')}</p><p className="mt-1 truncate text-[9px] text-slate-500">{item.benefit}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => onToggle(item)} className={`rounded-lg border px-2 py-1.5 font-mono text-[8px] ${item.is_active ? 'border-emerald-500/30 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>{item.is_active ? 'ACTIVE' : 'PAUSED'}</button><button type="button" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.source_title} relationship`} className="rounded-lg border border-rose-500/20 p-1.5 text-rose-400"><Trash2 size={12} /></button></div></article>)}{relationships.length === 0 && <p className="rounded-xl border border-slate-800 p-4 text-[10px] text-slate-500">No compatibility relationships yet. The agent will correctly make no add-on offer.</p>}</div>
    </section>
  )
}
