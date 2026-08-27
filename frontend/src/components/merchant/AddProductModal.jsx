import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap'

const emptyForm = {
  name: '',
  description: '',
  category: '',
  price: '',
  stock: '',
  layout: '',
  switches: '',
  keycaps: '',
  wireless: '',
  battery: '',
  hotSwappable: false,
}

const inputClass = 'mt-1.5 w-full rounded-xl border border-emerald-950/10 bg-white px-3 py-2.5 text-sm text-[#17372f] placeholder:text-slate-400 focus:border-violet-300'

export default function AddProductModal({ open, product, onClose, onSave }) {
  const [form, setForm] = useState(emptyForm)
  const dialogRef = useDialogFocusTrap(open, onClose)

  useEffect(() => {
    if (!open) return
    setForm(
      product
        ? {
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
          }
        : emptyForm,
    )
  }, [open, product])

  const metadata = useMemo(() => {
    const tags = [form.wireless && 'wireless', form.hotSwappable && 'hot-swap', form.switches.toLowerCase().includes('brown') && 'tactile', form.switches.toLowerCase().includes('red') && 'linear', form.layout.includes('75') && '75-percent', form.category.toLowerCase().replaceAll(' ', '-')].filter(Boolean)

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
    <div className="fixed inset-x-0 bottom-0 top-20 z-50 grid place-items-end bg-[#17372f]/70 backdrop-blur-md sm:place-items-center sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="product-modal-title" onSubmit={submit} className="modal-scroll max-h-full w-full overflow-y-auto rounded-t-3xl border border-white/80 bg-[#f8faf6] shadow-2xl sm:max-w-3xl sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-emerald-950/10 bg-[#f8faf6]/95 p-5 backdrop-blur-xl sm:p-6">
          <div>
            <h2 id="product-modal-title" className="text-xl font-semibold text-[#17372f]">
              {product ? 'Edit product' : 'Add a new product'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close product form" className="rounded-full border border-emerald-950/10 bg-white p-2 text-slate-500 hover:text-violet-700">
            <X size={16} />
          </button>
        </header>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_.8fr]">
          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium text-[#31594f] sm:col-span-2">
                Product name
                <input required value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Keychron K2 Pro" className={inputClass} />
              </label>
              <label className="text-xs font-medium text-[#31594f] sm:col-span-2">
                Description
                <textarea required value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Clear product description" rows="3" className={inputClass} />
              </label>
              <label className="text-xs font-medium text-[#31594f]">
                Category
                <input required value={form.category} onChange={(event) => update('category', event.target.value)} placeholder="Mechanical Keyboard" className={inputClass} />
              </label>
              <label className="text-xs font-medium text-[#31594f]">
                Price (₹)
                <input required min="1" type="number" value={form.price} onChange={(event) => update('price', event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-[#31594f]">
                Stock quantity
                <input required min="0" type="number" value={form.stock} onChange={(event) => update('stock', event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-[#31594f]">
                Layout
                <input value={form.layout} onChange={(event) => update('layout', event.target.value)} placeholder="75% · 84 keys" className={inputClass} />
              </label>
              <label className="text-xs font-medium text-[#31594f] sm:col-span-2">
                Switches
                <input value={form.switches} onChange={(event) => update('switches', event.target.value)} placeholder="Gateron Brown Tactile (if applicable)" className={inputClass} />
              </label>
              <label className="text-xs font-medium text-[#31594f]">
                Keycaps
                <input value={form.keycaps} onChange={(event) => update('keycaps', event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-[#31594f]">
                Battery life
                <input value={form.battery} onChange={(event) => update('battery', event.target.value)} placeholder="Up to 100 hours" className={inputClass} />
              </label>
              <label className="text-xs font-medium text-[#31594f] sm:col-span-2">
                Connectivity
                <input value={form.wireless} onChange={(event) => update('wireless', event.target.value)} className={inputClass} />
              </label>
            </div>
            <label className="mt-4 flex items-center justify-between rounded-xl border border-emerald-950/10 bg-white p-3">
              <span>
                <span className="block text-sm font-medium text-[#17372f]">Hot-swappable sockets</span>
                <span className="mt-0.5 block text-xs text-slate-500">For shoppers who want to customize their switches.</span>
              </span>
              <button type="button" role="switch" aria-checked={form.hotSwappable} onClick={() => update('hotSwappable', !form.hotSwappable)} className={`relative h-6 w-11 rounded-full transition ${form.hotSwappable ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                <span className={`absolute top-1 size-4 rounded-full bg-white transition ${form.hotSwappable ? 'left-6' : 'left-1'}`} />
              </button>
            </label>
          </div>

          <aside className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
            <div className="flex items-center gap-2">
              <Search size={15} className="text-violet-700" />
              <p className="text-sm font-semibold text-[#17372f]">Listing preview</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {metadata.search_tags.map((tag) => (
                <span key={tag} className="rounded-md border border-violet-200 bg-white px-2 py-1 text-xs text-violet-700">
                  #{tag}
                </span>
              ))}
            </div>
            <div className="mt-4 space-y-2 rounded-xl border border-violet-100 bg-white p-3 text-xs text-slate-600">
              <p>
                <span className="text-slate-600">Name:</span> {form.name || 'Not added yet'}
              </p>
              <p>
                <span className="text-slate-600">Category:</span> {form.category || 'Not added yet'}
              </p>
              <p>
                <span className="text-slate-600">Price:</span> {form.price ? `₹${Number(form.price).toLocaleString('en-IN')}` : 'Not added yet'}
              </p>
              <p>
                <span className="text-slate-600">Stock:</span> {form.stock || '0'}
              </p>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Complete details make this product easier for shoppers to find.</p>
          </aside>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-emerald-950/10 bg-[#f8faf6]/95 p-4 backdrop-blur-xl sm:px-6">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs text-slate-600 hover:text-violet-700">
            Cancel
          </button>
          <button type="submit" className="focus-ring flex items-center gap-2 rounded-xl bg-[#17372f] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(23,55,47,.16)] transition hover:bg-violet-700">
            {product ? <Check size={14} /> : <Plus size={14} />}
            {product ? 'Save changes' : 'Add product'}
          </button>
        </footer>
      </form>
    </div>
  )
}
