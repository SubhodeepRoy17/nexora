import axios from 'axios'

const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.trim()
if (import.meta.env.PROD && !configuredApiUrl) {
  throw new Error('VITE_API_BASE_URL is required for a production build.')
}
export const API_BASE_URL = configuredApiUrl ?? 'http://localhost:8000/api/'
export const AGENT_SEARCH_TIMEOUT_MS = 55000

export function apiUsesCrossOriginCredentials() {
  if (typeof window === 'undefined') return false
  return new URL(API_BASE_URL, window.location.origin).origin !== window.location.origin
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  withCredentials: true,
})

let csrfToken = ''

export function setCsrfToken(value) {
  csrfToken = value ?? ''
}

api.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase()
  if (csrfToken && !['get', 'head', 'options', 'trace'].includes(method)) {
    config.headers['X-CSRFToken'] = csrfToken
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexora:auth-expired'))
    }
    return Promise.reject(error)
  },
)

export function getApiError(error, fallback = 'Something went wrong. Please try again.') {
  const payload = error?.response?.data
  if (typeof payload?.detail === 'string') return payload.detail
  if (payload && typeof payload === 'object') {
    const first = Object.values(payload).flat().find((value) => typeof value === 'string')
    if (first) return first
  }
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.'
  if (error?.code === 'RAZORPAY_SDK_LOAD_FAILED') return 'Razorpay Checkout could not load. Check your internet connection or content blocker, then retry.'
  if (!error?.response) return 'Nexora is unavailable right now. Please try again in a moment.'
  return fallback
}

export const searchProducts = (query, signal, conversation = {}) => api.post('agents/search/', {
  query,
  ...(conversation.conversationId ? { conversation_id: conversation.conversationId } : {}),
  ...(conversation.conversationToken ? { conversation_token: conversation.conversationToken } : {}),
  ...(conversation.editMessageId ? { edit_message_id: conversation.editMessageId } : {}),
}, { signal, timeout: AGENT_SEARCH_TIMEOUT_MS })
export const getChatSessions = (signal, query = '') => api.get('agents/conversations/', {
  signal,
  ...(query.trim() ? { params: { q: query.trim() } } : {}),
})
export const getChatSession = (conversationId, signal) => api.get(`agents/conversations/${conversationId}/`, { signal })
export const renameChatSession = (conversationId, title) => api.patch(`agents/conversations/${conversationId}/`, { title })
export const deleteChatSession = (conversationId) => api.delete(`agents/conversations/${conversationId}/`)
export const shareChatSession = (conversationId) => api.post(`agents/conversations/${conversationId}/share/`, {})
export const getSharedChatSession = (shareToken, signal) => api.get(`agents/shared-conversations/${shareToken}/`, { signal })
export const respondToGrowthOffer = ({ offerId, offerToken, accepted }) => api.post(
  `agents/growth-offers/${offerId}/respond/`,
  { offer_token: offerToken, accepted },
)

export const getCurrentUser = () => api.get('auth/me/')
export const loginAccount = ({ username, password }) => api.post('auth/login/', { username, password })
export const registerAccount = (payload) => api.post('auth/register/', payload)
export const logoutAccount = () => api.post('auth/logout/')

export const newIdempotencyKey = (prefix = 'nexora') => `${prefix}-${crypto.randomUUID()}`
export const createCart = (items) => api.post('orders/carts/', { items })
export const createCartQuote = (cartId) => api.post(`orders/carts/${cartId}/quote/`, {})
export const createQuote = ({ decisionId, decisionToken, quantity = 1 }) => api.post('orders/quotes/', {
  decision_id: decisionId, decision_token: decisionToken, quantity,
})
export const approveQuote = (quoteId, idempotencyKey) => api.post(
  `orders/quotes/${quoteId}/approve/`,
  { confirmed: true },
  { headers: { 'Idempotency-Key': idempotencyKey } },
)
export const createOrder = ({ quoteId, approvalToken, idempotencyKey }) => api.post(
  'orders/create/',
  { quote_id: quoteId, approval_token: approvalToken },
  { headers: { 'Idempotency-Key': idempotencyKey } },
)
export const getOrder = (orderId, signal) => api.get(`orders/${orderId}/`, { signal })
export const getOrders = (signal) => api.get('orders/', { signal })
export const cancelOrder = (orderId) => api.post(`orders/${orderId}/cancel/`, {})
export const verifyCheckoutPayment = (orderId, payload) => api.post(
  `orders/${orderId}/payment-status/`,
  payload,
)

