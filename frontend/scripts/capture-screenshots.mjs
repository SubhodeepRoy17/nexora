import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.NEXORA_CAPTURE_URL ?? 'http://localhost:5173'
const apiUrl = process.env.NEXORA_CAPTURE_API_URL ?? 'http://localhost:8000'
const executablePath = process.env.NEXORA_CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const landingOnly = process.env.NEXORA_CAPTURE_LANDING_ONLY === '1'
const useFixtures = process.env.NEXORA_CAPTURE_UI_FIXTURES === '1'
const output = resolve(process.cwd(), '../docs/screenshots')
await mkdir(output, { recursive: true })

const now = new Date().toISOString()
const products = [
  ['Nexora Mechanical Keyboard', 'Keyboards', '7499.00', 36, 428, 31, ['hot-swappable', 'wireless']],
  ['Nexora Ergonomic Mouse', 'Computer Accessories', '2499.00', 58, 356, 27, ['ergonomic', 'bluetooth']],
  ['Nexora USB-C Hub Pro', 'Computer Accessories', '3299.00', 42, 294, 18, ['usb-c', 'multiport']],
  ['Nexora Studio Headphones', 'Audio', '5999.00', 24, 241, 15, ['wireless', 'noise-cancelling']],
  ['Nexora Desk Light', 'Home Office', '1899.00', 64, 188, 12, ['dimmable', 'usb-c']],
  ['Nexora Laptop Stand', 'Home Office', '2199.00', 47, 173, 11, ['aluminium', 'adjustable']],
  ['Nexora Smartwatch Active', 'Wearables', '4599.00', 31, 164, 9, ['amoled', 'fitness']],
  ['Nexora Travel Backpack', 'Bags', '2799.00', 39, 139, 8, ['water-resistant', 'laptop']],
].map(([title, category, price, stock, impressions, conversions, tags], index) => ({
  id: 101 + index,
  merchant: 11,
  merchant_name: 'Nexora Demo Store',
  title,
  description: `A verified ${category.toLowerCase()} option with current catalog details.`,
  category,
  price,
  compare_at_price: index % 2 === 0 ? String(Number(price) + 1000) : null,
  stock_quantity: stock,
  rating: 4.4 + (index % 4) / 10,
  is_active: true,
  tags,
  specifications: { material: index % 2 ? 'Composite' : 'Aluminium', color: index % 3 ? 'Graphite' : 'Sage', connectivity: ['Bluetooth', 'USB-C'] },
  agent_impressions: impressions,
  paid_conversions: conversions,
}))

const analytics = {
  window_days: 30,
  total_agent_impressions: 1983,
  agent_conversions: 131,
  agent_conversion_rate: 6.61,
  agent_attributed_revenue: '684740.00',
  trends: { impressions_percent: 18.4, conversions_percent: 12.8 },
  lost_opportunities: { total: 14, breakdown: [{ reason: 'PRICE', product_id: 101, product_title: 'Nexora Mechanical Keyboard', count: 8, message: 'Eight shoppers searched below the current price.' }, { reason: 'STOCK', product_id: 104, product_title: 'Nexora Studio Headphones', count: 6, message: 'Six suitable searches arrived while stock was limited.' }] },
  growth: { real: { offer_impressions: 86, paid_attached_offers: 19, responded_offers: 61, accepted_offers: 27, rejected_offers: 34, accept_rate_percent: 44.26, paid_attachment_rate_percent: 22.09, incremental_paid_revenue: '51281.00' }, top_converting_complements: [{ product_id: 102, product_title: 'Nexora Ergonomic Mouse', paid_attachments: 11, revenue: '27489.00' }], rejected_offers: [{ product_id: 105, product__title: 'Nexora Desk Light', rejections: 9 }], compatibility_gaps: [{ source_product_id: 104, source_product__title: 'Nexora Studio Headphones', gap_count: 2 }], attribution_note: 'Recorded attribution only.' },
}

const workspace = {
  merchant: { id: 11, name: 'Nexora Demo Store', product_count: products.length },
  catalog_health: { score_percent: 96, total_products: products.length, active_products: products.length, in_stock_products: products.length, issue_counts: { active: 0, in_stock: 0, description: 0, specifications: 1, search_tags: 0 }, definition: 'Five equal checks per product.' },
  operations: { orders_by_status: { PAID: 42, PAYMENT_PENDING: 2 }, webhooks_by_state: { PROCESSED: 42 }, open_reconciliation_exceptions: 0 },
  calculated_at: now,
}

const orders = [{
  order_id: '8a70ad66-6a62-41ba-8df2-34ee172f5ac1', status: 'PAID', currency: 'INR', total_amount: '9998.00', paid_at: now, updated_at: now,
  items: [{ product: 101, product_title: 'Nexora Mechanical Keyboard', merchant_name: 'Nexora Demo Store', quantity: 1, line_total: '7499.00' }, { product: 102, product_title: 'Nexora Ergonomic Mouse', merchant_name: 'Nexora Demo Store', quantity: 1, line_total: '2499.00', growth_offer: true }],
}]

