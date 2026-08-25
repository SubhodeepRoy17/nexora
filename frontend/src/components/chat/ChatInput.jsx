import { ArrowUp, Command, Sparkles } from 'lucide-react'

export default function ChatInput({ value, onChange, onSubmit, presets, disabled = false }) {
  const submit = (event) => {
    event.preventDefault()
    onSubmit(value)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Example shopping prompts">
        <span className="hidden shrink-0 items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-slate-400 md:flex"><Sparkles size={10} /> Examples</span>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            onClick={() => onSubmit(preset.query)}
            className="focus-ring whitespace-nowrap rounded-full border border-slate-200 bg-[#f6f5f1] px-3 py-1.5 text-[10px] text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            title={preset.query}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border border-slate-300 bg-white p-2 shadow-[4px_4px_0_rgba(139,92,246,.12)] transition focus-within:border-violet-500">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="Describe a product, budget, and what matters most…"
          className="min-h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-slate-950 placeholder:text-slate-400 disabled:cursor-wait"
          aria-label="Shopping intent"
        />
        <button type="submit" disabled={!value.trim() || disabled} aria-label="Send shopping intent" className="focus-ring grid size-10 shrink-0 place-items-center bg-violet-600 text-white transition hover:bg-slate-950 disabled:bg-slate-200 disabled:text-slate-400"><ArrowUp size={17} /></button>
      </form>
      <p className="mt-2 hidden text-center font-mono text-[8px] text-slate-400 sm:block"><Command size={9} className="mr-1 inline" /> Live merchant catalog · no purchase occurs without your approval</p>
    </div>
  )
}
