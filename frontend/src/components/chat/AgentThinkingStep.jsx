import { LoaderCircle } from 'lucide-react'
import LogoMark from '../LogoMark'

export default function AgentThinkingStep({ steps, activeIndex }) {
  const activeStep = steps[Math.min(activeIndex, steps.length - 1)]

  return (
    <div className="flex max-w-2xl gap-3" aria-live="polite" aria-label="Agent progress">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-violet-200 bg-white shadow-[0_8px_22px_rgba(109,40,217,.1)]"><LogoMark className="size-6" alt="" /></span>
      <div className="flex items-center gap-2 rounded-2xl bg-white/78 px-4 py-3 text-sm text-[#294b43] shadow-[0_12px_34px_rgba(109,40,217,.1)] backdrop-blur-md">
        <LoaderCircle size={16} className="animate-spin text-violet-600" />
        {activeStep?.label}…
      </div>
    </div>
  )
}