const audits = [
  { audit_id: 71, action: 'PAYMENT_CAPTURED', outcome: 'SUCCEEDED', product_title: 'Nexora Mechanical Keyboard + Mouse', buyer_reference: 'Buyer ···7K2P', summary: 'Payment confirmed and reserved stock completed once.', approved_amount: '9998.00', order: orders[0].order_id, created_at: now },
  { audit_id: 70, action: 'QUOTE_APPROVED', outcome: 'SUCCEEDED', product_title: 'Nexora Mechanical Keyboard', buyer_reference: 'Buyer ···4M8Q', summary: 'The shopper approved the exact basket and total.', approved_amount: '7499.00', order: null, created_at: now },
  { audit_id: 69, action: 'ORDER_CREATED', outcome: 'SUCCEEDED', product_title: 'Nexora USB-C Hub Pro', buyer_reference: 'Buyer ···2R5N', summary: 'Stock was checked and safely reserved for checkout.', approved_amount: '3299.00', order: '90b13a80-6193-4997-9d39-999818d6ff89', created_at: now },
]

const relationships = [{ id: 1, source_product: 101, related_product: 102, source_title: products[0].title, related_title: products[1].title, relationship_type: 'COMPLEMENT', incremental_cost: products[1].price, benefit: 'A comfortable matching pointer for a complete desk setup.', trade_off: 'Adds another device to charge.', offer_label: 'Complete your desk', compatibility: {}, priority: 100, is_active: true }]

let fixtureRole = 'guest'

function fixtureResponse(url) {
  const path = new URL(url).pathname
  if (path.endsWith('/api/auth/me/')) return { csrf_token: 'screenshot-only', credential_cookie_roundtrip: true, user: fixtureRole === 'merchant' ? { id: 3, username: 'demo-merchant', display_name: 'Demo Merchant', role: 'merchant', merchant: { id: 11, name: 'Nexora Demo Store' } } : null }
  if (path.endsWith('/api/merchants/products/')) return { count: products.length, next: null, previous: null, results: products }
  if (path.endsWith('/api/merchants/workspace/')) return workspace
  if (path.endsWith('/api/merchants/analytics/')) return analytics
  if (path.endsWith('/api/merchants/product-relationships/')) return { count: relationships.length, results: relationships }
  if (path.endsWith('/api/orders/money-audits/')) return { count: audits.length, results: audits }
  if (path.endsWith('/api/orders/')) return { count: orders.length, results: orders }
  if (path.endsWith('/api/agents/conversations/')) return { count: 0, results: [] }
  return null
}

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })

if (useFixtures) {
  await page.route('**/api/**', async (route) => {
    const body = fixtureResponse(route.request().url())
    if (body == null) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not used by screenshot capture.' }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function capture(path, filename, ready) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  if (ready) await ready()
  await page.waitForTimeout(700)
  await page.screenshot({ path: resolve(output, filename), fullPage: true })
}

async function captureMerchantPages() {
  await capture('/merchant', 'merchant-operations-dashboard.png', () => page.getByRole('heading', { name: 'Merchant overview', exact: true }).waitFor())
  await capture('/merchant/inventory', 'merchant-inventory-workspace.png', () => page.getByRole('heading', { name: 'Product inventory', exact: true }).first().waitFor())
  await capture('/merchant/analytics', 'merchant-sales-insights.png', () => page.getByRole('heading', { name: 'Sales insights', exact: true }).waitFor())
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  for (const selector of ['#product', '#how-it-works', '#safety', 'footer']) {
    await page.locator(selector).scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForTimeout(150)
  await page.screenshot({ path: resolve(output, 'nexora-landing-page.png'), fullPage: true })

  if (!landingOnly) {
    await capture('/login', 'nexora-sign-in.png', () => page.getByRole('heading', { name: 'Sign in to Nexora' }).waitFor())
    await capture('/login?mode=signup', 'nexora-sign-up.png', () => page.getByRole('heading', { name: 'Create your account' }).waitFor())
    await capture('/buyer', 'buyer-agent-workspace.png', () => page.locator('.buyer-welcome').waitFor())

    const username = process.env.NEXORA_CAPTURE_MERCHANT_USERNAME
    const password = process.env.NEXORA_CAPTURE_MERCHANT_PASSWORD
    const sessionId = process.env.NEXORA_CAPTURE_MERCHANT_SESSION_ID
    if (useFixtures) {
      fixtureRole = 'merchant'
      await captureMerchantPages()
    } else if (sessionId) {
      await page.context().addCookies([{ name: 'sessionid', value: sessionId, url: apiUrl }])
      await captureMerchantPages()
    } else if (username && password) {
      await page.goto(`${baseUrl}/login?role=merchant`, { waitUntil: 'networkidle' })
      await page.getByLabel('Username').fill(username)
      await page.getByLabel('Password').fill(password)
      await page.getByRole('button', { name: /Sign in securely/i }).click()
      await page.waitForURL('**/merchant')
      await captureMerchantPages()
    } else {
      process.stderr.write('Merchant screenshots skipped: provide capture credentials, a temporary session, or NEXORA_CAPTURE_UI_FIXTURES=1.\n')
    }
  }
} finally {
  await browser.close()
}
