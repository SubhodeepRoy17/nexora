import {
  ArrowRight,
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
  Sparkles,
  Webhook,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Brand from '../components/Brand'
import { GridCard, SectionHeading, SignalButton, StatusPill } from '../components/ui/Primitives'

const trustPoints = [
  { icon: Database, label: 'Catalog-grounded', detail: 'Live price, stock, specs' },
  { icon: Fingerprint, label: 'Approval-bound', detail: 'Exact quote, one human' },
  { icon: Webhook, label: 'Webhook-authoritative', detail: 'The browser never settles' },
]

const steps = [
  { number: '01', icon: Search, title: 'Describe the outcome', authority: 'Buyer-led', accent: 'rgba(125, 211, 252, .55)', copy: 'Give Nexora your budget, constraints, use case, and trade-offs—not a product keyword list.' },
  { number: '02', icon: Bot, title: 'Compare grounded options', authority: 'Agent-prepared', accent: 'rgba(196, 181, 253, .6)', copy: 'The agent searches live merchant catalogs and explains every recommendation from recorded facts.' },
  { number: '03', icon: FileCheck2, title: 'Approve the exact quote', authority: 'Human-gated', accent: 'rgba(110, 231, 183, .65)', copy: 'You see products, quantities, unit prices, limits, expiry, and the precise amount before anything moves.' },
  { number: '04', icon: CreditCard, title: 'Pay with a safe handoff', authority: 'Provider handoff', accent: 'rgba(253, 230, 138, .62)', copy: 'Razorpay Checkout opens only after approval. Signed webhooks remain the settlement authority.' },
]

function moveSpotlight(event) {
  const card = event.currentTarget
  const bounds = card.getBoundingClientRect()
  card.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`)
  card.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`)
}

function SpotlightStepCard({ step }) {
  const { number, icon: Icon, title, authority, accent, copy } = step
  return (
    <article
      className="spotlight-step-card group relative isolate min-h-[330px] overflow-hidden rounded-[2rem] border border-white/80 p-6 shadow-[0_22px_55px_rgba(42,81,68,.11)] sm:p-8"
      style={{ '--spotlight-color': accent }}
      onPointerMove={moveSpotlight}
    >
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-center justify-between gap-4">
          <span className="rounded-full border border-white/90 bg-white/65 px-3 py-1.5 font-mono text-[9px] font-semibold tracking-[0.16em] text-[#31594f] shadow-sm backdrop-blur-md">STEP {number}</span>
          <span className="grid size-12 place-items-center rounded-full border border-white/90 bg-white/70 text-[#17372f] shadow-[0_10px_25px_rgba(42,81,68,.1)] backdrop-blur-md transition duration-300 group-hover:-translate-y-1 group-hover:scale-105"><Icon size={19} strokeWidth={1.8} /></span>
        </div>
        <div className="mt-14 sm:mt-16">
          <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-emerald-800/70">{authority}</p>
          <h3 className="storybook-title mt-3 text-[1.75rem] font-semibold leading-[1.02] tracking-[-0.035em] text-[#17372f]">{title}</h3>
          <p className="mt-4 text-sm leading-6 text-[#31594f]">{copy}</p>
        </div>
        <div className="mt-auto pt-8" aria-hidden="true">
          <div className="h-px bg-gradient-to-r from-[#31594f]/25 via-white/80 to-transparent" />
          <div className="mt-3 flex items-center gap-2 text-[9px] font-semibold text-[#31594f]/65"><span className="size-1.5 rounded-full bg-emerald-500/75" /> Bounded and auditable</div>
        </div>
      </div>
    </article>
  )
}

