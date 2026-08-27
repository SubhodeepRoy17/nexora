import { useMemo, useState } from 'react'
import { Check, ChevronDown, Edit3, Package, Pencil, Plus, Search, X } from 'lucide-react'
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap'

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)

function SpecViewer({ product, onClose }) {
  const dialogRef = useDialogFocusTrap(Boolean(product), onClose)
  if (!product) return null
  return (
    <div className="fixed inset-x-0 bottom-0 top-20 z-50 grid place-items-end bg-[#17372f]/70 backdrop-blur-md sm:place-items-center sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="spec-title" className="modal-scroll max-h-full w-full overflow-y-auto rounded-t-3xl border border-white/80 bg-[#f8faf6] shadow-2xl sm:max-w-xl sm:rounded-3xl">
        <header className="flex items-start justify-between border-b border-emerald-950/10 p-5">
          <div>
            <h2 id="spec-title" className="text-xl font-semibold text-[#17372f]">
              {product.name}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {product.sku} · {product.category}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-emerald-950/10 bg-white p-2 text-slate-500 hover:text-violet-700">
            <X size={15} />
          </button>
        </header>
        <div className="p-5">
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {Object.entries(product.specs).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-emerald-950/10 bg-white p-3">
                <p className="text-xs capitalize text-slate-500">{key.replaceAll('_', ' ')}</p>
                <p className="mt-1.5 text-sm text-[#17372f]">{String(value)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-emerald-950/10 bg-white p-4">
            <p className="text-sm text-[#31594f]">
              <span className="text-slate-500">Search words:</span> {product.tags.length ? product.tags.join(', ') : 'None added'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProductInventoryTable({ products, onToggleActive, onUpdatePrice, onAdd, onEdit }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [editingPriceId, setEditingPriceId] = useState(null)
  const [draftPrice, setDraftPrice] = useState('')
  const [specProduct, setSpecProduct] = useState(null)

  const filtered = useMemo(
    () =>
      products.filter((product) => {
        const matchesQuery = `${product.name} ${product.sku} ${product.category} ${product.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())
        const matchesStatus = status === 'all' || (status === 'active' ? product.active : !product.active)
        return matchesQuery && matchesStatus
      }),
    [products, query, status],
  )

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
      <section className="merchant-card merchant-reveal overflow-hidden rounded-2xl border border-emerald-950/10 bg-white/82 shadow-[0_14px_42px_rgba(42,81,68,.08)] backdrop-blur">
        <header className="flex flex-col gap-4 border-b border-emerald-950/10 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-violet-100 text-violet-700"><Package size={16} /></span>
              <h2 className="text-base font-semibold text-[#17372f]">Product inventory</h2>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" className="w-full rounded-xl border border-emerald-950/10 bg-[#f7faf5] py-2.5 pl-9 pr-3 text-xs text-[#17372f] placeholder:text-slate-400 focus:border-violet-300 sm:w-56" />
            </div>
            <div className="relative">
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full appearance-none rounded-xl border border-emerald-950/10 bg-[#f7faf5] py-2.5 pl-3 pr-8 text-xs text-[#31594f] focus:border-violet-300">
                <option value="all">All products</option>
                <option value="active">Visible to shoppers</option>
                <option value="inactive">Hidden</option>
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
            <button type="button" onClick={onAdd} className="focus-ring flex items-center justify-center gap-2 rounded-xl bg-[#17372f] px-3.5 py-2.5 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(23,55,47,.16)] transition hover:bg-violet-700">
              <Plus size={14} /> Add product
            </button>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="inventory-table-head border-b border-emerald-950/10 bg-[#eef4ed] text-xs text-[#31594f]">
                <th className="px-5 py-3.5 font-semibold">Product</th>
                <th className="px-4 py-3.5 font-semibold">Price</th>
                <th className="px-4 py-3.5 font-semibold">Stock</th>
                <th className="px-4 py-3.5 font-semibold">Visible to shoppers</th>
                <th className="px-4 py-3.5 font-semibold">Performance</th>
                <th className="px-4 py-3.5 font-semibold">Product details</th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id} className="border-b border-slate-200 bg-white text-xs transition even:bg-slate-50 last:border-0 hover:bg-violet-50">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-xl border border-emerald-950/10 bg-[#f2f6ee] text-violet-700">
                        <Package size={16} />
                      </div>
                      <div>
                        <p className="font-semibold text-[#17372f]">{product.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {product.sku} · {product.category}
                        </p>
                        <div className="mt-1.5 flex gap-1">
                          {product.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {editingPriceId === product.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">₹</span>
                        <input autoFocus type="number" min="1" value={draftPrice} onChange={(event) => setDraftPrice(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && savePrice(product)} className="w-20 rounded-lg border border-violet-400 bg-white px-2 py-1.5 text-xs text-[#17372f]" />
                        <button type="button" onClick={() => savePrice(product)} className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-400">
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => beginPriceEdit(product)} className="group flex items-center gap-1.5 font-semibold text-[#17372f]">
                        {money(product.price)}
                        <Pencil size={10} className="text-slate-600 group-hover:text-indigo-400" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-block rounded-full border px-2 py-1 text-xs ${product.stock === 0 ? 'border-rose-200 bg-rose-50 text-rose-700' : product.stock < 8 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{product.stock === 0 ? 'Out of stock' : `${product.stock} in stock`}</span>
                  </td>
                  <td className="px-4 py-4">
                    <button type="button" role="switch" aria-label={`${product.active ? 'Hide' : 'Show'} ${product.name} to shoppers`} aria-checked={product.active} onClick={() => onToggleActive(product.id)} className={`relative h-6 w-11 rounded-full transition ${product.active ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                      <span className={`absolute top-1 size-4 rounded-full bg-white shadow transition ${product.active ? 'left-6' : 'left-1'}`} />
                    </button>
                    <p className={`mt-1 text-xs ${product.active ? 'text-emerald-700' : 'text-slate-500'}`}>{product.active ? 'Visible' : 'Hidden'}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-xs text-slate-600">{product.agentViews.toLocaleString()} views</p>
                    <p className="mt-1 text-xs text-emerald-700">{product.conversions} purchases</p>
                  </td>
                  <td className="px-4 py-4">
                    <button type="button" onClick={() => setSpecProduct(product)} className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-xs text-violet-700 transition hover:border-violet-400">
                      <Package size={12} /> View details
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <button type="button" onClick={() => onEdit(product)} aria-label={`Edit ${product.name}`} className="rounded-lg p-2 text-slate-500 transition hover:bg-violet-50 hover:text-violet-700">
                      <Edit3 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <div className="grid h-44 place-items-center text-sm text-slate-500">No products match this view.</div>}
        </div>
        <footer className="flex items-center justify-between border-t border-emerald-950/10 px-5 py-3">
          <p className="text-xs text-slate-500">
            {filtered.length} of {products.length} products
          </p>
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-emerald-700">{products.filter((product) => product.active).length}</span> visible to shoppers
          </p>
        </footer>
      </section>
      <SpecViewer product={specProduct} onClose={() => setSpecProduct(null)} />
    </>
  )
}