export const getProducts = (signal) => api.get('merchants/products/', { signal })
export const getMerchantWorkspace = (signal) => api.get('merchants/workspace/', { signal })
export const patchProduct = (productId, payload) => api.patch(`merchants/products/${productId}/`, payload)
export const createProduct = (payload) => api.post('merchants/products/', payload)
export const getProductRelationships = (signal) => api.get('merchants/product-relationships/', { signal })
export const createProductRelationship = (payload) => api.post('merchants/product-relationships/', payload)
export const patchProductRelationship = (relationshipId, payload) => api.patch(`merchants/product-relationships/${relationshipId}/`, payload)
export const deleteProductRelationship = (relationshipId) => api.delete(`merchants/product-relationships/${relationshipId}/`)
export const getAgentAudits = (signal) => api.get('orders/audits/', { signal })
export const getMoneyAudits = (signal) => api.get('orders/money-audits/', { signal })
export const getMerchantAnalytics = (signal) => api.get('merchants/analytics/', { signal })

export function extractResults(payload) {
  return Array.isArray(payload) ? payload : payload?.results ?? []
}

const connectivityLabel = (specifications = {}) => {
  if (Array.isArray(specifications.connectivity)) return specifications.connectivity.join(' + ')
  return specifications.wireless ?? 'See connectivity details'
}

const batteryLabel = (specifications = {}) => {
  if (specifications.battery_life_hours != null) return `${specifications.battery_life_hours} hours`
  return specifications.battery_life ?? 'Not specified'
}

export function toRecommendationProduct(recommendation) {
  const specifications = recommendation.key_specs ?? {}
  const title = recommendation.title ?? 'Catalog product'
  return {
    id: Number(recommendation.product_id),
    name: title,
    imageLabel: title.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(),
    matchScore: Number(recommendation.match_score ?? 0),
    price: Number(recommendation.price ?? 0),
    originalPrice: recommendation.compare_at_price == null ? null : Number(recommendation.compare_at_price),
    imageUrl: recommendation.image_url ?? '',
    merchant: { name: recommendation.merchant ?? 'Nexora merchant', verified: true },
    stock: recommendation.stock_quantity > 0 ? `${recommendation.stock_quantity} in stock` : 'Available from merchant',
    delivery: 'Fulfilled by the verified merchant',
    reason: recommendation.reason ?? 'Matched against the live merchant catalog.',
    tradeoffs: recommendation.tradeoffs ?? [],
    category: recommendation.category ?? '',
    rating: Number(recommendation.rating ?? 0),
    decisionId: recommendation.decision_id,
    decisionToken: recommendation.decision_token,
    specs: {
      ...specifications,
      layout: specifications.layout ?? 'Not specified',
      wireless: connectivityLabel(specifications),
      hotSwappable: specifications.hot_swappable == null ? 'Not specified' : specifications.hot_swappable ? 'Yes' : 'No',
      switches: specifications.switches ?? 'Not specified',
      battery: batteryLabel(specifications),
      keycaps: specifications.keycaps ?? 'Not specified',
    },
  }
}

export function toAddOnProduct(suggestion) {
  return {
    id: Number(suggestion.product_id),
    name: suggestion.title,
    merchant: { name: suggestion.merchant, verified: true },
    price: Number(suggestion.incremental_cost),
    stock: `${suggestion.stock_quantity} in stock`,
    relationshipType: suggestion.relationship_type,
    offerLabel: suggestion.offer_label,
    compatibility: suggestion.compatibility ?? {},
    constraintEvidence: suggestion.constraint_evidence ?? [],
    benefit: suggestion.benefit,
    tradeOff: suggestion.trade_off,
    specs: suggestion.key_specs ?? {},
    offerId: suggestion.offer_id,
    offerToken: suggestion.offer_token,
    decisionId: suggestion.decision_id,
    decisionToken: suggestion.decision_token,
  }
}

