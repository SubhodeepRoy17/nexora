import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  CreditCard,
  Database,
  FileCheck2,
  Fingerprint,
  Globe2,
  LineChart,
  Search,
  ShieldCheck,
  Webhook,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Brand from '../components/Brand'
import { SignalButton, StatusPill } from '../components/ui/Primitives'

const trustPoints = [
  { icon: Database, label: 'Catalog-grounded', detail: 'Live price, stock, specs' },
  { icon: Fingerprint, label: 'Approval-bound', detail: 'Exact quote, one human' },
  { icon: Webhook, label: 'Webhook-authoritative', detail: 'The browser never settles' },
]

const steps = [
  { number: '01', title: 'Describe the outcome', signal: 'Constraints in. No keyword guesswork.', copy: 'Give Nexora your budget, required specs, use case, and acceptable trade-offs. The agent turns the outcome into a bounded search plan.' },
  { number: '02', title: 'Compare grounded options', signal: 'Live evidence. Ranked trade-offs.', copy: 'Nexora searches current merchant catalogs, verifies price and stock, then explains why each option fits—or fails—your request.' },
  { number: '03', title: 'Approve the exact quote', signal: 'One quote. One human decision.', copy: 'Review products, quantities, unit prices, policy limits, expiry, and the precise payable total before any payment action is allowed.' },
  { number: '04', title: 'Pay with a safe handoff', signal: 'Checkout opens. Webhook settles.', copy: 'Razorpay Checkout opens only after approval. Signed provider webhooks—not the browser—remain the authority for payment status.' },
]

function useRevealOnce(threshold = 0.12) {
  const sectionRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return undefined
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { threshold, rootMargin: '0px 0px -8% 0px' })
    observer.observe(section)
    return () => observer.disconnect()
  }, [threshold])

  return [sectionRef, visible]
}

function JourneyIllustration({ number }) {
  if (number === '01') return (
    <div className="journey-illustration journey-illustration-sky" aria-hidden="true">
      <div className="journey-float w-[82%] max-w-[330px] rounded-2xl border border-white/90 bg-white/80 p-4 shadow-[0_20px_45px_rgba(46,91,78,.14)] backdrop-blur-md">
        <div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e8f5ef] text-[#17372f]"><Search size={16} /></span><div className="h-2.5 flex-1 rounded-full bg-[#31594f]/12"><div className="h-full w-[72%] rounded-full bg-[#31594f]/28" /></div></div>
        <p className="mt-4 text-sm font-semibold text-[#17372f]">Quiet travel keyboard under ₹9,000</p>
        <div className="mt-4 flex flex-wrap gap-2">{['Quiet', 'Wireless', 'Travel'].map((item) => <span key={item} className="rounded-full border border-emerald-900/10 bg-[#f4f8ec] px-2.5 py-1 font-mono text-[7px] uppercase tracking-wider text-[#31594f]">{item}</span>)}</div>
      </div>
    </div>
  )

  if (number === '02') return (
    <div className="journey-illustration journey-illustration-grid" aria-hidden="true">
      <div className="flex w-[86%] max-w-[350px] items-end justify-center gap-3">
        {[['92%', 'Best fit', 'bg-emerald-300/70'], ['84%', 'Alternative', 'bg-violet-300/70']].map(([score, label, color], index) => <div key={label} className={`journey-option-card w-1/2 rounded-2xl border border-white/90 bg-white/85 p-4 shadow-[0_18px_40px_rgba(46,91,78,.12)] ${index ? 'translate-y-3' : ''}`}><div className={`grid size-10 place-items-center rounded-xl ${color}`}><Bot size={17} className="text-[#17372f]" /></div><p className="mt-5 font-mono text-[8px] uppercase tracking-[0.14em] text-[#31594f]/65">{label}</p><p className="mt-1 text-lg font-semibold text-[#17372f]">{score}</p><div className="mt-3 space-y-1.5"><span className="block h-1.5 w-full rounded-full bg-[#31594f]/13" /><span className="block h-1.5 w-2/3 rounded-full bg-[#31594f]/10" /></div></div>)}
      </div>
    </div>
  )

  if (number === '03') return (
    <div className="journey-illustration journey-illustration-mint" aria-hidden="true">
      <div className="journey-quote-card w-[82%] max-w-[330px] rounded-2xl border border-white/90 bg-white/85 p-5 shadow-[0_20px_45px_rgba(46,91,78,.14)]">
        <div className="flex items-center justify-between"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#31594f]/65">Exact quote</span><FileCheck2 size={18} className="text-emerald-700" /></div>
        <div className="mt-5 space-y-3 text-[10px] text-[#31594f]"><div className="flex justify-between"><span>Nexora Nomad 75</span><strong>₹7,499</strong></div><div className="flex justify-between"><span>Travel case</span><strong>₹999</strong></div></div>
        <div className="mt-4 flex items-center justify-between border-t border-emerald-950/10 pt-4"><span className="text-xs font-semibold text-[#17372f]">Total</span><span className="text-lg font-semibold text-[#17372f]">₹8,498</span></div>
        <div className="mt-4 flex items-center justify-center gap-2 rounded-full bg-[#17372f] px-4 py-2.5 text-[9px] font-semibold text-white"><Check size={12} /> Human approval required</div>
      </div>
    </div>
  )

  return (
    <div className="journey-illustration journey-illustration-gold" aria-hidden="true">
      <div className="flex w-[88%] max-w-[360px] items-center justify-between gap-2">
        {[{ icon: CreditCard, label: 'Razorpay' }, { icon: Webhook, label: 'Webhook' }, { icon: CheckCircle2, label: 'Verified' }].map(({ icon: Icon, label }, index) => <div key={label} className="contents"><div className={`journey-handoff-node journey-handoff-node-${index + 1} relative z-10 flex min-w-0 flex-1 flex-col items-center rounded-2xl border border-white/90 bg-white/85 px-2 py-5 shadow-[0_18px_40px_rgba(81,71,38,.11)]`}><span className="grid size-10 place-items-center rounded-full bg-[#f4f8ec] text-[#17372f]"><Icon size={17} /></span><span className="mt-3 text-[9px] font-semibold text-[#31594f]">{label}</span></div>{index < 2 && <div className="journey-flow-line relative h-px w-5 shrink-0 bg-[#31594f]/20"><span className="absolute -top-1 left-0 size-2 rounded-full bg-emerald-500" /></div>}</div>)}
      </div>
    </div>
  )
}

