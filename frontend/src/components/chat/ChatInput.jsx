import { ArrowUp, Command, SlidersHorizontal, Sparkles } from 'lucide-react'

export default function ChatInput({ value, onChange, onSubmit, presets, disabled = false }) {
  const submit = (event) => {
    event.preventDefault()
    onSubmit(value)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Preset shopping queries">
        <span className="hidden shrink-0 items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-slate-600 md:flex"><Sparkles size={10} /> Try</span>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            onClick={() => onSubmit(preset.query)}
            className="focus-ring whitespace-nowrap rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-[10px] text-slate-400 transition hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
            title={preset.query}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-xl transition focus-within:border-indigo-500/70 focus-within:shadow-glow">
        <button type="button" aria-label="Search preferences" className="focus-ring mb-0.5 rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"><SlidersHorizontal size={17} /></button>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="Describe a product, budget, and what matters most…"
          className="min-h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-white placeholder:text-slate-600 disabled:cursor-wait"
          aria-label="Shopping intent"
        />
        <button type="submit" disabled={!value.trim() || disabled} aria-label="Send shopping intent" className="focus-ring grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-950 transition hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-600"><ArrowUp size={17} /></button>
      </form>
      <p className="mt-2 hidden text-center font-mono text-[8px] text-slate-700 sm:block"><Command size={9} className="mr-1 inline" /> Live merchant catalog · no purchase occurs without your approval</p>
    </div>
  )
}
