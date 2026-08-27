import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock3, Menu, Plus, Trash2 } from 'lucide-react'
import LogoMark from '../components/LogoMark'
import AgentThinkingStep from '../components/chat/AgentThinkingStep'
import ChatInput from '../components/chat/ChatInput'
import CheckoutModal from '../components/chat/CheckoutModal'
import ProductRecommendationCard from '../components/chat/ProductRecommendationCard'
import BuyerOrders from '../components/chat/BuyerOrders'
import { useNexora } from '../context/NexoraContext'
import { useAuth } from '../context/AuthContext'
import { examplePrompts, onboardingMessages } from '../data/onboarding'
import { deleteChatSession, extractResults, getApiError, getChatSession, getChatSessions, searchProducts, toAddOnProduct, toRecommendationProduct } from '../services/api'

const liveThinkingSteps = [
  {
    id: 'parse',
    label: 'Understanding your request',
  },
  {
    id: 'search',
    label: 'Checking current products',
  },
  {
    id: 'compare',
    label: 'Comparing the best matches',
  },
]

const welcomePrompts = [
  'What are you looking for?',
  'What is your budget?',
  'Which details matter most?',
]

function AgentMark({ active = false }) {
  return (
    <span className={`grid size-9 shrink-0 place-items-center rounded-full border border-violet-200 bg-white shadow-[0_8px_22px_rgba(109,40,217,.1)] ${active ? 'ring-4 ring-violet-100' : ''}`}>
      <LogoMark className="size-6" alt="" />
    </span>
  )
}