export function toInventoryProduct(product) {
  const specifications = product.specifications ?? {}
  return {
    id: Number(product.id),
    merchantId: Number(product.merchant),
    merchantName: product.merchant_name,
    sku: `NXR-${String(product.id).padStart(5, '0')}`,
    name: product.title,
    description: product.description ?? '',
    category: product.category,
    price: Number(product.price),
    stock: Number(product.stock_quantity),
    active: Boolean(product.is_active),
    rating: Number(product.rating),
    agentViews: Number(product.agent_impressions ?? 0),
    conversions: Number(product.paid_conversions ?? 0),
    tags: product.tags ?? [],
    specs: {
      ...specifications,
      wireless: connectivityLabel(specifications),
      battery_life: batteryLabel(specifications),
    },
  }
}

const relativeTime = (dateValue) => {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(dateValue).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
  return new Date(dateValue).toLocaleDateString('en-IN')
}

const maskBuyer = (email = '') => {
  const [name = 'buyer'] = email.split('@')
  return `Buyer ···${name.slice(-4).toUpperCase()}`
}

export function toTimelineEvent(audit) {
  const status = audit.conversion_status
  return {
    id: `evt-${audit.id}`,
    agent: 'Nexora Agent',
    type: status === 'PURCHASED' ? 'converted' : status === 'REJECTED' ? 'lost' : 'recommended',
    product: audit.product_titles?.join(', ') || audit.product_title || 'Basket',
    buyer: audit.buyer_reference ?? maskBuyer(),
    reason: audit.agent_thought_summary,
    time: relativeTime(audit.created_at),
    score: null,
    amount: status === 'PURCHASED' ? Number(audit.total_amount) : null,
    orderId: audit.order,
  }
}

export function toMoneyTimelineEvent(audit) {
  const paid = audit.action === 'PAYMENT_CAPTURED'
  const warning = ['BLOCKED', 'FAILED', 'REFUND_PENDING', 'MANUAL_REVIEW'].includes(audit.outcome)
  const refunded = audit.action === 'REFUND_PROCESSED' || audit.outcome === 'REFUNDED'
  return {
    id: `money-${audit.audit_id}`,
    agent: 'Nexora Guardrail',
    type: paid ? 'converted' : refunded ? 'refunded' : warning ? 'warning' : 'recommended',
    actionLabel: audit.action.replaceAll('_', ' '),
    product: audit.product_title ?? 'Money action',
    buyer: audit.buyer_reference,
    reason: audit.summary,
    time: relativeTime(audit.created_at),
    score: null,
    amount: paid ? Number(audit.approved_amount) : null,
    orderId: audit.order,
  }
}

export function toProductPayload(product) {
  const rawBattery = String(product.specs?.battery_life ?? '')
  const batteryHours = Number.parseFloat(rawBattery.replace(/[^0-9.]/g, ''))
  const connectivity = String(product.specs?.wireless ?? '')
    .split(/\s*\+\s*|\s*,\s*/)
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    title: product.name,
    description: product.description ?? '',
    category: product.category,
    price: product.price,
    stock_quantity: product.stock,
    rating: product.rating ?? 0,
    is_active: product.active,
    specifications: {
      switches: product.specs?.switches || undefined,
      connectivity,
      battery_life_hours: Number.isFinite(batteryHours) ? batteryHours : undefined,
      layout: product.specs?.layout || undefined,
      keycaps: product.specs?.keycaps || undefined,
      hot_swappable: Boolean(product.specs?.hot_swappable),
    },
    tags: product.tags ?? [],
  }
}

let razorpayScriptPromise

export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(true)
  if (razorpayScriptPromise) return razorpayScriptPromise

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-nexora-razorpay]')
    if (existing) existing.remove()

    const script = document.createElement('script')
    const fail = () => {
      window.clearTimeout(timeout)
      script.remove()
      razorpayScriptPromise = undefined
      const error = new Error('Razorpay Checkout failed to load.')
      error.code = 'RAZORPAY_SDK_LOAD_FAILED'
      reject(error)
    }
    const timeout = window.setTimeout(fail, 15000)
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.dataset.nexoraRazorpay = 'true'
    script.onload = () => {
      window.clearTimeout(timeout)
      if (!window.Razorpay) {
        fail()
        return
      }
      resolve(true)
    }
    script.onerror = fail
    document.body.appendChild(script)
  })

  return razorpayScriptPromise
}
