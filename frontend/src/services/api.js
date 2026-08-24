import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

export function getApiError(error, fallback = 'Something went wrong. Please try again.') {
  const payload = error?.response?.data
  if (typeof payload?.detail === 'string') return payload.detail
  if (payload && typeof payload === 'object') {
    const first = Object.values(payload).flat().find((value) => typeof value === 'string')
    if (first) return first
  }
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.'
  if (!error?.response) return 'Cannot reach the Nexora backend. Make sure Django is running on port 8000.'
  return fallback
}

export const searchProducts = (query, signal) => api.post('agents/search/', { query }, { signal })

export const createOrder = ({ productId, quantity = 1, buyerEmail }) => api.post('orders/create/', {
  product_id: Number(productId),
  quantity,
  buyer_email: buyerEmail,
})

export const getProducts = (signal) => api.get('merchants/products/', { signal })
export const patchProduct = (productId, payload) => api.patch(`merchants/products/${productId}/`, payload)
export const createProduct = (payload) => api.post('merchants/products/', payload)
export const getAgentAudits = (signal) => api.get('orders/audits/', { signal })
export const getMerchantAnalytics = (merchantId, signal) => api.get('merchants/analytics/', {
  params: merchantId ? { merchant: merchantId } : undefined,
  signal,
})

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
    originalPrice: null,
    merchant: { name: recommendation.merchant ?? 'Nexora merchant', verified: true },
    stock: recommendation.stock_quantity > 0 ? `${recommendation.stock_quantity} in stock` : 'Available from merchant',
    delivery: 'Fulfilled by the verified merchant',
    reason: recommendation.reason ?? 'Matched against the live merchant catalog.',
    tradeoffs: recommendation.tradeoffs ?? [],
    category: recommendation.category ?? '',
    rating: Number(recommendation.rating ?? 0),
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
    compareAt: Number(product.price),
    stock: Number(product.stock_quantity),
    active: Boolean(product.is_active),
    rating: Number(product.rating),
    agentViews: 0,
    conversions: 0,
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
    product: audit.product_title,
    buyer: maskBuyer(audit.buyer_email),
    reason: audit.agent_thought_summary,
    time: relativeTime(audit.created_at),
    score: null,
    amount: status === 'PURCHASED' ? Number(audit.total_amount) : null,
    orderId: audit.order,
  }
}

export function toProductPayload(product, fallbackMerchantId) {
  const rawBattery = String(product.specs?.battery_life ?? '')
  const batteryHours = Number.parseFloat(rawBattery.replace(/[^0-9.]/g, ''))
  const connectivity = String(product.specs?.wireless ?? '')
    .split(/\s*\+\s*|\s*,\s*/)
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    merchant: product.merchantId ?? fallbackMerchantId,
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
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true })
      existing.addEventListener('error', () => reject(new Error('Razorpay Checkout failed to load.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.dataset.nexoraRazorpay = 'true'
    script.onload = () => resolve(true)
    script.onerror = () => {
      razorpayScriptPromise = undefined
      reject(new Error('Razorpay Checkout failed to load.'))
    }
    document.body.appendChild(script)
  })

  return razorpayScriptPromise
}
