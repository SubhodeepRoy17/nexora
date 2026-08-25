import { useEffect, useMemo, useState } from 'react'
import { Braces, Check, Plus, Sparkles, X } from 'lucide-react'
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap'

const emptyForm = {
  name: '', description: '', category: '', price: '', stock: '', layout: '', switches: '', keycaps: '', wireless: '', battery: '', hotSwappable: false,
}

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500'

export default function AddProductModal({ open, product, onClose, onSave }) {
  const [form, setForm] = useState(emptyForm)
  const dialogRef = useDialogFocusTrap(open, onClose)

  useEffect(() => {
    if (!open) return
    setForm(product ? {
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      stock: product.stock,
      layout: product.specs.layout ?? '',
      switches: product.specs.switches ?? '',
      keycaps: product.specs.keycaps ?? '',
      wireless: product.specs.wireless ?? '',
      battery: product.specs.battery_life ?? '',
      hotSwappable: Boolean(product.specs.hot_swappable),
    } : emptyForm)
  }, [open, product])

  const metadata = useMemo(() => {
    const tags = [
      form.wireless && 'wireless',
      form.hotSwappable && 'hot-swap',
      form.switches.toLowerCase().includes('brown') && 'tactile',
      form.switches.toLowerCase().includes('red') && 'linear',
      form.layout.includes('75') && '75-percent',
      form.category.toLowerCase().replaceAll(' ', '-'),
    ].filter(Boolean)

    return {
      schema_version: 'catalog.product.v1',
      search_tags: [...new Set(tags)],
      specs: {
        layout: form.layout,
        switches: form.switches,
        hot_swappable: form.hotSwappable,
        keycaps: form.keycaps,
        wireless: form.wireless,
        battery_life: form.battery,
      },
    }
  }, [form])

  if (!open) return null

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = (event) => {
    event.preventDefault()
    const next = {
      ...product,
      id: product?.id,
      name: form.name,
      description: form.description,
      sku: form.sku,
      category: form.category,
      price: Number(form.price),
      stock: Number(form.stock),
      active: product?.active ?? Number(form.stock) > 0,
      agentViews: product?.agentViews ?? 0,
      conversions: product?.conversions ?? 0,
      tags: metadata.search_tags,
      specs: metadata.specs,
    }
    onSave(next)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/85 backdrop-blur-md sm:place-items-center sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="product-modal-title" onSubmit={submit} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-w-3xl sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-800 bg-slate-900/95 p-5 backdrop-blur-xl sm:p-6">
          <div><p className="mono-label text-indigo-400">Structured catalog</p><h2 id="product-modal-title" className="mt-2 text-lg font-semibold text-white">{product ? 'Edit product' : 'Add a new product'}</h2><p className="mt-1 text-xs text-slate-500">Metadata updates automatically as specifications change.</p></div>
          <button type="button" onClick={onClose} aria-label="Close product form" className="rounded-full border border-slate-700 p-2 text-slate-400 hover:text-white"><X size={16} /></button>
        </header>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_.8fr]">
          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-[10px] font-medium text-slate-400 sm:col-span-2">Product name<input required value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Keychron K2 Pro" className={inputClass} /></label>
              <label className="text-[10px] font-medium text-slate-400 sm:col-span-2">Description<textarea required value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Catalog-grounded product description" rows="3" className={inputClass} /></label>
              <label className="text-[10px] font-medium text-slate-400">Category<input required value={form.category} onChange={(event) => update('category', event.target.value)} placeholder="Mechanical Keyboard" className={inputClass} /></label>
              <label className="text-[10px] font-medium text-slate-400">Price (₹)<input required min="1" type="number" value={form.price} onChange={(event) => update('price', event.target.value)} className={inputClass} /></label>
              <label className="text-[10px] font-medium text-slate-400">Stock quantity<input required min="0" type="number" value={form.stock} onChange={(event) => update('stock', event.target.value)} className={inputClass} /></label>
              <label className="text-[10px] font-medium text-slate-400">Layout<input value={form.layout} onChange={(event) => update('layout', event.target.value)} placeholder="75% · 84 keys" className={inputClass} /></label>
              <label className="text-[10px] font-medium text-slate-400 sm:col-span-2">Switches<input value={form.switches} onChange={(event) => update('switches', event.target.value)} placeholder="Gateron Brown Tactile (if applicable)" className={inputClass} /></label>
              <label className="text-[10px] font-medium text-slate-400">Keycaps<input value={form.keycaps} onChange={(event) => update('keycaps', event.target.value)} className={inputClass} /></label>
              <label className="text-[10px] font-medium text-slate-400">Battery life<input value={form.battery} onChange={(event) => update('battery', event.target.value)} placeholder="Up to 100 hours" className={inputClass} /></label>
              <label className="text-[10px] font-medium text-slate-400 sm:col-span-2">Connectivity<input value={form.wireless} onChange={(event) => update('wireless', event.target.value)} className={inputClass} /></label>
            </div>
            <label className="mt-4 flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/60 p-3"><span><span className="block text-xs font-medium text-slate-200">Hot-swappable sockets</span><span className="mt-0.5 block text-[9px] text-slate-500">Allows agents to match switch customization intents.</span></span><button type="button" role="switch" aria-checked={form.hotSwappable} onClick={() => update('hotSwappable', !form.hotSwappable)} className={`relative h-6 w-11 rounded-full transition ${form.hotSwappable ? 'bg-emerald-500' : 'bg-slate-700'}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition ${form.hotSwappable ? 'left-6' : 'left-1'}`} /></button></label>
          </div>

          <aside className="rounded-2xl border border-indigo-500/20 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Braces size={15} className="text-indigo-400" /><p className="font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-300">Generated metadata preview</p></div><span className="flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-1 font-mono text-[7px] text-violet-300"><Sparkles size={8} /> DETERMINISTIC PREVIEW</span></div>
            <div className="mt-4 flex flex-wrap gap-1.5">{metadata.search_tags.map((tag) => <span key={tag} className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 font-mono text-[8px] text-indigo-300">#{tag}</span>)}</div>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[9px] leading-5 text-slate-400">{JSON.stringify(metadata, null, 2)}</pre>
            <p className="mt-3 text-[9px] leading-relaxed text-slate-600">This preview mirrors the structured payload an AI buyer can query. Django validates the submitted catalog schema before saving.</p>
          </aside>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-800 bg-slate-900/95 p-4 backdrop-blur-xl sm:px-6"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs text-slate-400 hover:text-white">Cancel</button><button type="submit" className="focus-ring flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-glow hover:bg-indigo-400">{product ? <Check size={14} /> : <Plus size={14} />}{product ? 'Save changes' : 'Add product'}</button></footer>
      </form>
    </div>
  )
}
