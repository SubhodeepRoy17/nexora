import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, Clock3, HelpCircle, Menu, Plus, Sparkles, User } from 'lucide-react'
import AgentThinkingStep from '../components/chat/AgentThinkingStep'
import ChatInput from '../components/chat/ChatInput'
import CheckoutModal from '../components/chat/CheckoutModal'
import ProductRecommendationCard from '../components/chat/ProductRecommendationCard'
import { useNexora } from '../context/NexoraContext'
import { useAuth } from '../context/AuthContext'
import { initialChatMessages, presetQueries } from '../mock/chatData'
import { extractResults, getApiError, getChatSession, getChatSessions, searchProducts, toAddOnProduct, toRecommendationProduct } from '../services/api'

const liveThinkingSteps = [
  { id: 'parse', label: 'Parsing intent', detail: 'Extracting budget, use case, and required features' },
  { id: 'search', label: 'Searching merchants', detail: 'Querying active, in-stock products in PostgreSQL' },
  { id: 'compare', label: 'Comparing matches', detail: 'Grounding open-model recommendations against live catalog data' },
]

function AgentMark({ active = false }) {
  return <span className={`grid size-8 shrink-0 place-items-center border bg-violet-600 text-white ${active ? 'border-slate-950 shadow-[3px_3px_0_#111827]' : 'border-violet-700'}`}><Sparkles size={14} /></span>
}