const restoreMessages = (data) =>
  data.messages.map((message) => {
    const assistant = message.role === 'ASSISTANT'
    const products = assistant
      ? (message.metadata?.recommendations ?? []).map((item) => ({
          ...toRecommendationProduct(item),
          historical: true,
        }))
      : undefined
    return {
      id: message.message_id,
      role: assistant ? 'agent' : 'user',
      text: message.content,
      products,
      suggestedQuery: assistant ? message.metadata?.suggested_query : undefined,
      time: new Date(message.created_at).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    }
  })

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
  const [deletingConversationId, setDeletingConversationId] = useState(null)
  const [historyError, setHistoryError] = useState('')
  const [orderRefreshNonce, setOrderRefreshNonce] = useState(0)
  const logRef = useRef(null)
  const runTimers = useRef([])
  const requestRef = useRef(null)

  const clearRunTimers = () => {
    runTimers.current.forEach(window.clearTimeout)
    runTimers.current = []
  }

  useEffect(
    () => () => {
      clearRunTimers()
      requestRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    if (authLoading) return undefined
    const controller = new AbortController()
    setConversationId(null)
    setConversationToken(null)
    setMessages(onboardingMessages)
    setHistoryError('')
    if (!user) {
      setChatSessions([])
      return () => controller.abort()
    }
    setHistoryLoading(true)
    getChatSessions(controller.signal)
      .then(async ({ data }) => {
        const sessions = extractResults(data)
        setChatSessions(sessions)
        if (!sessions.length) return
        const { data: latest } = await getChatSession(sessions[0].conversation_id, controller.signal)
        if (controller.signal.aborted) return
        const restored = restoreMessages(latest)
        setMessages(restored.length ? restored : onboardingMessages)
        setConversationId(latest.conversation_id)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setHistoryError(getApiError(error, 'Could not load chat history.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false)
      })
    return () => controller.abort()
  }, [authLoading, user?.id, setMessages])

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, activeRun?.activeIndex])

  const startNewIntent = () => {
    clearRunTimers()
    requestRef.current?.abort()
    requestRef.current = null
    setActiveRun(null)
    setConversationId(null)
    setConversationToken(null)
    setMessages(onboardingMessages)
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
      const restored = restoreMessages(data)
      setMessages(restored.length ? restored : onboardingMessages)
      setConversationId(data.conversation_id)
      setConversationToken(null)
      setSidebarOpen(false)
    } catch (error) {
      setHistoryError(getApiError(error, 'Could not open this chat.'))
    } finally {
      setHistoryLoading(false)
    }
  }

  const removeChatSession = async (sessionId) => {
    if (activeRun || historyLoading || deletingConversationId) return
    setDeletingConversationId(sessionId)
    setHistoryError('')
    try {
      await deleteChatSession(sessionId)
      setChatSessions((current) => current.filter((item) => item.conversation_id !== sessionId))
      if (conversationId === sessionId) startNewIntent()
    } catch (error) {
      setHistoryError(getApiError(error, 'Could not delete this chat history.'))
    } finally {
      setDeletingConversationId(null)
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
      runTimers.current.push(
        window.setTimeout(
          () => {
            setActiveRun((current) => (current ? { ...current, activeIndex: index + 1 } : null))
          },
          (index + 1) * 900,
        ),
      )
    })

    try {
      const { data } = await searchProducts(query, controller.signal, {
        conversationId,
        conversationToken,
      })
      if (requestRef.current !== controller) return
      setConversationId(data.conversation_id)
      setConversationToken(data.conversation_token ?? null)
      let products = (data.recommendations ?? []).map(toRecommendationProduct)
      const addOns = (data.add_on_suggestions ?? []).map(toAddOnProduct)
      if (products.length && addOns.length) {
        products = [{ ...products[0], addOns }, ...products.slice(1)]
      }
      setMessages((current) => [
        ...current,
        {
          id: messageId + 1,
          role: 'agent',
          text: data.summary_reasoning,
          evidence: `${products.length} current match${products.length === 1 ? '' : 'es'} · Details checked`,
          products,
          suggestedQuery: data.suggested_query,
          time: 'Now',
        },
      ])
      refreshSessions()
    } catch (error) {
      if (controller.signal.aborted) return
      setMessages((current) => [
        ...current,
        {
          id: messageId + 1,
          role: 'agent',
          text: getApiError(error, 'I could not complete this catalog search.'),
          evidence: 'SEARCH COULD NOT FINISH · TRY AGAIN',
          time: 'Now',
          status: 'error',
        },
      ])
      setInput(query)
    } finally {
      if (requestRef.current !== controller) return
      clearRunTimers()
      setActiveRun(null)
      requestRef.current = null
    }
  }

  const confirmOrderPlaced = useCallback(
    ({ product, order }) => {
      setMessages((current) => [
        ...current,
        {
          id: Date.now(),
          role: 'agent',
          text: `Razorpay confirmed your payment for ${product.name}. Your order is complete and the reserved stock was updated once.`,
          evidence: `PAID · ${order.order_id}`,
          time: 'Now',
          status: 'placed',
        },
      ])
      setOrderRefreshNonce((value) => value + 1)
    },
    [setMessages],
  )

  const retryOrderSearch = (productTitle) => {
    setInput(productTitle ? `Find an available alternative to ${productTitle}` : '')
  }

  const visibleMessages = messages.filter((message) => !message.fixture)

  return (
    <div className="buyer-shell flex h-[calc(100dvh-4rem)] min-h-[576px] overflow-hidden text-slate-950">
      {sidebarOpen && <button type="button" aria-label="Close navigation" className="fixed bottom-0 left-[288px] right-0 top-16 z-30 bg-[#17372f]/25 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`buyer-sidebar fixed bottom-0 left-0 top-16 z-40 flex w-[288px] flex-col border-r border-emerald-950/10 p-3 transition-transform duration-300 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex justify-end lg:hidden">
          <button type="button" aria-label="Close navigation" className="grid size-8 place-items-center rounded-full text-[#31594f] hover:bg-white/70 lg:hidden" onClick={() => setSidebarOpen(false)}>
            ×
          </button>
        </div>
        <button type="button" aria-label="New intent" onClick={startNewIntent} className="focus-ring mt-2 flex w-full items-center gap-3 rounded-xl border border-emerald-950/10 bg-white/72 px-4 py-3 text-sm font-semibold text-[#17372f] shadow-[0_8px_24px_rgba(49,89,79,.07)] transition hover:-translate-y-0.5 hover:bg-white lg:mt-0">
          <span className="grid size-7 place-items-center rounded-lg bg-[#17372f] text-white">
            <Plus size={14} />
          </span>{' '}
          New search
        </button>

        <div className="mt-6">
          <p className="px-2 text-sm font-semibold text-[#17372f]">Recent searches</p>
          <div className="mt-2 space-y-1">
            {!user && <div className="rounded-xl border border-emerald-950/10 bg-white/55 px-3 py-3 text-xs leading-5 text-[#31594f]/70">Sign in to save your searches.</div>}
            {user && historyLoading && !chatSessions.length && <p className="px-3 py-3 text-xs text-slate-500">Loading…</p>}
            {user && !historyLoading && !chatSessions.length && <p className="px-3 py-3 text-xs text-slate-500">No saved searches yet.</p>}
            {user &&
              chatSessions.map((session) => (
                <div key={session.conversation_id} className="group relative">
                  <button type="button" disabled={Boolean(activeRun) || historyLoading || deletingConversationId === session.conversation_id} onClick={() => openChatSession(session.conversation_id)} className={`focus-ring flex w-full items-center gap-3 rounded-xl border py-3 pl-3 pr-11 text-left text-xs transition disabled:cursor-wait disabled:opacity-50 ${conversationId === session.conversation_id ? 'border-violet-200 bg-white/85 text-violet-900 shadow-sm' : 'border-transparent text-[#31594f]/70 hover:bg-white/65 hover:text-[#17372f]'}`}>
                    <Clock3 size={14} className={conversationId === session.conversation_id ? 'text-violet-600' : ''} />
                    <span className="truncate">{session.title}</span>
                  </button>
                  <button type="button" disabled={Boolean(activeRun) || historyLoading || Boolean(deletingConversationId)} onClick={() => removeChatSession(session.conversation_id)} aria-label={`Delete ${session.title} chat history`} title="Delete chat history" className="focus-ring absolute right-2 top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-md text-rose-600 opacity-100 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-wait disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            {historyError && <p className="px-3 py-2 text-xs leading-5 text-rose-600">{historyError}</p>}
          </div>
        </div>

        <BuyerOrders user={user} refreshNonce={orderRefreshNonce} onRetry={retryOrderSearch} />
      </aside>

      <main className="buyer-main relative flex min-w-0 flex-1 flex-col">
        <button type="button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)} className="focus-ring absolute left-4 top-4 z-20 grid size-10 place-items-center rounded-full border border-emerald-950/10 bg-white/80 text-[#31594f] shadow-sm backdrop-blur hover:bg-white lg:hidden">
          <Menu size={19} />
        </button>

        <div ref={logRef} className="buyer-log flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-12">
            {!visibleMessages.length && (
              <div className="buyer-welcome flex min-h-[34vh] items-end justify-center pb-8 text-center">
                <h1 className="relative min-h-[3.5rem] w-full text-3xl font-semibold tracking-[-.045em] text-[#17372f] md:text-4xl">
                  <span className="sr-only">Tell Nexora what you want to buy</span>
                  <span aria-hidden="true">
                    {welcomePrompts.map((prompt, index) => (
                      <span key={prompt} className="buyer-welcome-prompt absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ animationDelay: `${index * 3}s` }}>{prompt}</span>
                    ))}
                  </span>
                </h1>
              </div>
            )}

            <div className="space-y-7">
              {visibleMessages.map((message, messageIndex) => {
                const latestAgent = message.role === 'agent' && !visibleMessages.slice(messageIndex + 1).some((item) => item.role === 'agent')
                return (
                  <div key={message.id} className={`buyer-message flex gap-3 ${message.role === 'user' ? 'ml-auto max-w-2xl flex-row-reverse' : 'max-w-full'}`}>
                    {message.role === 'agent' && <AgentMark active={latestAgent} />}
                    <div className={`min-w-0 ${message.role === 'agent' ? 'w-full' : ''}`}>
                      <div className={`text-[13px] leading-6 ${message.role === 'user' ? 'rounded-[1.4rem] rounded-br-md bg-[#17372f] px-4 py-3 text-white shadow-[0_10px_25px_rgba(23,55,47,.16)]' : message.status === 'placed' ? 'max-w-3xl rounded-2xl border border-emerald-300 bg-emerald-50/90 px-4 py-3 text-emerald-950' : message.status === 'error' ? 'max-w-3xl rounded-2xl border border-rose-300 bg-rose-50/90 px-4 py-3 text-rose-900' : 'max-w-3xl px-1 py-1 text-[#294b43]'}`}>{message.text}</div>
                      {message.products?.length > 0 && message.evidence && <p className="mt-2 text-xs font-medium text-violet-700">{message.evidence}</p>}
                      {message.products && (
                        <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:overflow-visible">
                          {message.products.map((product, index) => (
                            <ProductRecommendationCard key={product.id} product={product} featured={index === 0} onApprove={setSelectedProduct} />
                          ))}
                        </div>
                      )}
                      {message.products?.length === 0 && !message.fixture && message.status !== 'error' && (
                        <button type="button" onClick={() => setInput(message.suggestedQuery || 'Show me similar active, in-stock products with fewer constraints')} className="focus-ring mt-3 rounded-full border border-violet-300 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100">
                          Try the suggested search
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {activeRun && <AgentThinkingStep />}
            </div>
          </div>
        </div>

        <div className="buyer-composer shrink-0 px-4 pb-4 pt-3 md:px-8 md:pb-6">
          <div aria-live="polite" className="sr-only">
            {activeRun ? liveThinkingSteps[activeRun.activeIndex].label : messages.at(-1)?.status === 'error' ? messages.at(-1).text : ''}
          </div>
          <ChatInput value={input} onChange={setInput} onSubmit={submitMessage} presets={examplePrompts} disabled={Boolean(activeRun)} />
        </div>
      </main>

      <CheckoutModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onOrderPlaced={confirmOrderPlaced} />
    </div>
  )
}