function JourneyStepCard({ step, index }) {
  return (
    <article className={`journey-step-card journey-step-card-${step.number} group overflow-hidden border border-emerald-950/10 bg-white/75 shadow-[0_18px_45px_rgba(42,81,68,.07)] backdrop-blur-sm`} style={{ '--journey-delay': `${index * 140}ms` }} tabIndex={0} aria-label={`${step.title}. Focus or hover to reveal details.`}>
      <JourneyIllustration number={step.number} />
      <div className="journey-step-copy border-t border-emerald-950/10 bg-white/85 p-6 sm:p-7">
        <div className="flex items-center gap-3"><span className="font-mono text-[9px] font-semibold tracking-[0.16em] text-violet-700">STEP {step.number}</span><span className="h-px flex-1 bg-emerald-950/10" /></div>
        <h3 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-[#17372f]">{step.title}</h3>
        <div className="journey-step-reveal mt-3">
          <p className="journey-step-signal font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#31594f]">{step.signal}</p>
          <p className="journey-step-detail text-sm leading-6 text-[#31594f]">{step.copy}</p>
        </div>
      </div>
    </article>
  )
}

function ProductFeatureCard({ children, className = '', tone = 'paper', motion = 'rise', index = 0 }) {
  const tones = {
    paper: 'border-emerald-950/10 bg-white/80',
    sky: 'border-sky-900/10 bg-gradient-to-br from-[#ddf2f4] via-[#edf7e7] to-[#f7f3d9]',
    violet: 'border-violet-900/10 bg-gradient-to-br from-[#eee9ff] to-[#f8f5ff]',
    mint: 'border-emerald-900/10 bg-gradient-to-br from-[#e0f5ea] to-[#f3f8e8]',
    gold: 'border-amber-900/10 bg-gradient-to-br from-[#fbf4d8] to-[#eff6df]',
  }
  return <article className={`product-bento-card product-bento-motion-${motion} relative isolate overflow-hidden rounded-[1.65rem] border p-6 shadow-[0_18px_50px_rgba(42,81,68,.07)] sm:p-7 ${tones[tone]} ${className}`} style={{ '--product-delay': `${index * 90}ms` }}>{children}</article>
}

export default function LandingPage() {
  const [productSectionRef, productVisible] = useRevealOnce()
  const [journeySectionRef, journeyVisible] = useRevealOnce(0.08)
  const [safetySectionRef, safetyVisible] = useRevealOnce(0.12)
  const [footerRef, footerVisible] = useRevealOnce(0.16)

  return (
    <main className="overflow-hidden bg-[#f6f5f1] text-slate-950">
      <section id="top" className="storybook-hero relative isolate min-h-svh overflow-hidden border-b border-emerald-950/10 px-4 sm:px-6 lg:px-8">
        <div className="storybook-hero-art absolute inset-0 -z-30" aria-hidden="true" />
        <div className="storybook-hero-scrim absolute inset-0 -z-20" aria-hidden="true" />
        <div className="storybook-cloud storybook-cloud-one" aria-hidden="true" />
        <div className="storybook-cloud storybook-cloud-two" aria-hidden="true" />

        <div className="mx-auto flex min-h-svh max-w-[1440px] flex-col items-center justify-center pb-32 pt-24 text-center sm:pb-36 sm:pt-24">
          <div className="storybook-copy relative z-10 flex max-w-4xl flex-col items-center">
            <h1 className="storybook-title mt-6 max-w-[13ch] text-balance text-[clamp(3.35rem,7.4vw,7.3rem)] font-semibold leading-[0.88] tracking-[-0.055em] text-[#17372f] drop-shadow-[0_2px_0_rgba(255,255,255,.35)]">
              <span className="storybook-title-mask block"><span className="storybook-title-line storybook-title-line-one block">Tell us what matters.</span></span>
              <span className="storybook-title-mask block"><span className="storybook-title-line storybook-title-line-two block">We’ll find what fits.</span></span>
            </h1>
            <p className="storybook-description mt-7 max-w-2xl text-balance text-base font-medium leading-7 text-[#24483f] sm:text-lg">
              Nexora searches live merchant catalogs, explains the trade-offs, and waits for your exact approval before money moves.
            </p>
            <div className="storybook-actions mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              <Link to="/buyer" className="focus-ring group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#17372f] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(23,55,47,.25)] transition duration-300 hover:-translate-y-0.5 hover:bg-violet-700 sm:w-auto">
                Start with your intent <ArrowRight size={16} className="transition group-hover:translate-x-1" />
              </Link>
              <Link to="/merchant" className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/80 bg-white/65 px-7 py-3.5 text-sm font-semibold text-[#17372f] shadow-[0_12px_30px_rgba(54,88,71,.12)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white sm:w-auto">
                Explore merchant OS
              </Link>
            </div>
            <div className="storybook-proof mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-semibold text-[#31594f]">
              {['Grounded in live catalogs', 'Human-approved checkout', 'Webhook-verified payment'].map((item, index) => (
                <span key={item} className="storybook-proof-item flex items-center gap-1.5" style={{ '--proof-delay': `${1750 + index * 120}ms` }}><span className="grid size-4 place-items-center rounded-full bg-white/65"><Check size={10} /></span>{item}</span>
              ))}
            </div>
          </div>

          <a href="#product" className="focus-ring absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 rounded-full px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-950/75 transition hover:text-emerald-950" aria-label="Scroll to discover Nexora">
            Discover the system <ChevronDown size={17} className="storybook-scroll-cue" />
          </a>
        </div>
        <div className="storybook-hero-fade absolute inset-x-0 bottom-0 -z-10 h-32" aria-hidden="true" />
      </section>

      <section className="border-b border-slate-300 bg-white">
        <div className="mx-auto grid max-w-[1440px] divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
          {trustPoints.map(({ icon: Icon, label, detail }) => <div key={label} className="flex items-center gap-4 px-6 py-6 lg:px-10"><span className="grid size-10 shrink-0 place-items-center border border-violet-200 bg-violet-50 text-violet-600"><Icon size={17} /></span><div><p className="text-xs font-semibold text-slate-950">{label}</p><p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-slate-500">{detail}</p></div></div>)}
        </div>
      </section>

      <section ref={productSectionRef} id="product" className={`product-section px-4 py-20 sm:px-6 sm:py-28 lg:px-8 ${productVisible ? 'product-section-visible' : ''}`}>
        <div className="mx-auto max-w-[1440px]">
          <header className="product-bento-heading mx-auto flex max-w-3xl flex-col items-center text-center">
            <p className="inline-flex border border-violet-300/70 bg-violet-100 px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-violet-700">One system · two growth loops</p>
            <h2 className="mt-5 text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.045em] text-slate-950 sm:text-5xl">Everything a better purchase needs.</h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">From an open-ended intent to webhook-confirmed revenue, every part of Nexora stays grounded, explainable, and under human control.</p>
          </header>
          <div className="product-bento-grid mt-12 grid gap-4 lg:grid-cols-12 lg:auto-rows-[240px]">
            <ProductFeatureCard tone="sky" motion="scale" index={0} className="min-h-[470px] lg:col-span-7 lg:row-span-2">
              <div className="product-bento-orb product-bento-orb-one" aria-hidden="true" />
              <div className="relative z-10 flex h-full flex-col">
                <div className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/65 px-3 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-[#31594f] backdrop-blur-md"><Bot size={13} /> Buyer agent</span><span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#31594f]/55">Grounded discovery</span></div>
                <h3 className="mt-7 max-w-xl text-3xl font-semibold leading-[1.02] tracking-[-0.04em] text-[#17372f] sm:text-4xl">One conversation.<br />A shortlist that shows its work.</h3>
                <p className="mt-4 max-w-xl text-sm leading-6 text-[#31594f]">Describe the outcome, constraints, and trade-offs. Nexora searches live merchant evidence and explains every match without inventing catalog facts.</p>
                <div className="mt-auto pt-8">
                  <div className="product-intent-demo rounded-2xl border border-white/85 bg-white/70 p-3 shadow-[0_22px_55px_rgba(49,89,79,.13)] backdrop-blur-md sm:p-4">
                    <div className="flex items-center gap-3 rounded-xl bg-white/85 px-4 py-3"><Search size={15} className="shrink-0 text-violet-600" /><p className="min-w-0 flex-1 truncate text-xs font-semibold text-[#17372f]">Quiet wireless keyboard for travel under ₹9,000</p><ArrowRight size={14} className="text-[#31594f]" /></div>
                    <div className="product-evidence-row mt-3 grid gap-2 sm:grid-cols-3">{[['92%', 'Best fit'], ['₹7,499', 'Live price'], ['In stock', 'Verified']].map(([value, label], itemIndex) => <div key={label} className="rounded-xl border border-emerald-950/10 bg-[#f6f8f2]/90 px-3 py-3" style={{ '--evidence-index': itemIndex }}><p className="text-sm font-semibold text-[#17372f]">{value}</p><p className="mt-1 font-mono text-[7px] uppercase tracking-[0.12em] text-[#31594f]/65">{label}</p></div>)}</div>
                  </div>
                </div>
              </div>
            </ProductFeatureCard>

            <ProductFeatureCard tone="paper" motion="right" index={1} className="min-h-[220px] lg:col-span-5">
              <div className="flex h-full flex-col"><div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-full bg-emerald-100 text-emerald-800"><Database size={18} /></span><span className="font-mono text-[8px] uppercase tracking-[0.14em] text-emerald-700">Live evidence</span></div><div className="mt-auto pt-7"><div className="flex items-end justify-between gap-4"><div><h3 className="text-xl font-semibold tracking-[-0.03em] text-[#17372f]">Catalog-grounded</h3><p className="mt-2 max-w-sm text-xs leading-5 text-[#31594f]">Current price, stock, specifications, and merchant ownership.</p></div><span className="product-live-signal text-4xl font-semibold tracking-[-0.06em] text-emerald-700">LIVE</span></div><div className="mt-4 flex flex-wrap gap-2">{['PRICE', 'STOCK', 'SPECS'].map((item) => <span key={item} className="rounded-full border border-emerald-900/10 bg-emerald-50 px-2.5 py-1 font-mono text-[7px] text-emerald-800">{item}</span>)}</div></div></div>
            </ProductFeatureCard>

            <ProductFeatureCard tone="violet" motion="right" index={2} className="min-h-[220px] lg:col-span-5">
              <div className="flex h-full items-end justify-between gap-6"><div className="max-w-sm"><span className="grid size-11 place-items-center rounded-full bg-white/80 text-violet-700"><Fingerprint size={18} /></span><h3 className="mt-6 text-xl font-semibold tracking-[-0.03em] text-[#17372f]">Human approval</h3><p className="mt-2 text-xs leading-5 text-[#31594f]">The exact quote is visible and signed before checkout can open.</p></div><div className="shrink-0 text-right"><span className="product-approval-number block text-7xl font-semibold leading-none tracking-[-0.08em] text-violet-600">1</span><span className="font-mono text-[7px] uppercase tracking-[0.12em] text-violet-700">decision</span></div></div>
            </ProductFeatureCard>

            <ProductFeatureCard tone="mint" motion="left" index={3} className="min-h-[220px] lg:col-span-4">
              <div className="flex h-full flex-col"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-full bg-white/75 text-emerald-800"><Webhook size={17} /></span><StatusPill>Authority</StatusPill></div><div className="mt-auto pt-6"><h3 className="text-xl font-semibold tracking-[-0.03em] text-[#17372f]">Webhook settles truth.</h3><p className="mt-2 text-xs leading-5 text-[#31594f]">The browser never marks an order paid. Signed Razorpay events do.</p><div className="product-webhook-flow mt-4 flex items-center gap-2" aria-hidden="true"><span className="product-flow-packet size-2 rounded-full bg-violet-500" /><span className="h-px flex-1 bg-emerald-950/15" /><span className="size-2 rounded-full bg-emerald-500" /><span className="h-px flex-1 bg-emerald-950/15" /><CheckCircle2 size={16} className="text-emerald-700" /></div></div></div>
            </ProductFeatureCard>

            <ProductFeatureCard tone="paper" motion="rise" index={4} className="min-h-[220px] lg:col-span-4">
              <div className="flex h-full flex-col"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-full bg-violet-100 text-violet-700"><Globe2 size={17} /></span><Code2 size={17} className="text-[#31594f]/45" /></div><div className="mt-auto pt-6"><h3 className="text-xl font-semibold tracking-[-0.03em] text-[#17372f]">Readable by AI buyers.</h3><p className="mt-2 text-xs leading-5 text-[#31594f]">Versioned capabilities, cursor catalogs, JSON Schema, OpenAPI, and idempotent quotes.</p><div className="product-api-line mt-4 truncate rounded-lg bg-[#17372f] px-3 py-2 font-mono text-[7px] text-emerald-100">/.well-known/nexora-commerce.json</div></div></div>
            </ProductFeatureCard>

            <ProductFeatureCard tone="gold" motion="right" index={5} className="min-h-[220px] lg:col-span-4">
              <div className="flex h-full flex-col"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-full bg-white/75 text-amber-800"><LineChart size={17} /></span><span className="font-mono text-[7px] uppercase tracking-[0.12em] text-amber-800">Merchant growth</span></div><div className="mt-auto pt-6"><h3 className="text-xl font-semibold tracking-[-0.03em] text-[#17372f]">Revenue signals, honestly scoped.</h3><p className="mt-2 text-xs leading-5 text-[#31594f]">Webhook-confirmed conversions, offer outcomes, and catalog gaps—with denominators intact.</p><div className="mt-4 flex h-9 items-end gap-1" aria-label="Illustrative merchant signal chart">{[38, 54, 46, 68, 61, 82, 74, 96].map((height, index) => <span key={index} className={`product-growth-bar flex-1 origin-bottom rounded-t-sm ${index === 7 ? 'bg-emerald-500' : 'bg-violet-400/75'}`} style={{ height: `${height}%`, '--bar-index': index }} />)}</div></div></div>
            </ProductFeatureCard>
          </div>
        </div>
      </section>

      <section ref={journeySectionRef} id="how-it-works" className={`journey-steps-section journey-reveal-section relative isolate overflow-hidden border-y border-emerald-950/10 px-4 py-20 sm:px-6 sm:py-28 lg:px-8 ${journeyVisible ? 'journey-section-visible' : ''}`}>
        <div className="relative z-10 mx-auto max-w-[1440px]">
          <header className="journey-section-heading flex max-w-3xl flex-col items-start">
            <h2 className="text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.045em] text-slate-950 sm:text-5xl">Four steps. One human decision.</h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">The agent can search, compare, and prepare. Only you can approve the exact quote that reaches checkout.</p>
          </header>
          <div className="journey-route relative mt-10 hidden grid-cols-4 items-center md:grid" aria-hidden="true">
            <span className="absolute left-[12.5%] right-[12.5%] top-[15px] h-0.5 bg-emerald-950/15" />
            <span className="journey-route-fill absolute left-[12.5%] top-[15px] h-0.5 bg-gradient-to-r from-sky-400 via-violet-500 to-emerald-500" />
            {['Intent', 'Evidence', 'Approval', 'Settlement'].map((label, index) => <div key={label} className="journey-route-stop relative z-10 flex flex-col items-center" style={{ '--route-delay': `${280 + index * 150}ms` }}><span className="grid size-8 place-items-center rounded-full border border-violet-200 bg-white font-mono text-[8px] font-semibold text-violet-700 shadow-[0_5px_16px_rgba(109,40,217,.16)]">{index + 1}</span><span className="mt-2 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-[#31594f]/75">{label}</span></div>)}
          </div>
          <div className="relative mt-9 grid gap-4 md:grid-cols-2">
            {steps.map((step, index) => <JourneyStepCard key={step.number} step={step} index={index} />)}
          </div>
        </div>
      </section>

      <section ref={safetySectionRef} id="safety" className={`safety-section relative isolate overflow-hidden border-y border-emerald-950/10 px-4 py-20 text-slate-950 sm:px-6 sm:py-28 lg:px-8 ${safetyVisible ? 'safety-section-visible' : ''}`}>
        <div className="safety-aurora safety-aurora-one" aria-hidden="true" />
        <div className="safety-aurora safety-aurora-two" aria-hidden="true" />
        <div className="relative z-10 mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
          <div className="safety-copy-panel">
            <header className="flex max-w-3xl flex-col items-start">
              <p className="inline-flex border border-violet-300/70 bg-violet-100 px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-violet-700">The trust architecture</p>
              <h2 className="mt-5 text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.045em] text-slate-950 sm:text-5xl">When the evidence changes, the payment path closes.</h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">Nexora treats every money action as a bounded state transition. A stale price, depleted stock, replayed approval, wrong buyer, or failed signature stops execution before it can become a false paid state.</p>
            </header>
            <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {[{ icon: ShieldCheck, label: 'Deterministic bounds', copy: 'Policy checks live outside the model.' }, { icon: Fingerprint, label: 'Single-use approval', copy: 'One buyer, quote, amount, and expiry.' }, { icon: Webhook, label: 'Provider authority', copy: 'Signed webhooks settle payment truth.' }].map(({ icon: Icon, label, copy }, index) => <article key={label} className="safety-principle rounded-2xl border border-white/80 bg-white/60 p-4 shadow-[0_14px_34px_rgba(42,81,68,.08)] backdrop-blur-md" style={{ '--safety-delay': `${index * 110}ms` }}><span className="grid size-9 place-items-center rounded-full bg-[#17372f] text-white"><Icon size={15} /></span><h3 className="mt-4 text-sm font-semibold text-[#17372f]">{label}</h3><p className="mt-2 text-[10px] leading-5 text-[#31594f]">{copy}</p></article>)}
            </div>
          </div>

          <div className="safety-console relative overflow-hidden rounded-[2rem] border border-white/85 bg-white/68 p-4 shadow-[0_30px_80px_rgba(42,81,68,.14)] backdrop-blur-xl sm:p-7">
            <div className="safety-scan-line" aria-hidden="true" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-emerald-950/10 pb-5"><div><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-violet-700">Execution guard · live trace</p><h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#17372f]">Price-change failure, handled safely</h3></div><StatusPill tone="amber">Fail closed</StatusPill></div>
            <div className="safety-trace relative z-10 mt-2">
              {[
                ['Intent + recommendation', 'Grounded catalog evidence', 'complete'],
                ['Exact quote', '₹7,499 · expires in 09:42', 'complete'],
                ['Human approval', 'Signed · single use', 'complete'],
                ['Price revalidation', 'Merchant price changed', 'blocked'],
                ['Razorpay order', 'Not created · no inventory consumed', 'safe'],
              ].map(([title, detail, state], index) => <div key={title} className={`safety-trace-row safety-trace-${state} relative flex gap-4 border-b border-emerald-950/10 py-4 last:border-0`} style={{ '--trace-index': index }}><span className="safety-trace-node relative z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border bg-white font-mono text-[8px]">{state === 'complete' ? <Check size={13} /> : index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[#17372f]">{title}</p><span className="font-mono text-[7px] uppercase tracking-[0.12em]">{state}</span></div><p className="mt-1 text-[10px] text-[#31594f]/70">{detail}</p></div></div>)}
            </div>
            <div className="safety-outcome relative z-10 mt-4 flex items-start gap-3 rounded-2xl border border-emerald-300/70 bg-emerald-50/85 p-4"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-700" /><div><p className="text-xs font-semibold text-emerald-900">Safe outcome preserved</p><p className="mt-1 text-[10px] leading-5 text-emerald-800">No Razorpay order, no false paid state, and one immutable reason code in the audit trail.</p></div></div>
          </div>
        </div>
      </section>

      <section className="border-b border-violet-200 bg-violet-50 px-4 py-20 text-slate-950 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-10 lg:flex-row lg:items-end"><div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-violet-700">Ready when your intent is</p><h2 className="mt-5 max-w-4xl text-balance text-4xl font-semibold leading-[.98] tracking-[-0.05em] sm:text-6xl">Find the right product.<br />Keep control of the purchase.</h2></div><div className="flex flex-col gap-3 sm:flex-row"><SignalButton to="/buyer" variant="primary">Start shopping</SignalButton><SignalButton to="/merchant" variant="secondary">Merchant sign in</SignalButton></div></div>
      </section>

      <footer ref={footerRef} className={`motion-footer relative isolate overflow-hidden border-t border-emerald-950/10 text-[#17372f] ${footerVisible ? 'motion-footer-visible' : ''}`}>
        <div className="motion-footer-cloud motion-footer-cloud-one" aria-hidden="true" />
        <div className="motion-footer-cloud motion-footer-cloud-two" aria-hidden="true" />
        <div className="motion-footer-marquee border-b border-emerald-950/10 py-3" aria-hidden="true"><div className="motion-footer-marquee-track font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-[#31594f]/65"><span>Grounded discovery · Human approval · Webhook authority · Agent-readable commerce · </span><span>Grounded discovery · Human approval · Webhook authority · Agent-readable commerce · </span></div></div>
        <div className="relative z-10 mx-auto max-w-[1440px] px-4 pb-6 pt-14 sm:px-6 sm:pt-20 lg:px-8">
          <div className="motion-footer-content grid gap-12 lg:grid-cols-[1.25fr_.75fr_.75fr]">
            <div><Brand /><p className="mt-5 max-w-md text-sm leading-7 text-[#31594f]">A grounded commerce agent for buyers, and an agent-readable growth system for merchants—without surrendering control of the money.</p><a href="#top" className="motion-footer-top mt-7 inline-flex items-center gap-3 rounded-full border border-white/80 bg-white/55 px-5 py-3 text-xs font-semibold shadow-[0_12px_30px_rgba(42,81,68,.09)] backdrop-blur-md">Back to the beginning <ArrowUpRight size={15} /></a></div>
            <nav aria-label="Footer explore"><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-violet-700">Explore</p><div className="mt-5 flex flex-col items-start gap-3 text-sm font-medium"><a href="#product">Product</a><a href="#how-it-works">How it works</a><a href="#safety">Safety</a></div></nav>
            <nav aria-label="Footer system"><p className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-violet-700">Use Nexora</p><div className="mt-5 flex flex-col items-start gap-3 text-sm font-medium"><Link to="/buyer">Buyer agent</Link><Link to="/merchant">Merchant OS</Link><a href="/api/commerce/v1/openapi.json">Agent API</a></div></nav>
          </div>
          <div className="motion-footer-wordmark mt-16 overflow-hidden border-y border-emerald-950/10 py-3 sm:mt-20"><p className="nexora-wordmark whitespace-nowrap text-center text-[clamp(5rem,16vw,14rem)] font-semibold leading-[.72] tracking-[-0.055em] text-[#17372f]">NEXORA</p></div>
          <div className="flex flex-col justify-between gap-3 pt-6 font-mono text-[8px] uppercase tracking-[0.12em] text-[#31594f]/60 sm:flex-row"><p>© 2026 Nexora · Agentic commerce</p><p>Human approval · Razorpay test mode · Webhook authority</p></div>
        </div>
      </footer>
    </main>
  )
}
