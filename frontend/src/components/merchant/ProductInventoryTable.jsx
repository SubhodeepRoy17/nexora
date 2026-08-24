import { useMemo, useState } from 'react'
import { Braces, Check, ChevronDown, Edit3, Package, Pencil, Plus, Search, X } from 'lucide-react'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

function SpecViewer({ product, onClose }) {
  if (!product) return null
  const payload = { sku: product.sku, category: product.category, tags: product.tags, specs: product.specs }
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/85 backdrop-blur-md sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="spec-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-w-xl sm:rounded-3xl">
        <header className="flex items-start justify-between border-b border-slate-800 p-5"><div><p className="mono-label text-indigo-400">Agent-readable payload</p><h2 id="spec-title" className="mt-2 text-base font-semibold text-white">{product.name}</h2><p className="mt-1 font-mono text-[9px] text-slate-500">{product.sku} · catalog.product.v1</p></div><button type="button" onClick={onClose} className="rounded-full border border-slate-700 p-2 text-slate-400 hover:text-white"><X size={15} /></button></header>
        <div className="p-5">
          <div className="mb-4 grid gap-2 sm:grid-cols-2">{Object.entries(product.specs).map(([key, value]) => <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="font-mono text-[8px] uppercase tracking-wider text-slate-600">{key.replaceAll('_', ' ')}</p><p className="mt-1.5 font-mono text-[10px] text-slate-200">{String(value)}</p></div>)}</div>
          <div className="flex items-center gap-2"><Braces size={14} className="text-indigo-400" /><p className="font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-400">Raw JSON</p></div>
          <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-[9px] leading-5 text-emerald-300/80">{JSON.stringify(payload, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}

export default function ProductInventoryTable({ products, onToggleActive, onToggleStock, onUpdatePrice, onAdd, onEdit }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [editingPriceId, setEditingPriceId] = useState(null)
  const [draftPrice, setDraftPrice] = useState('')
  const [specProduct, setSpecProduct] = useState(null)

  const filtered = useMemo(() => products.filter((product) => {
    const matchesQuery = `${product.name} ${product.sku} ${product.category} ${product.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'all' || (status === 'active' ? product.active : !product.active)
    return matchesQuery && matchesStatus
  }), [products, query, status])

  const beginPriceEdit = (product) => {
    setEditingPriceId(product.id)
    setDraftPrice(String(product.price))
  }

  const savePrice = (product) => {
    const price = Number(draftPrice)
    if (price > 0) onUpdatePrice(product.id, price)
    setEditingPriceId(null)
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl shadow-slate-950/20">
        <header className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex items-center gap-2"><Package size={16} className="text-indigo-400" /><h2 className="text-sm font-semibold text-white">Structured product inventory</h2></div><p className="mt-1 text-[10px] text-slate-500">Manage the catalog exposed to autonomous buyer agents.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SKU, product, or tag" className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-[10px] text-white placeholder:text-slate-600 focus:border-indigo-500 sm:w-56" /></div>
            <div className="relative"><select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-3 pr-8 text-[10px] text-slate-300 focus:border-indigo-500"><option value="all">All products</option><option value="active">Agent-visible</option><option value="inactive">Hidden</option></select><ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" /></div>
            <button type="button" onClick={onAdd} className="focus-ring flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-3.5 py-2.5 text-[10px] font-semibold text-white shadow-glow hover:bg-indigo-400"><Plus size={14} /> Add product</button>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead><tr className="border-b border-slate-800 bg-slate-950/50 font-mono text-[8px] uppercase tracking-wider text-slate-600"><th className="px-5 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Price</th><th className="px-4 py-3 font-medium">Stock</th><th className="px-4 py-3 font-medium">Agent visible</th><th className="px-4 py-3 font-medium">Performance</th><th className="px-4 py-3 font-medium">Structured specs</th><th className="px-4 py-3" /></tr></thead>
            <tbody>{filtered.map((product) => (
              <tr key={product.id} className="border-b border-slate-800/80 text-[11px] transition last:border-0 hover:bg-slate-800/35">
                <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl border border-slate-700 bg-slate-950 text-slate-500"><Package size={16} /></div><div><p className="font-semibold text-slate-100">{product.name}</p><p className="mt-1 font-mono text-[8px] text-slate-600">{product.sku} · {product.category}</p><div className="mt-1.5 flex gap-1">{product.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[7px] text-indigo-300">#{tag}</span>)}</div></div></div></td>
                <td className="px-4 py-4">{editingPriceId === product.id ? <div className="flex items-center gap-1"><span className="text-slate-500">₹</span><input autoFocus type="number" min="1" value={draftPrice} onChange={(event) => setDraftPrice(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && savePrice(product)} className="w-20 rounded-lg border border-indigo-500 bg-slate-950 px-2 py-1.5 font-mono text-[10px] text-white" /><button type="button" onClick={() => savePrice(product)} className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-400"><Check size={12} /></button></div> : <button type="button" onClick={() => beginPriceEdit(product)} className="group flex items-center gap-1.5 font-semibold text-slate-200">{money(product.price)}<Pencil size={10} className="text-slate-600 group-hover:text-indigo-400" /></button>}</td>
                <td className="px-4 py-4"><button type="button" role="switch" aria-checked={product.stock > 0} onClick={() => onToggleStock(product.id)} title="Toggle stock availability" className={`rounded-full border px-2 py-1 font-mono text-[8px] transition ${product.stock === 0 ? 'border-[#DC143C]/25 bg-[#DC143C]/10 text-[#ff607f]' : product.stock < 8 ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'}`}>{product.stock === 0 ? 'OUT OF STOCK' : `${product.stock} IN STOCK`}</button><p className="mt-1.5 text-[8px] text-slate-600">Click to {product.stock === 0 ? 'restore 10 units' : 'mark unavailable'}</p></td>
                <td className="px-4 py-4"><button type="button" role="switch" aria-label={`${product.active ? 'Hide' : 'Show'} ${product.name} to agents`} aria-checked={product.active} onClick={() => onToggleActive(product.id)} className={`relative h-6 w-11 rounded-full transition ${product.active ? 'bg-emerald-500' : 'bg-slate-700'}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow transition ${product.active ? 'left-6' : 'left-1'}`} /></button><p className={`mt-1 font-mono text-[7px] ${product.active ? 'text-emerald-400' : 'text-slate-600'}`}>{product.active ? 'INDEXED' : 'HIDDEN'}</p></td>
                <td className="px-4 py-4"><p className="font-mono text-[9px] text-slate-300">{product.agentViews.toLocaleString()} views</p><p className="mt-1 font-mono text-[8px] text-emerald-400">{product.conversions} conversions</p></td>
                <td className="px-4 py-4"><button type="button" onClick={() => setSpecProduct(product)} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-[8px] text-indigo-300 transition hover:border-indigo-500/50"><Braces size={12} /> View JSON</button></td>
                <td className="px-4 py-4"><button type="button" onClick={() => onEdit(product)} aria-label={`Edit ${product.name}`} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-700 hover:text-white"><Edit3 size={14} /></button></td>
              </tr>
            ))}</tbody>
          </table>
          {!filtered.length && <div className="grid h-44 place-items-center text-xs text-slate-600">No products match this view.</div>}
        </div>
        <footer className="flex items-center justify-between border-t border-slate-800 px-5 py-3"><p className="font-mono text-[8px] text-slate-600">{filtered.length} OF {products.length} PRODUCTS · OWNER-SCOPED API</p><p className="text-[9px] text-slate-500"><span className="text-emerald-400">{products.filter((product) => product.active).length}</span> visible to agents</p></footer>
      </section>
      <SpecViewer product={specProduct} onClose={() => setSpecProduct(null)} />
    </>
  )
}
