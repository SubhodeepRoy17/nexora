import LogoMark from '../LogoMark'

export default function AgentThinkingStep() {
  return (
    <div className="flex max-w-2xl gap-3" aria-live="polite" aria-label="Nexora is typing">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-violet-200 bg-white shadow-[0_8px_22px_rgba(109,40,217,.1)]"><LogoMark className="size-6" alt="" /></span>
      <div className="flex h-11 items-center gap-1.5 rounded-2xl rounded-bl-md bg-white/88 px-4 shadow-[0_12px_34px_rgba(109,40,217,.1)] backdrop-blur-md" aria-hidden="true">
        {[0, 1, 2].map((dot) => <span key={dot} className="buyer-typing-dot size-2 rounded-full bg-[#31594f]/65" style={{ animationDelay: `${dot * 160}ms` }} />)}
      </div>
      <span className="sr-only">Nexora is typing</span>
    </div>
  )
}
