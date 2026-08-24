import { Bot, Store } from 'lucide-react'

export default function ViewSwitcher({ view, onChange, light = false }) {
  const options = [
    { id: 'buyer', label: 'Buyer', icon: Bot },
    { id: 'merchant', label: 'Merchant', icon: Store },
  ]

  return (
    <div className={`flex rounded-xl border p-1 ${light ? 'border-slate-200 bg-slate-100' : 'border-slate-800 bg-slate-900/80'}`}>
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`focus-ring flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
            view === id
              ? light ? 'bg-white text-indigo-600 shadow-sm' : 'bg-slate-800 text-white shadow-sm'
              : light ? 'text-slate-500 hover:text-slate-900' : 'text-slate-500 hover:text-slate-200'
          }`}
          aria-pressed={view === id}
        >
          <Icon size={14} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
