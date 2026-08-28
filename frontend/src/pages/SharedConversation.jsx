import { useEffect, useState } from 'react'
import { ArrowRight, MessageCircle, ShoppingBag } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import LogoMark from '../components/LogoMark'
import { getApiError, getSharedChatSession } from '../services/api'

export default function SharedConversation() {
  const { shareToken } = useParams()
  const [state, setState] = useState({ loading: true, conversation: null, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    getSharedChatSession(shareToken, controller.signal)
      .then(({ data }) => setState({ loading: false, conversation: data, error: '' }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ loading: false, conversation: null, error: getApiError(error, 'This shared chat is unavailable.') })
        }
      })
    return () => controller.abort()
  }, [shareToken])

  return (
    <main className="min-h-dvh bg-[#f8faf6] px-4 pb-16 pt-24 text-slate-950 sm:px-6 sm:pt-28">
      <div className="mx-auto max-w-3xl">
        {state.loading && <p className="py-24 text-center text-sm text-[#31594f]">Opening shared chat…</p>}
        {state.error && (
          <section className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-[0_20px_60px_rgba(42,81,68,.08)]">
            <h1 className="text-2xl font-semibold text-[#17372f]">Shared chat unavailable</h1>
            <p className="mt-3 text-sm text-rose-700">{state.error}</p>
            <Link to="/buyer" className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-[#17372f] px-5 py-3 text-xs font-semibold text-white">Start your own search <ArrowRight size={14} /></Link>
          </section>
        )}
        {state.conversation && (
          <>
            <header className="border-b border-emerald-950/10 pb-7">
              <div className="flex items-center gap-3 text-xs font-semibold text-[#31594f]"><MessageCircle size={15} /> Shared Nexora chat</div>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-.04em] text-[#17372f] sm:text-4xl">{state.conversation.title}</h1>
              <p className="mt-3 text-sm text-[#31594f]/70">This is a read-only copy of a shopping conversation.</p>
            </header>
            <div className="mt-8 space-y-7">
              {state.conversation.messages.map((message) => {
                const assistant = message.role === 'ASSISTANT'
                const recommendations = assistant ? message.metadata?.recommendations ?? [] : []
                return (
                  <article key={message.message_id} className={`flex gap-3 ${assistant ? '' : 'justify-end'}`}>
                    {assistant && <span className="grid size-9 shrink-0 place-items-center rounded-full border border-violet-200 bg-white"><LogoMark className="size-6" alt="" /></span>}
                    <div className={assistant ? 'min-w-0 flex-1' : 'max-w-2xl'}>
                      <p className={`text-[13px] leading-6 ${assistant ? 'text-[#294b43]' : 'rounded-[1.4rem] rounded-br-md bg-[#17372f] px-4 py-3 text-white'}`}>{message.content}</p>
                      {recommendations.length > 0 && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {recommendations.map((product) => (
                            <div key={product.product_id} className="rounded-2xl border border-emerald-950/10 bg-white p-4 shadow-[0_10px_28px_rgba(42,81,68,.06)]">
                              <div className="flex items-start gap-3"><ShoppingBag size={16} className="mt-0.5 shrink-0 text-violet-700" /><div><p className="text-sm font-semibold text-[#17372f]">{product.title}</p><p className="mt-1 text-xs text-[#31594f]/65">{product.merchant}</p>{product.price && <p className="mt-2 text-sm font-semibold">₹{Number(product.price).toLocaleString('en-IN')}</p>}</div></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
            <div className="mt-10 border-t border-emerald-950/10 pt-6 text-center">
              <Link to="/buyer" className="focus-ring inline-flex items-center gap-2 rounded-full bg-[#17372f] px-6 py-3 text-xs font-semibold text-white transition hover:bg-violet-700">Shop with Nexora <ArrowRight size={14} /></Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
