import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, Clock3, HelpCircle, Menu, Plus, Sparkles, User } from 'lucide-react'
import AgentThinkingStep from '../components/chat/AgentThinkingStep'
import ChatInput from '../components/chat/ChatInput'
import CheckoutModal from '../components/chat/CheckoutModal'
import ProductRecommendationCard from '../components/chat/ProductRecommendationCard'
import { useNexora } from '../context/NexoraContext'
import { useAuth } from '../context/AuthContext'
import { initialChatMessages, presetQueries } from '../mock/chatData'
import { getApiError, searchProducts, toAddOnProduct, toRecommendationProduct } from '../services/api'

const liveThinkingSteps = [
  { id: 'parse', label: 'Parsing intent', detail: 'Extracting budget, use case, and required features' },
  { id: 'search', label: 'Searching merchants', detail: 'Querying active, in-stock products in PostgreSQL' },
  { id: 'compare', label: 'Comparing matches', detail: 'Grounding Groq recommendations against live catalog data' },
]

function AgentMark({ active = false }) {
  return <span className={`grid size-7 shrink-0 place-items-center rounded-lg border bg-indigo-500/15 text-indigo-400 ${active ? 'border-indigo-300/60 shadow-glow-strong' : 'border-indigo-400/30 shadow-glow'}`}><Sparkles size={13} /></span>
}

