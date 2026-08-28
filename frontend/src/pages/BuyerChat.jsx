import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clock3, Copy, Pencil, Plus, Share2, SquarePen, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import Brand from '../components/Brand'
import LogoMark from '../components/LogoMark'
import { WorkspaceAccountMenu, WorkspaceSidebarToggle } from '../components/common/WorkspaceSidebarControls'
import AgentThinkingStep from '../components/chat/AgentThinkingStep'
import ChatInput from '../components/chat/ChatInput'
import CheckoutModal from '../components/chat/CheckoutModal'
import ProductRecommendationCard from '../components/chat/ProductRecommendationCard'
import BuyerOrders from '../components/chat/BuyerOrders'
import { useNexora } from '../context/NexoraContext'
import { useAuth } from '../context/AuthContext'
import { examplePrompts, onboardingMessages } from '../data/onboarding'
import { deleteChatSession, extractResults, getApiError, getChatSession, getChatSessions, searchProducts, shareChatSession, toAddOnProduct, toRecommendationProduct } from '../services/api'
import useWorkspaceSidebar from '../hooks/useWorkspaceSidebar'

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

const sortChatSessions = (sessions) =>
  [...sessions].sort((left, right) => {
    const activityDifference = Date.parse(right.updated_at ?? 0) - Date.parse(left.updated_at ?? 0)
    return activityDifference || String(right.conversation_id).localeCompare(String(left.conversation_id))
  })

const copyToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  if (!copied) throw new Error('Copy is not available in this browser.')
}

function AgentMark({ active = false }) {
  return (
    <span className={`grid size-9 shrink-0 place-items-center rounded-full border border-violet-200 bg-white shadow-[0_8px_22px_rgba(109,40,217,.1)] ${active ? 'ring-4 ring-violet-100' : ''}`}>
      <LogoMark className="size-6" alt="" />
    </span>
  )
}

