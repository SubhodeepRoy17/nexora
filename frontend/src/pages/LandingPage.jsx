import {
  Bot,
  Check,
  CheckCircle2,
  Code2,
  CreditCard,
  Database,
  FileCheck2,
  Fingerprint,
  Globe2,
  LineChart,
  LockKeyhole,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Webhook,
} from 'lucide-react'
import Brand from '../components/Brand'
import { Eyebrow, GridCard, SectionHeading, SignalButton, StatusPill } from '../components/ui/Primitives'

const trustPoints = [
  { icon: Database, label: 'Catalog-grounded', detail: 'Live price, stock, specs' },
  { icon: Fingerprint, label: 'Approval-bound', detail: 'Exact quote, one human' },
  { icon: Webhook, label: 'Webhook-authoritative', detail: 'The browser never settles' },
]

const steps = [
  { number: '01', icon: Search, title: 'Describe the outcome', copy: 'Give Nexora your budget, constraints, use case, and trade-offs—not a product keyword list.' },
  { number: '02', icon: Bot, title: 'Compare grounded options', copy: 'The agent searches live merchant catalogs and explains every recommendation from recorded facts.' },
  { number: '03', icon: FileCheck2, title: 'Approve the exact quote', copy: 'You see products, quantities, unit prices, limits, expiry, and the precise amount before anything moves.' },
  { number: '04', icon: CreditCard, title: 'Pay with a safe handoff', copy: 'Razorpay Checkout opens only after approval. Signed webhooks remain the settlement authority.' },
]

function DecisionTrace() {
  return (
    <div className="relative mx-auto w-full max-w-[610px] lg:ml-auto">
      <div className="absolute -inset-5 translate-x-5 translate-y-5 border border-violet-300/50 bg-violet-200/40" aria-hidden="true" />
      <div className="relative border border-slate-300 bg-[#0e1017] p-3 shadow-[0_30px_90px_rgba(50,31,104,.25)] sm:p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-violet-400" /><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">Deterministic UI example</span></div>
          <span className="font-mono text-[8px] text-violet-300">NOT LIVE DATA</span>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-violet-300">Buyer intent</p>
          <p className="mt-2 text-sm leading-6 text-white">“A quiet wireless keyboard under ₹8,000, with Mac support and no compromise on battery.”</p>
        </div>

        <div className="my-3 grid gap-2 sm:grid-cols-3">
          {[
            ['Catalog search', '18 eligible', Search],
            ['Policy check', '7 guardrails', ShieldCheck],
            ['Recommendation', '3 grounded', Sparkles],
          ].map(([label, value, Icon]) => (
            <div key={label} className="border border-white/10 bg-white/[0.025] p-3">
              <Icon size={13} className="text-violet-300" />
              <p className="mt-3 font-mono text-[7px] uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-1 text-xs font-semibold text-slate-100">{value}</p>
            </div>
          ))}
        </div>

        <div className="border border-violet-400/40 bg-violet-400/[0.08] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><StatusPill>Best grounded fit</StatusPill><h3 className="mt-3 text-lg font-semibold tracking-tight text-white">Keychron K8 Pro</h3><p className="mt-1 text-[10px] text-slate-400">Wireless · hot-swap · 240h battery · Mac/Windows</p></div>
            <div className="text-right"><p className="text-xl font-semibold text-white">₹7,499</p><p className="mt-1 font-mono text-[8px] text-violet-300">EXAMPLE FIXTURE</p></div>
          </div>
          <p className="mt-4 border-l-2 border-violet-400 pl-3 text-[11px] leading-5 text-slate-300">Fits the budget and platform constraints. Trade-off: the aluminium frame adds weight versus the lighter alternative.</p>
        </div>

        <div className="mt-3 flex flex-col gap-3 border border-emerald-400/25 bg-emerald-400/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><LockKeyhole size={16} /></span><div><p className="text-xs font-semibold text-white">Nothing happens without you.</p><p className="mt-1 font-mono text-[7px] text-slate-500">EXACT QUOTE · SINGLE USE · EXPIRES</p></div></div>
          <span className="bg-emerald-400 px-4 py-2.5 text-[10px] font-bold text-slate-950">Example action · Review exact quote</span>
        </div>
      </div>
    </div>
  )
}

