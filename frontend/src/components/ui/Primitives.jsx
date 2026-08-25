import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Eyebrow({ children, tone = 'violet', className = '' }) {
  const tones = {
    violet: 'border-violet-300/70 bg-violet-100 text-violet-700',
    emerald: 'border-emerald-300/70 bg-emerald-50 text-emerald-700',
    ink: 'border-slate-300 bg-white text-slate-700',
    dark: 'border-white/15 bg-white/5 text-slate-300',
  }
  return <span className={`inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.17em] ${tones[tone]} ${className}`}>{children}</span>
}

export function SignalButton({ to, href, children, variant = 'primary', className = '', icon = true, ...props }) {
  const styles = {
    primary: 'border-slate-950 bg-slate-950 text-white shadow-[4px_4px_0_#8b5cf6] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#8b5cf6]',
    violet: 'border-violet-600 bg-violet-600 text-white shadow-[4px_4px_0_#111827] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#111827]',
    secondary: 'border-slate-300 bg-white text-slate-900 hover:border-slate-950 hover:bg-slate-50',
    ghost: 'border-transparent bg-transparent text-slate-700 hover:bg-slate-100',
    dark: 'border-white/20 bg-white/10 text-white hover:border-white/40 hover:bg-white/15',
  }
  const content = <>{children}{icon && <ArrowRight size={15} aria-hidden="true" />}</>
  const classes = `focus-ring inline-flex min-h-11 items-center justify-center gap-2 border px-5 text-[11px] font-bold transition duration-200 ${styles[variant]} ${className}`
  if (to) return <Link to={to} className={classes} {...props}>{content}</Link>
  if (href) return <a href={href} className={classes} {...props}>{content}</a>
  return <button type="button" className={classes} {...props}>{content}</button>
}

export function SectionHeading({ eyebrow, title, description, align = 'left', inverse = false }) {
  const alignment = align === 'center' ? 'mx-auto items-center text-center' : 'items-start'
  return (
    <div className={`flex max-w-3xl flex-col ${alignment}`}>
      {eyebrow && <Eyebrow tone={inverse ? 'dark' : 'violet'}>{eyebrow}</Eyebrow>}
      <h2 className={`mt-5 text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl ${inverse ? 'text-white' : 'text-slate-950'}`}>{title}</h2>
      {description && <p className={`mt-5 max-w-2xl text-sm leading-7 sm:text-base ${inverse ? 'text-slate-400' : 'text-slate-600'}`}>{description}</p>}
    </div>
  )
}

export function StatusPill({ children, tone = 'emerald' }) {
  const tones = {
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-700 before:bg-emerald-500',
    violet: 'border-violet-300 bg-violet-50 text-violet-700 before:bg-violet-500',
    amber: 'border-amber-300 bg-amber-50 text-amber-700 before:bg-amber-500',
  }
  return <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[8px] font-semibold uppercase tracking-[0.12em] before:size-1.5 before:rounded-full ${tones[tone]}`}>{children}</span>
}

export function GridCard({ children, className = '', dark = false, violet = false }) {
  const tone = dark
    ? 'border-white/10 bg-slate-950 text-white'
    : violet
      ? 'border-violet-700 bg-violet-600 text-white'
      : 'border-slate-200 bg-white text-slate-950'
  return <article className={`relative overflow-hidden border p-5 sm:p-7 ${tone} ${className}`}>{children}</article>
}
