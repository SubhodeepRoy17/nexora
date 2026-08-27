import { ArrowUp, Command, Search, Sparkles } from 'lucide-react'

export default function ChatInput({ value, onChange, onSubmit, presets, disabled = false }) {
  const submit = (event) => {
    event.preventDefault()
    onSubmit(value)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-center gap-2 overflow-x-auto pb-1" aria-label="Example shopping prompts">
        <span className="hidden shrink-0 items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-slate-400 md:flex"><Sparkles size={10} /> Examples</span>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            onClick={() => onSubmit(preset.query)}
            className="focus-ring whitespace-nowrap rounded-full border border-emerald-950/10 bg-white/65 px-3 py-1.5 text-[10px] text-[#31594f]/75 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            title={preset.query}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="buyer-input flex items-center gap-2 rounded-[1.75rem] border border-emerald-950/10 bg-white/88 p-2.5 shadow-[0_18px_48px_rgba(42,81,68,.14)] backdrop-blur-xl transition focus-within:border-violet-300 focus-within:shadow-[0_20px_55px_rgba(109,40,217,.14)]">
        <span className="ml-1 grid size-8 shrink-0 place-items-center rounded-full bg-[#eef4ed] text-[#31594f]" aria-hidden="true"><Search size={14} /></span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="Describe a product, budget, and what matters most…"
          className="min-h-11 min-w-0 flex-1 bg-transparent px-1 text-sm text-[#17372f] placeholder:text-[#31594f]/45 disabled:cursor-wait"
          aria-label="Shopping intent"
        />
        <button type="submit" disabled={!value.trim() || disabled} aria-label="Send shopping intent" className="focus-ring grid size-10 shrink-0 place-items-center rounded-full bg-[#17372f] text-white shadow-[0_8px_20px_rgba(23,55,47,.2)] transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:translate-y-0 disabled:bg-[#dce5dc] disabled:text-[#31594f]/45 disabled:shadow-none"><ArrowUp size={17} /></button>
      </form>
      <p className="mt-2 hidden text-center font-mono text-[8px] text-[#31594f]/55 sm:block"><Command size={9} className="mr-1 inline" /> Nexora can make mistakes. Check the product details and final total before paying.</p>
    </div>
  )
}
