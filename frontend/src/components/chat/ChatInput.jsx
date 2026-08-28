import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Search } from 'lucide-react'

export default function ChatInput({ value, onChange, onSubmit, presets, disabled = false }) {
  const [presetTyping, setPresetTyping] = useState(false)
  const presetTimerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => () => window.clearInterval(presetTimerRef.current), [])

  const submit = (event) => {
    event.preventDefault()
    if (disabled || presetTyping || !value.trim()) return
    onSubmit(value)
  }

  const typePreset = (query) => {
    window.clearInterval(presetTimerRef.current)
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      onChange(query)
      inputRef.current?.focus()
      return
    }

    setPresetTyping(true)
    onChange('')
    inputRef.current?.focus()
    let visibleLength = 0
    presetTimerRef.current = window.setInterval(() => {
      visibleLength = Math.min(query.length, visibleLength + 1)
      onChange(query.slice(0, visibleLength))
      if (visibleLength === query.length) {
        window.clearInterval(presetTimerRef.current)
        setPresetTyping(false)
        window.setTimeout(() => inputRef.current?.focus(), 0)
      }
    }, 20)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-center gap-2 overflow-x-auto pb-1" aria-label="Suggested shopping prompts">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={disabled || presetTyping}
            onClick={() => typePreset(preset.query)}
            className="focus-ring whitespace-nowrap rounded-full border border-emerald-950/10 bg-white/65 px-3 py-1.5 text-xs text-[#31594f]/75 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            title={preset.query}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="buyer-input flex items-center gap-2 rounded-[1.75rem] border border-emerald-950/10 bg-white/88 p-2 shadow-[0_18px_48px_rgba(42,81,68,.14)] backdrop-blur-xl transition focus-within:border-slate-400 focus-within:shadow-[0_20px_55px_rgba(42,81,68,.16)]">
        <span className="ml-1 grid size-8 shrink-0 place-items-center rounded-full bg-[#eef4ed] text-[#31594f]" aria-hidden="true"><Search size={14} /></span>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          readOnly={presetTyping}
          aria-busy={presetTyping}
          placeholder="Describe a product, budget, and what matters most…"
          className="min-h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-[#17372f] outline-none placeholder:text-[#31594f]/45 focus:outline-none focus-visible:outline-none disabled:cursor-wait"
          aria-label="Shopping intent"
        />
        <button type="submit" disabled={!value.trim() || disabled || presetTyping} aria-label="Send shopping intent" className="focus-ring grid size-9 shrink-0 place-items-center rounded-full bg-[#17372f] text-white shadow-[0_8px_20px_rgba(23,55,47,.2)] transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:translate-y-0 disabled:bg-[#dce5dc] disabled:text-[#31594f]/45 disabled:shadow-none"><ArrowUp size={16} /></button>
      </form>
    </div>
  )
}
