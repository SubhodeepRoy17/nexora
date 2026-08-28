import {
  ArrowRight,
  Bot,
  Braces,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Code2,
  ExternalLink,
  FileJson2,
  Fingerprint,
  Globe2,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Webhook,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Brand from '../components/Brand'
import { API_BASE_URL } from '../services/api'

const apiOrigin = API_BASE_URL.startsWith('http') ? new URL(API_BASE_URL).origin : ''
const resourceUrl = (path) => `${apiOrigin}${path}`

const resources = [
  {
    icon: Braces,
    label: 'Capability document',
    detail: 'Start here. Versions, limits, authentication, URLs, and supported operations.',
    path: '/.well-known/nexora-commerce.json',
    action: 'Open capabilities',
  },
  {
    icon: FileJson2,
    label: 'OpenAPI 3.1',
    detail: 'The exact request, response, error, and endpoint contract for API clients.',
    path: '/api/commerce/v1/openapi.json',
    action: 'Open OpenAPI',
  },
  {
    icon: PackageSearch,
    label: 'Public catalog',
    detail: 'Active, in-stock products with exact prices, specifications, and compatibility.',
    path: '/api/commerce/v1/catalog/products/',
    action: 'Browse catalog JSON',
  },
  {
    icon: ShieldCheck,
    label: 'Money-action policy',
    detail: 'Server-enforced currency, quantity, value, stock, expiry, and test-mode limits.',
    path: '/api/commerce/v1/policies/money-actions/',
    action: 'Open policy',
  },
]

const flow = [
  { icon: Globe2, title: 'Discover', detail: 'Read the capability document and query the public, agent-readable catalog.' },
  { icon: ShoppingBag, title: 'Build an exact quote', detail: 'Request current products, quantities, prices, total, expiry, and correlation ID.' },
  { icon: Fingerprint, title: 'Present to a human', detail: 'Show the complete quote and limits. Approval must be explicit and exact.' },
  { icon: CircleDollarSign, title: 'Create the handoff', detail: 'Use the single-use approval to create a bounded Razorpay Test Mode checkout.' },
  { icon: Webhook, title: 'Verify the outcome', detail: 'Poll authoritative status. Only a verified webhook or reconciliation can mark it paid.' },
]

const guarantees = [
  ['Read-only discovery', 'Catalog clients cannot mutate merchant inventory or private data.'],
  ['Idempotent money calls', 'Safe retries return the same result; conflicting reuse is rejected.'],
  ['Short-lived approval', 'A signed grant is bound to one buyer, quote, amount, and expiry.'],
  ['Stable error codes', 'Callers can handle policy, identity, state, and rate-limit failures predictably.'],
]

function ResourceCard({ icon: Icon, label, detail, path, action }) {
  return (
    <article className="group flex h-full flex-col rounded-[1.5rem] border border-emerald-950/10 bg-white/76 p-5 shadow-[0_18px_50px_rgba(42,81,68,.07)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_22px_55px_rgba(109,40,217,.1)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-11 place-items-center rounded-2xl bg-[#e6f3e9] text-[#17372f]"><Icon size={19} /></span>
        <ExternalLink size={15} className="text-[#31594f]/35 transition group-hover:text-violet-600" />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-[-.025em] text-[#17372f]">{label}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-[#31594f]/75">{detail}</p>
      <code className="mt-5 block overflow-hidden text-ellipsis whitespace-nowrap rounded-xl border border-emerald-950/10 bg-[#f3f7ef] px-3 py-2.5 font-mono text-[9px] text-[#31594f]">GET {path}</code>
      <a href={resourceUrl(path)} target="_blank" rel="noreferrer" className="focus-ring mt-4 inline-flex items-center gap-2 text-xs font-semibold text-violet-700 transition hover:text-violet-900">
        {action} <ArrowRight size={14} />
      </a>
    </article>
  )
}

export default function AgentCommerce() {
  return (
    <main className="overflow-hidden bg-[#f6f5f1] text-slate-950">
      <section className="relative isolate overflow-hidden border-b border-emerald-950/10 px-4 pb-20 pt-28 sm:px-6 sm:pb-28 sm:pt-32 lg:px-8">
        <div className="absolute inset-0 -z-30 bg-[radial-gradient(circle_at_15%_15%,rgba(167,243,208,.55),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(221,214,254,.65),transparent_34%),linear-gradient(145deg,#f7f5e9_0%,#edf7eb_52%,#e3f2ef_100%)]" />
        <div className="absolute -left-20 top-36 -z-20 size-72 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="absolute -right-24 top-12 -z-20 size-80 rounded-full bg-violet-200/40 blur-3xl" />

        <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[1.04fr_.96fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/70 bg-white/65 px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[.16em] text-violet-700 backdrop-blur">
              <Bot size={13} /> Agent Commerce API · v1
            </span>
            <h1 className="mt-6 max-w-[11ch] text-balance text-[clamp(3.2rem,7vw,6.8rem)] font-semibold leading-[.9] tracking-[-.055em] text-[#17372f]">
              Built for AI buyers. Gated by humans.
            </h1>
            <p className="mt-7 max-w-2xl text-balance text-base leading-7 text-[#31594f] sm:text-lg">
              Nexora exposes a versioned catalog and checkout contract that lets an external AI buyer discover products, prepare an exact quote, pause for human approval, and reach Razorpay Test Mode safely.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={resourceUrl('/.well-known/nexora-commerce.json')} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#17372f] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(23,55,47,.22)] transition hover:-translate-y-0.5 hover:bg-violet-700">
                Read machine capabilities <ExternalLink size={15} />
              </a>
              <a href="#integration-flow" className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/90 bg-white/65 px-6 py-3 text-sm font-semibold text-[#17372f] shadow-[0_12px_30px_rgba(42,81,68,.09)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white">
                See the transaction flow <ChevronRight size={15} />
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-semibold text-[#31594f]">
              {['OpenAPI 3.1', 'INR only', 'Human approval required', 'Razorpay Test Mode'].map((item) => <span key={item} className="flex items-center gap-1.5"><span className="grid size-4 place-items-center rounded-full bg-white/70"><Check size={10} /></span>{item}</span>)}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-white/30 blur-xl" />
            <div className="overflow-hidden rounded-[2rem] border border-white/90 bg-[#17372f] shadow-[0_30px_90px_rgba(23,55,47,.24)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-rose-300" /><span className="size-2.5 rounded-full bg-amber-300" /><span className="size-2.5 rounded-full bg-emerald-300" /></div>
                <span className="font-mono text-[8px] uppercase tracking-[.16em] text-emerald-100/65">Human-gated handoff</span>
              </div>
              <div className="p-5 sm:p-7">
                <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-emerald-200 text-[#17372f]"><Code2 size={18} /></span><div><p className="font-mono text-[8px] uppercase tracking-[.16em] text-emerald-200/70">Nexora Commerce</p><p className="mt-1 text-sm font-semibold text-white">External buyer session</p></div></div>
                <div className="mt-7 space-y-3">
                  {[
                    ['01', 'Catalog discovered', 'Public · cached'],
                    ['02', 'Exact quote prepared', '₹8,498 · expires'],
                    ['03', 'Human approval', 'Required'],
                    ['04', 'Razorpay handoff', 'Test Mode only'],
                  ].map(([number, title, state], index) => (
                    <div key={title} className="relative flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.055] p-3.5">
                      {index < 3 && <span className="absolute left-[27px] top-[46px] h-6 w-px bg-emerald-200/20" />}
                      <span className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full border font-mono text-[8px] ${index < 2 ? 'border-emerald-300 bg-emerald-200 text-[#17372f]' : 'border-white/20 bg-white/5 text-white'}`}>{index < 2 ? <Check size={12} /> : number}</span>
                      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-white">{title}</p><p className="mt-1 font-mono text-[8px] uppercase tracking-[.11em] text-emerald-100/55">{state}</p></div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200/20 bg-amber-100/10 p-4"><Clock3 size={16} className="mt-0.5 shrink-0 text-amber-200" /><p className="text-[10px] leading-5 text-amber-50/75">No AI caller can skip approval, choose an authoritative amount, or declare payment complete.</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <header className="max-w-3xl">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[.18em] text-violet-700">Machine-readable resources</p>
            <h2 className="mt-5 text-balance text-3xl font-semibold leading-[1.02] tracking-[-.045em] text-[#17372f] sm:text-5xl">A clear starting point for every client.</h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#31594f]/75 sm:text-base">The page you are reading is for people. These documents are the exact source of truth for agents and developers.</p>
          </header>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {resources.map((resource) => <ResourceCard key={resource.path} {...resource} />)}
          </div>
        </div>
      </section>

      <section id="integration-flow" className="border-y border-emerald-950/10 bg-[#edf4ea] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid gap-12 lg:grid-cols-[.72fr_1.28fr]">
            <header className="lg:sticky lg:top-24 lg:self-start">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[.18em] text-violet-700">End-to-end sequence</p>
              <h2 className="mt-5 text-balance text-3xl font-semibold leading-[1.02] tracking-[-.045em] text-[#17372f] sm:text-5xl">From discovery to verified payment.</h2>
              <p className="mt-5 text-sm leading-7 text-[#31594f]/75 sm:text-base">Every money-adjacent step is correlated, idempotent, time-bounded, and bound to the authenticated buyer.</p>
            </header>
            <ol className="relative space-y-4 before:absolute before:bottom-8 before:left-6 before:top-8 before:w-px before:bg-emerald-950/15 sm:before:left-8">
              {flow.map(({ icon: Icon, title, detail }, index) => (
                <li key={title} className="relative flex gap-4 rounded-[1.5rem] border border-white/90 bg-white/72 p-4 shadow-[0_15px_40px_rgba(42,81,68,.06)] sm:gap-6 sm:p-6">
                  <span className="relative z-10 grid size-12 shrink-0 place-items-center rounded-2xl border border-emerald-950/10 bg-[#17372f] text-white sm:size-16"><Icon size={20} /><span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-violet-600 font-mono text-[7px] text-white">{index + 1}</span></span>
                  <div className="pt-1"><h3 className="text-base font-semibold text-[#17372f] sm:text-lg">{title}</h3><p className="mt-2 text-sm leading-6 text-[#31594f]/75">{detail}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-stretch">
          <div className="rounded-[2rem] border border-emerald-950/10 bg-white/78 p-6 shadow-[0_22px_60px_rgba(42,81,68,.08)] sm:p-8">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[.18em] text-violet-700">Bounded by design</p>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-.045em] text-[#17372f] sm:text-4xl">An agent can propose. It cannot silently purchase.</h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {guarantees.map(([title, detail]) => <article key={title} className="rounded-2xl border border-emerald-950/10 bg-[#f3f7ef] p-4"><span className="grid size-8 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={14} /></span><h3 className="mt-4 text-sm font-semibold text-[#17372f]">{title}</h3><p className="mt-2 text-xs leading-5 text-[#31594f]/70">{detail}</p></article>)}
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-[2rem] bg-[#17372f] p-6 text-white shadow-[0_25px_70px_rgba(23,55,47,.2)] sm:p-8">
            <div>
              <div className="flex items-center justify-between gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-emerald-200 text-[#17372f]"><RefreshCw size={18} /></span><span className="rounded-full border border-white/15 px-3 py-1.5 font-mono text-[8px] uppercase tracking-[.14em] text-emerald-100/70">Failure closes safely</span></div>
              <h2 className="mt-7 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Price changed after approval?</h2>
              <p className="mt-4 text-sm leading-7 text-emerald-50/70">Checkout is rejected before a Razorpay order is created. No payment status or stock mutation can come from the caller, and the reason is preserved in the audit trail.</p>
            </div>
            <div className="mt-10 rounded-2xl border border-white/10 bg-white/[.055] p-4 font-mono text-[9px] leading-6 text-emerald-100/70">
              <p><span className="text-amber-200">409</span> PRICE_CHANGED</p>
              <p>correlation_id: recorded</p>
              <p>money_mutation: none</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-violet-200 bg-violet-50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-8 lg:flex-row lg:items-center">
          <div><p className="font-mono text-[9px] uppercase tracking-[.18em] text-violet-700">Choose your interface</p><h2 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-[-.045em] sm:text-5xl">Use the contract—or shop with Nexora directly.</h2></div>
          <div className="flex flex-col gap-3 sm:flex-row"><Link to="/buyer" className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#17372f] px-6 text-sm font-semibold text-white transition hover:bg-violet-700">Open shopping assistant <ArrowRight size={15} /></Link><a href={resourceUrl('/api/commerce/v1/openapi.json')} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-violet-300 bg-white px-6 text-sm font-semibold text-violet-700 transition hover:border-violet-500">Open API specification <ExternalLink size={15} /></a></div>
        </div>
      </section>

      <footer className="border-t border-emerald-950/10 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><Link to="/" aria-label="Nexora home"><Brand /></Link><p className="max-w-xl text-xs leading-6 text-[#31594f]/65">Nexora-native commerce contract. No ACP, AP2, x402, UAP, or other protocol compliance is claimed.</p></div>
      </footer>
    </main>
  )
}