function TypingText({ text, animate = false }) {
  const content = String(text ?? '')
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [visibleLength, setVisibleLength] = useState(animate && !reduceMotion ? 0 : content.length)

  useEffect(() => {
    if (!animate || reduceMotion) {
      setVisibleLength(content.length)
      return undefined
    }

    setVisibleLength(0)
    const charactersPerStep = Math.max(1, Math.ceil(content.length / 70))
    const timer = window.setInterval(() => {
      setVisibleLength((current) => {
        const next = Math.min(content.length, current + charactersPerStep)
        if (next === content.length) window.clearInterval(timer)
        return next
      })
    }, 20)
    return () => window.clearInterval(timer)
  }, [animate, content, reduceMotion])

  const typing = visibleLength < content.length
  return (
    <span aria-label={content} className={typing ? 'buyer-response-typing' : undefined}>
      {content.slice(0, visibleLength)}
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
      persisted: true,
      products,
      suggestedQuery: assistant ? message.metadata?.suggested_query : undefined,
      turnType: assistant ? message.metadata?.turn_type : undefined,
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
  const { open: sidebarOpen, setOpen: setSidebarOpen, closeOnMobile: closeSidebarOnMobile } = useWorkspaceSidebar()
  const [conversationId, setConversationId] = useState(null)
  const [conversationToken, setConversationToken] = useState(null)
  const [chatSessions, setChatSessions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [deletingConversationId, setDeletingConversationId] = useState(null)
  const [historyError, setHistoryError] = useState('')
  const [shareStatus, setShareStatus] = useState('idle')
  const [copiedMessageId, setCopiedMessageId] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
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
    setEditingMessage(null)
    setShareStatus('idle')
    setHistoryError('')
    if (!user) {
      setChatSessions([])
      return () => controller.abort()
    }
    setHistoryLoading(true)
    getChatSessions(controller.signal)
      .then(async ({ data }) => {
        const sessions = sortChatSessions(extractResults(data))
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
    setEditingMessage(null)
    setShareStatus('idle')
    closeSidebarOnMobile()
  }

  const refreshSessions = async () => {
    if (!user) return
    try {
      const { data } = await getChatSessions()
      setChatSessions(sortChatSessions(extractResults(data)))
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
      setEditingMessage(null)
      setShareStatus('idle')
      closeSidebarOnMobile()
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

  const copyMessage = async (message) => {
    try {
      await copyToClipboard(message.text)
      setCopiedMessageId(message.id)
      window.setTimeout(() => setCopiedMessageId((current) => (current === message.id ? null : current)), 1600)
    } catch {
      setHistoryError('This browser could not copy the message.')
    }
  }

  const shareCurrentChat = async () => {
    if (!conversationId || !user || shareStatus === 'loading') return
    setShareStatus('loading')
    setHistoryError('')
    try {
      const { data } = await shareChatSession(conversationId)
      const shareUrl = `${window.location.origin}/share/${data.share_token}`
      await copyToClipboard(shareUrl)
      setShareStatus('copied')
      window.setTimeout(() => setShareStatus('idle'), 2200)
    } catch (error) {
      setShareStatus('error')
      setHistoryError(getApiError(error, 'Could not create a share link.'))
    }
  }

  const submitMessage = async (rawQuery, { editMessageId = null } = {}) => {
    const query = rawQuery.trim()
    if (!query || activeRun) return

    clearRunTimers()
    const controller = new AbortController()
    requestRef.current = controller
    const messageId = globalThis.crypto?.randomUUID?.() ?? String(Date.now())
    const previousMessages = editMessageId ? messages : null
    setMessages((current) => {
      const nextUserMessage = { id: messageId, role: 'user', text: query, time: 'Now', persisted: false }
      if (!editMessageId) return [...current, nextUserMessage]
      const editIndex = current.findIndex((message) => String(message.id) === String(editMessageId))
      return [...(editIndex >= 0 ? current.slice(0, editIndex) : current), nextUserMessage]
    })
    setEditingMessage(null)
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
        ...(editMessageId ? { editMessageId } : {}),
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
        ...current.map((message) =>
          message.id === messageId && data.user_message_id
            ? { ...message, id: data.user_message_id, persisted: true }
            : message,
        ),
        {
          id: data.assistant_message_id ?? `${messageId}-reply`,
          role: 'agent',
          text: data.summary_reasoning,
          animateText: true,
          products,
          suggestedQuery: data.suggested_query,
          turnType: data.turn_type,
          time: 'Now',
        },
      ])
      if (user) {
        setChatSessions((current) => {
          const activeSession = current.find((session) => session.conversation_id === data.conversation_id)
          if (!activeSession) return current
          return [
            { ...activeSession, updated_at: new Date().toISOString() },
            ...current.filter((session) => session.conversation_id !== data.conversation_id),
          ]
        })
      }
      refreshSessions()
    } catch (error) {
      if (controller.signal.aborted) return
      if (editMessageId) {
        setMessages(previousMessages)
        setEditingMessage({ id: editMessageId, text: query })
        setHistoryError(getApiError(error, 'Could not update this message.'))
        return
      }
      setMessages((current) => [
        ...current,
        {
          id: `${messageId}-error`,
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
    <div className="buyer-shell flex h-dvh min-h-[576px] overflow-hidden text-slate-950">
      {sidebarOpen && <button type="button" aria-label="Close navigation" className="fixed bottom-0 left-[288px] right-0 top-0 z-[65] bg-[#17372f]/25 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside
        id="buyer-history-sidebar"
        aria-label="Buyer conversations"
        className={`buyer-sidebar fixed bottom-0 left-0 top-0 z-[70] flex shrink-0 flex-col overflow-visible border-r border-emerald-950/10 transition-[transform,width,padding] duration-300 ease-out lg:static lg:inset-auto ${sidebarOpen ? 'w-[288px] translate-x-0 p-3' : 'w-[288px] -translate-x-full p-2 lg:w-[72px] lg:translate-x-0'}`}
      >
        {sidebarOpen ? (
          <>
            <div className="flex items-center justify-between gap-3 px-1">
              <Link to="/" aria-label="Nexora home" className="focus-ring min-w-0 shrink-0 rounded-md"><Brand /></Link>
              <WorkspaceSidebarToggle open onToggle={() => setSidebarOpen(false)} controls="buyer-history-sidebar" />
            </div>

            <button type="button" aria-label="New intent" onClick={startNewIntent} className="focus-ring mt-3 flex w-full items-center gap-3 rounded-xl border border-emerald-950/10 bg-white/72 px-3 py-2.5 text-sm font-semibold text-[#17372f] shadow-[0_8px_24px_rgba(49,89,79,.07)] transition hover:bg-white">
              <span className="grid size-8 place-items-center rounded-lg bg-[#17372f] text-white">
                <SquarePen size={15} />
              </span>
              New search
            </button>

            <div className="modal-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mt-3">
                <p className="px-2 text-xs font-semibold text-[#17372f]/75">Recent searches</p>
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
            </div>

            <div className="mt-3 border-t border-emerald-950/10 pt-3">
              <WorkspaceAccountMenu user={user} />
            </div>
          </>
        ) : (
          <div className="hidden h-full w-full flex-col items-center lg:flex">
            <Link to="/" aria-label="Nexora home" className="focus-ring mt-1 rounded-xl"><LogoMark className="size-8 shrink-0" alt="" /></Link>
            <div className="mt-3">
              <WorkspaceSidebarToggle open={false} onToggle={() => setSidebarOpen(true)} controls="buyer-history-sidebar" label="Expand sidebar" />
            </div>
            <button type="button" aria-label="New search" title="New search" onClick={startNewIntent} className="focus-ring mt-2 grid size-10 place-items-center rounded-xl text-[#31594f] transition hover:bg-white/75 hover:text-[#17372f]">
              <Plus size={20} strokeWidth={1.8} />
            </button>
            <div className="mt-auto pb-1">
              <WorkspaceAccountMenu user={user} compact />
            </div>
          </div>
        )}
      </aside>

      <main className="buyer-main relative flex min-w-0 flex-1 flex-col pt-16">
        {!sidebarOpen && (
          <div className="absolute left-3 top-[4.75rem] z-20 lg:hidden">
            <WorkspaceSidebarToggle open={false} onToggle={() => setSidebarOpen(true)} controls="buyer-history-sidebar" />
          </div>
        )}
        {user && conversationId && (
          <button
            type="button"
            onClick={shareCurrentChat}
            disabled={shareStatus === 'loading'}
            aria-label={shareStatus === 'copied' ? 'Share link copied' : shareStatus === 'error' ? 'Share failed, try again' : 'Share current chat'}
            className={`focus-ring absolute right-3 top-[4.75rem] z-20 flex h-9 items-center gap-2 rounded-full border bg-white/85 px-3 text-xs font-semibold shadow-[0_8px_22px_rgba(42,81,68,.09)] backdrop-blur transition hover:bg-white disabled:cursor-wait sm:right-5 ${shareStatus === 'error' ? 'border-rose-200 text-rose-700' : 'border-emerald-950/10 text-[#17372f]'}`}
          >
            {shareStatus === 'copied' ? <Check size={14} className="text-emerald-600" /> : <Share2 size={14} />}
            <span className="hidden sm:inline">{shareStatus === 'loading' ? 'Creating link…' : shareStatus === 'copied' ? 'Link copied' : shareStatus === 'error' ? 'Try again' : 'Share'}</span>
          </button>
        )}

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
                const editing = message.role === 'user' && String(editingMessage?.id) === String(message.id)
                return (
                  <div key={message.id} className={`buyer-message group flex gap-3 ${message.role === 'user' ? 'ml-auto max-w-2xl flex-row-reverse' : 'max-w-full'}`}>
                    {message.role === 'agent' && <AgentMark active={latestAgent} />}
                    <div className={`min-w-0 ${message.role === 'agent' ? 'w-full' : ''}`}>
                      {editing ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault()
                            submitMessage(editingMessage.text, { editMessageId: message.id })
                          }}
                          className="w-[min(78vw,38rem)] rounded-2xl border border-[#17372f]/15 bg-white p-3 shadow-[0_16px_38px_rgba(42,81,68,.12)]"
                        >
                          <textarea
                            autoFocus
                            rows={3}
                            maxLength={2000}
                            aria-label="Edit message"
                            value={editingMessage.text}
                            onChange={(event) => setEditingMessage((current) => ({ ...current, text: event.target.value }))}
                            className="focus-ring min-h-20 w-full resize-none rounded-xl bg-[#f4f7f1] px-3 py-2.5 text-[13px] leading-6 text-[#17372f]"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingMessage(null)} className="focus-ring rounded-full px-4 py-2 text-xs font-semibold text-[#31594f] hover:bg-[#edf3ea]">Cancel</button>
                            <button type="submit" disabled={!editingMessage.text.trim()} className="focus-ring rounded-full bg-[#17372f] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Send</button>
                          </div>
                        </form>
                      ) : (
                        <div className={`text-[13px] leading-6 ${message.role === 'user' ? 'rounded-[1.4rem] rounded-br-md bg-[#17372f] px-4 py-3 text-white shadow-[0_10px_25px_rgba(23,55,47,.16)]' : message.status === 'placed' ? 'max-w-3xl rounded-2xl border border-emerald-300 bg-emerald-50/90 px-4 py-3 text-emerald-950' : message.status === 'error' ? 'max-w-3xl rounded-2xl border border-rose-300 bg-rose-50/90 px-4 py-3 text-rose-900' : 'max-w-3xl px-1 py-1 text-[#294b43]'}`}>
                          {message.role === 'agent' ? <TypingText text={message.text} animate={message.animateText} /> : message.text}
                        </div>
                      )}
                      {message.role === 'user' && !editing && (
                        <div className="mt-1.5 flex justify-end gap-1 text-[#31594f]/65 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <button type="button" onClick={() => copyMessage(message)} aria-label="Copy message" title="Copy message" className="focus-ring grid size-8 place-items-center rounded-lg hover:bg-white hover:text-[#17372f]">
                            {copiedMessageId === message.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                          </button>
                          {message.persisted !== false && (
                            <button type="button" disabled={Boolean(activeRun)} onClick={() => setEditingMessage({ id: message.id, text: message.text })} aria-label="Edit message" title="Edit message" className="focus-ring grid size-8 place-items-center rounded-lg hover:bg-white hover:text-[#17372f] disabled:cursor-wait disabled:opacity-40">
                              <Pencil size={14} />
                            </button>
                          )}
                        </div>
                      )}
                      {message.products && (
                        <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:overflow-visible">
                          {message.products.map((product, index) => (
                            <ProductRecommendationCard key={product.id} product={product} featured={index === 0} onApprove={setSelectedProduct} />
                          ))}
                        </div>
                      )}
                      {message.products?.length === 0 && message.suggestedQuery && !message.fixture && message.status !== 'error' && (
                        <button type="button" onClick={() => setInput(message.suggestedQuery)} className="focus-ring mt-3 rounded-full border border-violet-300 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100">
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