function MerchantPreview() {
  const bars = [42, 58, 51, 68, 64, 78, 72, 91, 84, 96, 88, 100]
  return (
    <div className="border border-slate-300 bg-white p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-violet-700">Deterministic UI example</p><p className="mt-2 text-lg font-semibold text-slate-950">Merchant intelligence</p></div><StatusPill>Not live data</StatusPill></div>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Agent impressions', '1,284'],
          ['Paid conversions', '86'],
          ['Attributed revenue', '₹3.4L'],
          ['Add-on revenue', '₹28K'],
        ].map(([label, value], index) => <div key={label} className={`border p-3 ${index === 3 ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><p className="font-mono text-[7px] uppercase text-slate-500">{label}</p><p className={`mt-2 text-lg font-semibold ${index === 3 ? 'text-emerald-700' : 'text-slate-950'}`}>{value}</p></div>)}
      </div>
      <div className="mt-3 border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-end justify-between"><div><p className="text-xs font-semibold text-slate-950">Webhook-confirmed revenue</p><p className="mt-1 text-[9px] text-slate-500">Illustrative product preview · real UI uses backend data</p></div><LineChart size={16} className="text-violet-700" /></div>
        <div className="mt-7 flex h-28 items-end gap-1.5" aria-label="Illustrative revenue chart">
          {bars.map((height, index) => <span key={index} className={`flex-1 transition hover:bg-violet-300 ${index === bars.length - 1 ? 'bg-emerald-400' : 'bg-violet-500/70'}`} style={{ height: `${height}%` }} />)}
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <main className="overflow-hidden bg-[#f6f5f1] text-slate-950">
      <section className="storybook-hero relative isolate min-h-svh overflow-hidden border-b border-emerald-950/10 px-4 sm:px-6 lg:px-8">
        <div className="storybook-hero-art absolute inset-0 -z-30" aria-hidden="true" />
        <div className="storybook-hero-scrim absolute inset-0 -z-20" aria-hidden="true" />
        <div className="storybook-cloud storybook-cloud-one" aria-hidden="true" />
        <div className="storybook-cloud storybook-cloud-two" aria-hidden="true" />

        <div className="mx-auto flex min-h-svh max-w-[1440px] flex-col items-center justify-center pb-32 pt-24 text-center sm:pb-36 sm:pt-24">
          <div className="storybook-copy relative z-10 flex max-w-4xl flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/55 px-4 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-950 shadow-[0_10px_35px_rgba(30,64,52,.12)] backdrop-blur-md">
              <Sparkles size={12} className="text-violet-700" /> A gentler way to find the right thing
            </div>
            <h1 className="storybook-title mt-7 max-w-[13ch] text-balance text-[clamp(3.35rem,7.4vw,7.3rem)] font-semibold leading-[0.88] tracking-[-0.055em] text-[#17372f] drop-shadow-[0_2px_0_rgba(255,255,255,.35)]">
              Tell us what matters. We’ll find what fits.
            </h1>
            <p className="mt-7 max-w-2xl text-balance text-base font-medium leading-7 text-[#24483f] sm:text-lg">
              Nexora searches live merchant catalogs, explains the trade-offs, and waits for your exact approval before money moves.
            </p>
            <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              <Link to="/buyer" className="focus-ring group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#17372f] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(23,55,47,.25)] transition duration-300 hover:-translate-y-0.5 hover:bg-violet-700 sm:w-auto">
                Start with your intent <ArrowRight size={16} className="transition group-hover:translate-x-1" />
              </Link>
              <Link to="/merchant" className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/80 bg-white/65 px-7 py-3.5 text-sm font-semibold text-[#17372f] shadow-[0_12px_30px_rgba(54,88,71,.12)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white sm:w-auto">
                Explore merchant OS
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-semibold text-[#31594f]">
              {['Grounded in live catalogs', 'Human-approved checkout', 'Webhook-verified payment'].map((item) => (
                <span key={item} className="flex items-center gap-1.5"><span className="grid size-4 place-items-center rounded-full bg-white/65"><Check size={10} /></span>{item}</span>
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

      <section id="product" className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <SectionHeading eyebrow="One system · two growth loops" title="Better buying for people. Better signals for merchants." description="Nexora connects grounded discovery, explicit human choice, safe payment execution, and webhook-confirmed merchant analytics in one traceable loop." />
          <div className="mt-12 grid auto-rows-[minmax(240px,auto)] gap-3 lg:grid-cols-12">
            <GridCard className="lg:col-span-7 lg:row-span-2">
              <div className="flex h-full flex-col"><div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center bg-violet-600 text-white"><Bot size={20} /></span><span className="font-mono text-[9px] text-slate-400">01 / BUYER</span></div><h3 className="mt-8 max-w-lg text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">A shopping agent that shows its work.</h3><p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">Every recommendation is grounded in current catalog facts. You see why it fits, what it compromises, what an add-on costs, and which policy limits apply.</p><div className="mt-8 grid gap-2 sm:grid-cols-3">{['Live catalog evidence', 'Concise trade-offs', 'No silent add-ons'].map((item) => <div key={item} className="border border-slate-200 bg-[#f6f5f1] p-3 font-mono text-[8px] font-semibold uppercase tracking-wider text-slate-600"><CheckCircle2 size={13} className="mb-3 text-emerald-600" />{item}</div>)}</div><SignalButton to="/buyer" variant="ghost" className="mt-auto w-fit px-0 pt-8">Try the buyer agent</SignalButton></div>
            </GridCard>

            <GridCard dark className="lg:col-span-5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center bg-violet-50 text-violet-700"><ShieldCheck size={18} /></span><span className="font-mono text-[9px] text-slate-600">02 / CONTROL</span></div><h3 className="mt-7 text-2xl font-semibold tracking-[-0.035em]">Money actions have boundaries.</h3><p className="mt-3 text-sm leading-6 text-slate-600">Quantity, order value, currency, stock, price, expiry, ownership, and test mode are checked deterministically—not left to an LLM.</p><div className="mt-6 flex flex-wrap gap-2">{['EXACT QUOTE', 'SIGNED GRANT', 'SINGLE USE', 'SAFE FAILURE'].map((item) => <span key={item} className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[7px] text-slate-700">{item}</span>)}</div></GridCard>

            <GridCard violet className="lg:col-span-5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center bg-white text-violet-700"><Globe2 size={18} /></span><span className="font-mono text-[9px] text-violet-700">03 / OPEN</span></div><h3 className="mt-7 text-2xl font-semibold tracking-[-0.035em]">Readable by external AI buyers.</h3><p className="mt-3 text-sm leading-6 text-violet-900">A versioned capability document, cursor catalog, JSON Schema, OpenAPI, idempotent quotes, and a reference HTTP-only buyer.</p><div className="mt-6 flex items-center gap-2 font-mono text-[8px] text-violet-950"><Code2 size={14} /> /.well-known/nexora-commerce.json</div></GridCard>

            <GridCard dark className="lg:col-span-12"><div className="grid items-center gap-8 lg:grid-cols-[.62fr_1.38fr]"><div><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300">04 / MERCHANT GROWTH</span><h3 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">Revenue insights with honest denominators.</h3><p className="mt-4 text-sm leading-7 text-slate-400">See real impressions, paid conversions, accepted and rejected offers, compatibility gaps, and incremental paid add-on revenue—without pretending recorded attribution proves causality.</p><SignalButton to="/merchant" variant="dark" className="mt-7">Explore merchant analytics</SignalButton></div><MerchantPreview /></div></GridCard>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="spotlight-steps-section relative isolate overflow-hidden border-y border-emerald-950/10 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="spotlight-steps-cloud spotlight-steps-cloud-left" aria-hidden="true" />
        <div className="spotlight-steps-cloud spotlight-steps-cloud-right" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-[1440px]">
          <SectionHeading eyebrow="A bounded path to payment" title="Four steps. One human decision." description="The agent can search, compare, and prepare. Only you can approve the exact quote that reaches checkout." />
          <div className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => <SpotlightStepCard key={step.number} step={step} />)}
          </div>
        </div>
      </section>

      <section id="safety" className="border-y border-slate-300 bg-white px-4 py-20 text-slate-950 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto grid max-w-[1440px] gap-14 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div><SectionHeading inverse eyebrow="The trust architecture" title="If the evidence changes, Nexora stops." description="Expired quote, changed price, depleted stock, replayed approval, wrong buyer, or policy breach: each failure gets a stable reason code and immutable audit—without creating a false paid state." /><div className="mt-8 flex flex-wrap gap-3"><StatusPill tone="amber">Fail closed</StatusPill><StatusPill>Stock safe</StatusPill><StatusPill tone="violet">Audit linked</StatusPill></div></div>
          <div className="border border-slate-200 bg-slate-50 p-4 sm:p-7">
            {[
              ['Intent + recommendation', 'Grounded catalog evidence', 'complete'],
              ['Exact quote', '₹7,499 · expires in 09:42', 'complete'],
              ['Human approval', 'Signed · single use', 'complete'],
              ['Price revalidation', 'Price changed by merchant', 'blocked'],
              ['Razorpay order', 'Not created', 'safe'],
            ].map(([title, detail, state], index) => <div key={title} className="relative flex gap-4 border-b border-slate-200 py-4 last:border-0"><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border font-mono text-[8px] ${state === 'blocked' ? 'border-amber-300 bg-amber-50 text-amber-700' : state === 'safe' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-violet-300 bg-violet-50 text-violet-700'}`}>{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{title}</p><span className={`font-mono text-[7px] uppercase ${state === 'blocked' ? 'text-amber-700' : state === 'safe' ? 'text-emerald-700' : 'text-violet-700'}`}>{state}</span></div><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div></div>)}
          </div>
        </div>
      </section>

      <section className="border-b border-violet-200 bg-violet-50 px-4 py-20 text-slate-950 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-10 lg:flex-row lg:items-end"><div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-violet-700">Ready when your intent is</p><h2 className="mt-5 max-w-4xl text-balance text-4xl font-semibold leading-[.98] tracking-[-0.05em] sm:text-6xl">Find the right product.<br />Keep control of the purchase.</h2></div><div className="flex flex-col gap-3 sm:flex-row"><SignalButton to="/buyer" variant="primary">Start shopping</SignalButton><SignalButton to="/merchant" variant="secondary">Merchant sign in</SignalButton></div></div>
      </section>

      <footer className="bg-[#f6f5f1] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1440px]"><div className="flex flex-col justify-between gap-8 border-b border-slate-300 pb-9 sm:flex-row sm:items-center"><Brand inverse /><nav className="flex flex-wrap gap-5 text-[11px] font-semibold text-slate-600" aria-label="Footer"><a href="#product" className="hover:text-violet-600">Product</a><a href="#how-it-works" className="hover:text-violet-600">How it works</a><a href="#safety" className="hover:text-violet-600">Safety</a><a href="/api/commerce/v1/openapi.json" className="hover:text-violet-600">Agent API</a></nav></div><div className="flex flex-col justify-between gap-3 pt-6 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500 sm:flex-row"><p>Grounded commerce intelligence.</p><p>Human approval · Razorpay test mode · Webhook authority</p></div></div>
      </footer>
    </main>
  )
}