function MerchantPreview() {
  const bars = [42, 58, 51, 68, 64, 78, 72, 91, 84, 96, 88, 100]
  return (
    <div className="border border-white/10 bg-[#12141d] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-violet-300">Deterministic UI example</p><p className="mt-2 text-lg font-semibold text-white">Merchant intelligence</p></div><StatusPill>Not live data</StatusPill></div>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Agent impressions', '1,284'],
          ['Paid conversions', '86'],
          ['Attributed revenue', '₹3.4L'],
          ['Add-on revenue', '₹28K'],
        ].map(([label, value], index) => <div key={label} className={`border p-3 ${index === 3 ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-white/10 bg-white/[0.025]'}`}><p className="font-mono text-[7px] uppercase text-slate-500">{label}</p><p className={`mt-2 text-lg font-semibold ${index === 3 ? 'text-emerald-300' : 'text-white'}`}>{value}</p></div>)}
      </div>
      <div className="mt-3 border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-end justify-between"><div><p className="text-xs font-semibold text-white">Webhook-confirmed revenue</p><p className="mt-1 text-[9px] text-slate-500">Illustrative product preview · real UI uses backend data</p></div><LineChart size={16} className="text-violet-300" /></div>
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
      <section className="landing-grid relative border-b border-slate-300 px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8">
        <div className="landing-orb landing-orb-one" aria-hidden="true" />
        <div className="landing-orb landing-orb-two" aria-hidden="true" />
        <div className="relative z-10 mx-auto grid max-w-[1440px] items-center gap-14 lg:grid-cols-[.92fr_1.08fr]">
          <div>
            <Eyebrow><Sparkles size={11} /> Human-approved agent commerce</Eyebrow>
            <h1 className="mt-7 max-w-3xl text-balance text-[clamp(3.2rem,7vw,7.2rem)] font-semibold leading-[0.88] tracking-[-0.065em]">From intent<br />to <span className="text-violet-600">order.</span></h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">Nexora finds the right product across live merchant catalogs, explains the trade-offs, grows baskets with relevant add-ons, and waits for your exact approval before money moves.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><SignalButton to="/buyer" variant="violet"><ShoppingBag size={15} /> Shop with Nexora</SignalButton><SignalButton to="/merchant" variant="secondary"><Store size={15} /> Open merchant OS</SignalButton></div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-300 pt-5 font-mono text-[8px] font-semibold uppercase tracking-[0.13em] text-slate-500"><span className="flex items-center gap-2"><Check size={12} className="text-emerald-600" /> Razorpay test mode</span><span className="flex items-center gap-2"><Check size={12} className="text-emerald-600" /> Exact approval gate</span><span className="flex items-center gap-2"><Check size={12} className="text-emerald-600" /> Auditable by design</span></div>
          </div>
          <DecisionTrace />
        </div>
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

            <GridCard dark className="lg:col-span-5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center bg-white/10 text-violet-300"><ShieldCheck size={18} /></span><span className="font-mono text-[9px] text-slate-600">02 / CONTROL</span></div><h3 className="mt-7 text-2xl font-semibold tracking-[-0.035em]">Money actions have boundaries.</h3><p className="mt-3 text-sm leading-6 text-slate-400">Quantity, order value, currency, stock, price, expiry, ownership, and test mode are checked deterministically—not left to an LLM.</p><div className="mt-6 flex flex-wrap gap-2">{['EXACT QUOTE', 'SIGNED GRANT', 'SINGLE USE', 'SAFE FAILURE'].map((item) => <span key={item} className="border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[7px] text-slate-300">{item}</span>)}</div></GridCard>

            <GridCard violet className="lg:col-span-5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center bg-white/15"><Globe2 size={18} /></span><span className="font-mono text-[9px] text-violet-200">03 / OPEN</span></div><h3 className="mt-7 text-2xl font-semibold tracking-[-0.035em]">Readable by external AI buyers.</h3><p className="mt-3 text-sm leading-6 text-violet-100">A versioned capability document, cursor catalog, JSON Schema, OpenAPI, idempotent quotes, and a reference HTTP-only buyer.</p><div className="mt-6 flex items-center gap-2 font-mono text-[8px] text-white"><Code2 size={14} /> /.well-known/nexora-commerce.json</div></GridCard>

            <GridCard dark className="lg:col-span-12"><div className="grid items-center gap-8 lg:grid-cols-[.62fr_1.38fr]"><div><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300">04 / MERCHANT GROWTH</span><h3 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">Revenue insights with honest denominators.</h3><p className="mt-4 text-sm leading-7 text-slate-400">See real impressions, paid conversions, accepted and rejected offers, compatibility gaps, and incremental paid add-on revenue—without pretending recorded attribution proves causality.</p><SignalButton to="/merchant" variant="dark" className="mt-7">Explore merchant analytics</SignalButton></div><MerchantPreview /></div></GridCard>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-slate-300 bg-white px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <SectionHeading eyebrow="A bounded path to payment" title="Four steps. One human decision." description="The agent can search, compare, and prepare. Only you can approve the exact quote that reaches checkout." />
          <div className="mt-12 grid border-l border-t border-slate-300 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ number, icon: Icon, title, copy }) => <article key={number} className="group min-h-[310px] border-b border-r border-slate-300 p-6 transition hover:bg-violet-50 sm:p-8"><div className="flex items-center justify-between"><span className="font-mono text-[10px] font-semibold text-violet-600">{number}</span><span className="grid size-10 place-items-center border border-slate-300 bg-white transition group-hover:border-violet-300 group-hover:text-violet-600"><Icon size={17} /></span></div><h3 className="mt-16 text-xl font-semibold tracking-[-0.025em]">{title}</h3><p className="mt-4 text-sm leading-6 text-slate-600">{copy}</p></article>)}
          </div>
        </div>
      </section>

      <section id="safety" className="bg-[#11131a] px-4 py-20 text-white sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto grid max-w-[1440px] gap-14 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div><SectionHeading inverse eyebrow="The trust architecture" title="If the evidence changes, Nexora stops." description="Expired quote, changed price, depleted stock, replayed approval, wrong buyer, or policy breach: each failure gets a stable reason code and immutable audit—without creating a false paid state." /><div className="mt-8 flex flex-wrap gap-3"><StatusPill tone="amber">Fail closed</StatusPill><StatusPill>Stock safe</StatusPill><StatusPill tone="violet">Audit linked</StatusPill></div></div>
          <div className="border border-white/10 bg-white/[0.025] p-4 sm:p-7">
            {[
              ['Intent + recommendation', 'Grounded catalog evidence', 'complete'],
              ['Exact quote', '₹7,499 · expires in 09:42', 'complete'],
              ['Human approval', 'Signed · single use', 'complete'],
              ['Price revalidation', 'Price changed by merchant', 'blocked'],
              ['Razorpay order', 'Not created', 'safe'],
            ].map(([title, detail, state], index) => <div key={title} className="relative flex gap-4 border-b border-white/10 py-4 last:border-0"><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border font-mono text-[8px] ${state === 'blocked' ? 'border-amber-400/50 bg-amber-400/10 text-amber-300' : state === 'safe' ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : 'border-violet-400/50 bg-violet-400/10 text-violet-300'}`}>{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{title}</p><span className={`font-mono text-[7px] uppercase ${state === 'blocked' ? 'text-amber-300' : state === 'safe' ? 'text-emerald-300' : 'text-violet-300'}`}>{state}</span></div><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div></div>)}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-300 bg-violet-600 px-4 py-20 text-white sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-10 lg:flex-row lg:items-end"><div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-violet-200">Ready when your intent is</p><h2 className="mt-5 max-w-4xl text-balance text-4xl font-semibold leading-[.98] tracking-[-0.05em] sm:text-6xl">Find the right product.<br />Keep control of the purchase.</h2></div><div className="flex flex-col gap-3 sm:flex-row"><SignalButton to="/buyer" variant="primary">Start shopping</SignalButton><SignalButton to="/merchant" variant="dark">Merchant sign in</SignalButton></div></div>
      </section>

      <footer className="bg-[#f6f5f1] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1440px]"><div className="flex flex-col justify-between gap-8 border-b border-slate-300 pb-9 sm:flex-row sm:items-center"><Brand inverse /><nav className="flex flex-wrap gap-5 text-[11px] font-semibold text-slate-600" aria-label="Footer"><a href="#product" className="hover:text-violet-600">Product</a><a href="#how-it-works" className="hover:text-violet-600">How it works</a><a href="#safety" className="hover:text-violet-600">Safety</a><a href="/api/commerce/v1/openapi.json" className="hover:text-violet-600">Agent API</a></nav></div><div className="flex flex-col justify-between gap-3 pt-6 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500 sm:flex-row"><p>Grounded commerce intelligence.</p><p>Human approval · Razorpay test mode · Webhook authority</p></div></div>
      </footer>
    </main>
  )
}