export default function BuyerChat() {
  const { buyerMessages: messages, setBuyerMessages: setMessages } = useNexora()
  const { user, loading: authLoading } = useAuth()
  const [input, setInput] = useState('')
  const [activeRun, setActiveRun] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [conversationToken, setConversationToken] = useState(null)
  const [chatSessions, setChatSessions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
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
    if (authLoading) return undefined
    const controller = new AbortController()
    setConversationId(null)
    setConversationToken(null)
    setMessages(initialChatMessages)
    setHistoryError('')
    if (!user) {
      setChatSessions([])
      return () => controller.abort()
    }
    setHistoryLoading(true)
    getChatSessions(controller.signal)
      .then(({ data }) => setChatSessions(extractResults(data)))
      .catch((error) => {
        if (!controller.signal.aborted) setHistoryError(getApiError(error, 'Could not load chat history.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false)
      })
    return () => controller.abort()
  }, [authLoading, user?.id, setMessages])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, activeRun?.activeIndex])

  const startNewIntent = () => {
    clearRunTimers()
    requestRef.current?.abort()
    requestRef.current = null
    setActiveRun(null)
    setConversationId(null)
    setConversationToken(null)
    setMessages(initialChatMessages)
    setInput('')
    setSidebarOpen(false)
  }

  const refreshSessions = async () => {
    if (!user) return
    try {
      const { data } = await getChatSessions()
      setChatSessions(extractResults(data))
    } catch {
      // A completed search remains usable even if the history refresh fails.
    }
  }

  const openChatSession = async (sessionId) => {
    if (activeRun || historyLoading) return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const { data } = await getChatSession(sessionId)
      const restored = data.messages.map((message) => {
        const assistant = message.role === 'ASSISTANT'
        const products = assistant
          ? (message.metadata?.recommendations ?? []).map((item) => ({ ...toRecommendationProduct(item), historical: true }))
          : undefined
        return {
          id: message.message_id,
          role: assistant ? 'agent' : 'user',
          text: message.content,
          products,
          evidence: assistant ? `${products.length} SAVED CATALOG MATCH${products.length === 1 ? '' : 'ES'}` : undefined,
          time: new Date(message.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        }
      })
      setMessages(restored.length ? restored : initialChatMessages)
      setConversationId(data.conversation_id)
      setConversationToken(null)
      setSidebarOpen(false)
    } catch (error) {
      setHistoryError(getApiError(error, 'Could not open this chat.'))
    } finally {
      setHistoryLoading(false)
    }
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
      const { data } = await searchProducts(query, controller.signal, { conversationId, conversationToken })
      if (requestRef.current !== controller) return
      setConversationId(data.conversation_id)
      setConversationToken(data.conversation_token ?? null)
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
        evidence: `${products.length} LIVE CATALOG MATCH${products.length === 1 ? '' : 'ES'}${fallbackUsed ? ' · DETERMINISTIC RETRIEVAL' : ' · OPEN-MODEL GROUNDED'}`,
        products,
        time: 'Now',
      }])
      refreshSessions()
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
    <div className="app-grid flex h-[calc(100dvh-4rem)] min-h-[576px] overflow-hidden bg-[#f6f5f1] text-slate-950">
      {sidebarOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed bottom-0 left-0 top-16 z-40 flex w-[272px] flex-col border-r border-slate-300 bg-white p-4 transition-transform duration-300 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-12 items-center justify-between px-1"><div><p className="text-xs font-semibold text-slate-950">Buyer workspace</p><p className="mt-1 font-mono text-[8px] text-slate-500">PERSONAL SHOPPING AGENT</p></div><button type="button" aria-label="Close navigation" className="text-slate-500 lg:hidden" onClick={() => setSidebarOpen(false)}>×</button></div>
        <button type="button" onClick={startNewIntent} className="focus-ring mt-5 flex w-full items-center justify-center gap-2 border border-slate-950 bg-slate-950 py-3 text-xs font-semibold text-white shadow-[3px_3px_0_#8b5cf6] transition hover:-translate-y-0.5"><Plus size={15} /> New intent</button>

        <div className="mt-7">
          <p className="mono-label px-2 text-slate-400">Recent intents</p>
          <div className="mt-2 space-y-1">
            {!user && <div className="border border-slate-200 bg-slate-50 px-3 py-3 text-[10px] leading-5 text-slate-500">Guest chats stay only on this page and are never listed publicly. Sign in to keep a private history.</div>}
            {user && historyLoading && !chatSessions.length && <p className="px-3 py-3 text-[10px] text-slate-400">Loading your chats…</p>}
            {user && !historyLoading && !chatSessions.length && <p className="px-3 py-3 text-[10px] text-slate-400">Your completed searches will appear here.</p>}
            {user && chatSessions.map((session) => (
              <button key={session.conversation_id} type="button" disabled={Boolean(activeRun) || historyLoading} onClick={() => openChatSession(session.conversation_id)} className={`focus-ring flex w-full items-center gap-3 border px-3 py-3 text-left text-xs transition disabled:cursor-wait disabled:opacity-50 ${conversationId === session.conversation_id ? 'border-violet-200 bg-violet-50 text-violet-900' : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950'}`}>
                <Clock3 size={14} className={conversationId === session.conversation_id ? 'text-violet-600' : ''} /><span className="truncate">{session.title}</span>
              </button>
            ))}
            {historyError && <p className="px-3 py-2 text-[10px] leading-4 text-rose-600">{historyError}</p>}
          </div>
        </div>

        <div className="mt-auto space-y-1 border-t border-slate-200 pt-4">
          <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-xs text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"><HelpCircle size={15} /> Help & feedback</button>
          <div className="flex items-center gap-3 px-3 py-3">
            <div className="grid size-8 place-items-center rounded-full bg-violet-600 text-[10px] font-bold text-white">{user?.display_name?.slice(0, 2).toUpperCase() ?? 'GU'}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-950">{user?.display_name ?? 'Guest buyer'}</p><p className="font-mono text-[8px] text-slate-500">{user ? 'Verified session' : 'Search only · sign in to buy'}</p></div>
            <ChevronDown size={13} className="text-slate-400" />
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-300 bg-white/90 px-4 backdrop-blur-xl md:px-6">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)} className="focus-ring p-2 text-slate-500 lg:hidden"><Menu size={19} /></button>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-sm font-semibold">AI Buyer Agent</h1><span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[8px] text-emerald-700"><span className="size-1 rounded-full bg-emerald-500" /> ONLINE</span></div>
              <p className="mt-1 hidden text-[10px] text-slate-500 sm:block">Grounded discovery · explicit purchase approval{conversationId ? ` · ${conversationId.slice(0, 8)}` : ''}</p>
            </div>
          </div>
        </header>

        <div ref={logRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
            <div className="mb-10 text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center border border-slate-950 bg-violet-600 text-white shadow-[4px_4px_0_#111827]"><Bot size={23} /></div>
              <p className="mono-label text-violet-600">Nexora intelligence</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Ask for the exact fit.</h2>
              <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-600 md:text-sm">Give me constraints, not keywords. I’ll reason across live specs, merchants, price, and availability.</p>
            </div>

            <div className="space-y-7">
              {messages.map((message, messageIndex) => {
                const latestAgent = message.role === 'agent' && !messages.slice(messageIndex + 1).some((item) => item.role === 'agent')
                return (
                  <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'ml-auto max-w-2xl flex-row-reverse' : 'max-w-full'}`}>
                    {message.role === 'agent' ? <AgentMark active={latestAgent} /> : <span className="grid size-8 shrink-0 place-items-center border border-slate-300 bg-white text-slate-500"><User size={13} /></span>}
                    <div className={`min-w-0 ${message.role === 'agent' ? 'w-full' : ''}`}>
                      <div className={`px-4 py-3 text-[13px] leading-6 ${message.role === 'user' ? 'border border-slate-950 bg-slate-950 text-white shadow-[3px_3px_0_#c4b5fd]' : message.status === 'placed' ? 'max-w-3xl border border-emerald-300 bg-emerald-50 text-emerald-950' : message.status === 'error' ? 'max-w-3xl border border-rose-300 bg-rose-50 text-rose-900' : latestAgent ? 'max-w-3xl border border-violet-300 bg-white text-slate-800 shadow-[4px_4px_0_rgba(139,92,246,.18)]' : 'max-w-3xl border border-slate-200 bg-white text-slate-700'}`}>{message.text}</div>
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

        <div className="shrink-0 border-t border-slate-300 bg-white/95 px-4 pb-4 pt-3 backdrop-blur-xl md:px-8 md:pb-6">
          <ChatInput value={input} onChange={setInput} onSubmit={submitMessage} presets={presetQueries} disabled={Boolean(activeRun)} />
        </div>
      </main>

      <CheckoutModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onOrderPlaced={confirmOrderPlaced} />
    </div>
  )
}