export default function BuyerChat() {
  const { buyerMessages: messages, setBuyerMessages: setMessages } = useNexora()
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [activeRun, setActiveRun] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const logRef = useRef(null)
  const runTimers = useRef([])
  const requestRef = useRef(null)

  const clearRunTimers = () => {
    runTimers.current.forEach(window.clearTimeout)
    runTimers.current = []
  }

  useEffect(() => () => {
    clearRunTimers()
    requestRef.current?.abort()
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, activeRun?.activeIndex])

  const startNewIntent = () => {
    clearRunTimers()
    requestRef.current?.abort()
    requestRef.current = null
    setActiveRun(null)
    setMessages(initialChatMessages)
    setInput('')
    setSidebarOpen(false)
  }

  const submitMessage = async (rawQuery) => {
    const query = rawQuery.trim()
    if (!query || activeRun) return

    clearRunTimers()
    const controller = new AbortController()
    requestRef.current = controller
    const messageId = Date.now()
    setMessages((current) => [...current, { id: messageId, role: 'user', text: query, time: 'Now' }])
    setInput('')
    setActiveRun({ steps: liveThinkingSteps, activeIndex: 0 })

    liveThinkingSteps.slice(1).forEach((_, index) => {
      runTimers.current.push(window.setTimeout(() => {
        setActiveRun((current) => current ? { ...current, activeIndex: index + 1 } : null)
      }, (index + 1) * 900))
    })

    try {
      const { data } = await searchProducts(query, controller.signal)
      if (requestRef.current !== controller) return
      let products = (data.recommendations ?? []).map(toRecommendationProduct)
      const addOns = (data.add_on_suggestions ?? []).map(toAddOnProduct)
      if (products.length && addOns.length) {
        products = [{ ...products[0], addOns }, ...products.slice(1)]
      }
      const fallbackUsed = data.provider_source === 'FALLBACK'
      setMessages((current) => [...current, {
        id: messageId + 1,
        role: 'agent',
        text: data.summary_reasoning,
        evidence: `${products.length} LIVE CATALOG MATCH${products.length === 1 ? '' : 'ES'}${fallbackUsed ? ' · ORM FALLBACK' : ' · GROQ GROUNDED'}`,
        products,
        time: 'Now',
      }])
    } catch (error) {
      if (controller.signal.aborted) return
      setMessages((current) => [...current, {
        id: messageId + 1,
        role: 'agent',
        text: getApiError(error, 'I could not complete this catalog search.'),
        evidence: 'SEARCH FAILED · RETRY AVAILABLE',
        time: 'Now',
        status: 'error',
      }])
    } finally {
      if (requestRef.current !== controller) return
      clearRunTimers()
      setActiveRun(null)
      requestRef.current = null
    }
  }

  const confirmOrderPlaced = ({ product, order }) => {
    setMessages((current) => [...current, {
      id: Date.now(),
      role: 'agent',
      text: `Payment verified for ${product.name}. The backend consumed the reserved inventory exactly once after Razorpay's signed webhook confirmed the capture.`,
      evidence: `PAID · ${order.order_id}`,
      time: 'Now',
      status: 'placed',
    }])
  }

  return (
    <div className="app-grid flex h-[calc(100dvh-4rem)] min-h-[576px] overflow-hidden bg-slate-950 text-slate-50">
      {sidebarOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed bottom-0 left-0 top-16 z-40 flex w-[272px] flex-col border-r border-slate-800 bg-slate-950 p-4 transition-transform duration-300 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-12 items-center justify-between px-1"><div><p className="text-xs font-semibold text-slate-200">Buyer workspace</p><p className="mt-1 font-mono text-[8px] text-slate-600">PERSONAL SHOPPING AGENT</p></div><button type="button" aria-label="Close navigation" className="text-slate-500 lg:hidden" onClick={() => setSidebarOpen(false)}>×</button></div>
        <button type="button" onClick={startNewIntent} className="focus-ring mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 py-3 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/20"><Plus size={15} /> New intent</button>

        <div className="mt-7">
          <p className="mono-label px-2 text-slate-600">Recent intents</p>
          <div className="mt-2 space-y-1">
            {presetQueries.map((preset, index) => (
              <button key={preset.id} type="button" disabled={Boolean(activeRun)} onClick={() => { submitMessage(preset.query); setSidebarOpen(false) }} className={`focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs transition disabled:cursor-wait disabled:opacity-50 ${index === 0 ? 'bg-slate-900 text-slate-200' : 'text-slate-500 hover:bg-slate-900/60 hover:text-slate-300'}`}>
                <Clock3 size={14} className={index === 0 ? 'text-indigo-400' : ''} /><span className="truncate">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto space-y-1 border-t border-slate-800 pt-4">
          <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-slate-500 transition hover:text-slate-300"><HelpCircle size={15} /> Help & feedback</button>
          <div className="flex items-center gap-3 rounded-xl px-3 py-3">
            <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 text-[10px] font-bold">{user?.display_name?.slice(0, 2).toUpperCase() ?? 'GU'}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-200">{user?.display_name ?? 'Guest buyer'}</p><p className="font-mono text-[9px] text-slate-600">{user ? 'Verified session' : 'Search only · sign in to buy'}</p></div>
            <ChevronDown size={13} className="text-slate-600" />
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-4 backdrop-blur-xl md:px-6">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)} className="focus-ring rounded-lg p-2 text-slate-400 lg:hidden"><Menu size={19} /></button>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-sm font-semibold">AI Buyer Agent</h1><span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[8px] text-emerald-400"><span className="size-1 rounded-full bg-emerald-400" /> ONLINE</span></div>
              <p className="mt-1 hidden text-[10px] text-slate-500 sm:block">Protected by explicit purchase approval</p>
            </div>
          </div>
        </header>

        <div ref={logRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
            <div className="mb-10 text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-indigo-400/25 bg-indigo-500/10 text-indigo-400 shadow-glow"><Bot size={23} /></div>
              <p className="mono-label text-indigo-400">Nexora intelligence</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Ask for the exact fit.</h2>
              <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-500 md:text-sm">Give me constraints, not keywords. I’ll reason across specs, merchants, price, and verified reviews.</p>
            </div>

            <div className="space-y-7">
              {messages.map((message, messageIndex) => {
                const latestAgent = message.role === 'agent' && !messages.slice(messageIndex + 1).some((item) => item.role === 'agent')
                return (
                  <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'ml-auto max-w-2xl flex-row-reverse' : 'max-w-full'}`}>
                    {message.role === 'agent' ? <AgentMark active={latestAgent} /> : <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-400"><User size={13} /></span>}
                    <div className={`min-w-0 ${message.role === 'agent' ? 'w-full' : ''}`}>
                      <div className={`rounded-2xl px-4 py-3 text-[13px] leading-6 ${message.role === 'user' ? 'rounded-tr-md border border-slate-700 bg-slate-800 text-slate-200' : message.status === 'placed' ? 'max-w-3xl rounded-tl-md border border-emerald-500/30 bg-emerald-500/10 text-slate-200 shadow-[0_0_28px_rgba(16,185,129,.1)]' : message.status === 'error' ? 'max-w-3xl rounded-tl-md border border-[#DC143C]/30 bg-[#DC143C]/10 text-rose-200' : latestAgent ? 'max-w-3xl rounded-tl-md border border-indigo-400/40 bg-slate-900/90 text-slate-200 shadow-glow-strong' : 'max-w-3xl rounded-tl-md border border-indigo-500/20 bg-slate-900/75 text-slate-300 shadow-glow'}`}>{message.text}</div>
                      <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[8px] text-slate-600 ${message.role === 'user' ? 'justify-end' : ''}`}><span>{message.role === 'agent' ? 'NEXORA AGENT' : 'YOU'} · {message.time}</span>{message.evidence && <><span>•</span><span className={message.status === 'placed' ? 'text-emerald-400' : message.status === 'error' ? 'text-rose-400' : 'text-indigo-400'}>{message.evidence}</span></>}</div>
                      {message.products && (
                        <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:overflow-visible">
                          {message.products.map((product, index) => <ProductRecommendationCard key={product.id} product={product} featured={index === 0} onApprove={setSelectedProduct} />)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {activeRun && <AgentThinkingStep steps={activeRun.steps} activeIndex={activeRun.activeIndex} />}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-800/70 bg-slate-950/90 px-4 pb-4 pt-3 backdrop-blur-xl md:px-8 md:pb-6">
          <ChatInput value={input} onChange={setInput} onSubmit={submitMessage} presets={presetQueries} disabled={Boolean(activeRun)} />
        </div>
      </main>

      <CheckoutModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onOrderPlaced={confirmOrderPlaced} />
    </div>
  )
}
