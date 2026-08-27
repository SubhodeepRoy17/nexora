import { chromium } from 'playwright-core'

const frontendUrl = process.env.NEXORA_E2E_FRONTEND_URL
const backendUrl = process.env.NEXORA_E2E_BACKEND_URL
const buyerUsername = process.env.NEXORA_E2E_BUYER_USERNAME
const buyerPassword = process.env.NEXORA_E2E_BUYER_PASSWORD
const merchantUsername = process.env.NEXORA_E2E_MERCHANT_USERNAME
const merchantPassword = process.env.NEXORA_E2E_MERCHANT_PASSWORD
const productTitle = process.env.NEXORA_E2E_PRODUCT_TITLE
const addonTitle = process.env.NEXORA_E2E_ADDON_TITLE

for (const [name, value] of Object.entries({ frontendUrl, backendUrl, buyerUsername, buyerPassword, merchantUsername, merchantPassword, productTitle, addonTitle })) {
  if (!value) throw new Error(`Missing P0.4 environment value: ${name}`)
}

const candidates = [
  process.env.NEXORA_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

let browser
let launchError
for (const executablePath of candidates) {
  try {
    browser = await chromium.launch({ executablePath, headless: true })
    break
  } catch (error) {
    launchError = error
  }
}
if (!browser) throw launchError ?? new Error('No Chrome/Chromium executable was found for P0.4')

const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
page.setDefaultTimeout(60_000)
page.setDefaultNavigationTimeout(60_000)
let createOrderRequest

await page.route('https://checkout.razorpay.com/v1/checkout.js', async (route) => {
  await route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.Razorpay = function NexoraDeterministicRazorpay(options) {
        this.on = function () {};
        this.open = function () {
          const opens = Number(sessionStorage.getItem('p04-razorpay-opens') || '0') + 1;
          sessionStorage.setItem('p04-razorpay-opens', String(opens));
          if (opens >= 2) setTimeout(() => options.handler({
            razorpay_order_id: options.order_id,
            razorpay_payment_id: 'pay_p04_browser',
            razorpay_signature: 'p04-browser-signature'
          }), 50);
        };
      };
    `,
  })
})

page.on('request', (request) => {
  if (request.method() === 'POST' && request.url().endsWith('/api/orders/create/')) {
    createOrderRequest = {
      url: request.url(),
      body: request.postData(),
      headers: request.headers(),
    }
  }
})

async function login(username, password, merchant = false) {
  const session = await context.request.get(`${backendUrl}/api/auth/me/`)
  if (!session.ok()) throw new Error(`Could not prepare sign in: ${session.status()}`)
  const { csrf_token: csrfToken } = await session.json()
  const response = await context.request.post(`${backendUrl}/api/auth/login/`, {
    data: { username, password },
    headers: { 'X-CSRFToken': csrfToken },
  })
  if (!response.ok()) throw new Error(`Sign in failed with status ${response.status()}`)
  await page.goto(`${frontendUrl}${merchant ? '/merchant' : '/buyer'}`, { waitUntil: 'networkidle' })
}

try {
  // Published discovery is exercised from a separate HTTP caller, not through
  // Django internals. The full reference-client transaction is included in the
  // same npm command by the Django test label.
  const capability = await context.request.get(`${backendUrl}/.well-known/nexora-commerce.json`)
  if (!capability.ok()) throw new Error(`Capability discovery failed: ${capability.status()}`)
  const contract = await capability.json()
  if (contract.contract_version !== '1.0.0') throw new Error('Unexpected commerce contract version')
  const catalog = await context.request.get(`${backendUrl}/api/commerce/v1/catalog/products/?q=P0.4%20Nomad%20Keyboard`)
  if (!catalog.ok() || !(await catalog.json()).results.some((item) => item.title === productTitle)) {
    throw new Error('Published HTTP catalog did not expose the E2E product')
  }

  await login(buyerUsername, buyerPassword)
  await page.getByRole('textbox', { name: 'Shopping intent' }).fill('Find the P0.4 Nomad Keyboard under ₹9000')
  await page.getByRole('button', { name: 'Send shopping intent' }).click()
  await page.getByRole('heading', { name: productTitle, exact: true }).waitFor({ timeout: 30000 })
  await page.getByText('Details checked').waitFor()
  await page.getByRole('button', { name: /Approve & Buy/i }).first().click()

  const dialog = page.getByRole('dialog', { name: 'Review your basket' })
  await dialog.waitFor()
  const focusedInsideDialog = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)
  if (!focusedInsideDialog) throw new Error('Checkout dialog did not receive initial focus')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  if (!(await page.getByRole('button', { name: 'Close checkout' }).evaluate((node) => node === document.activeElement))) {
    throw new Error('Checkout dialog did not trap focus')
  }

  await page.getByText(addonTitle, { exact: true }).waitFor()
  // Rejecting is as easy as accepting and leaves the first offer out of the
  // cart, so its one-cart correlation cannot be reused accidentally.
  await page.getByRole('button', { name: 'No thanks' }).click()
  await page.getByRole('button', { name: 'See final total' }).click()
  await page.getByRole('heading', { name: 'Confirm your basket' }).waitFor()
  await page.getByRole('button', { name: /See how Nexora safely stops an over-limit order/i }).click()
  await page.getByRole('heading', { name: 'Checkout paused safely' }).waitFor()
  await page.getByText(/You requested 6, but the maximum is 5 per item/i).waitFor()
  await page.getByText(/NO PAYMENT STARTED · NO STOCK CHANGED/i).waitFor()

  await page.getByRole('button', { name: 'Return to basket and retry' }).click()
  await page.getByRole('button', { name: 'Close checkout' }).click()
  await page.getByRole('button', { name: 'New intent' }).click()
  await page.getByRole('textbox', { name: 'Shopping intent' }).fill('Retry the P0.4 Nomad Keyboard under ₹9000')
  await page.getByRole('button', { name: 'Send shopping intent' }).click()
  await page.getByRole('heading', { name: productTitle, exact: true }).waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: /Approve & Buy/i }).first().click()
  await page.getByText(addonTitle, { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Add to basket' }).click()
  await page.getByRole('button', { name: 'See final total' }).click()
  await page.getByRole('heading', { name: 'Confirm your basket' }).waitFor()
  const approval = page.getByRole('checkbox', { name: /I approve this exact quote/i })
  await approval.focus()
  await page.keyboard.press('Space')
  const pay = page.getByRole('button', { name: /Approve, reserve & pay/i })
  await pay.focus()
  await page.keyboard.press('Enter')
  await page.getByText('PAYMENT PENDING', { exact: true }).waitFor({ timeout: 30000 })
  if (!createOrderRequest) throw new Error('Could not observe the idempotent order request')

  const duplicate = await page.evaluate(async ({ url, body, headers }) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': headers['idempotency-key'],
        'X-CSRFToken': headers['x-csrftoken'],
      },
      body,
    })
    return { status: response.status, body: await response.json() }
  }, createOrderRequest)
  if (duplicate.status !== 201 || !duplicate.body.idempotent_replay) {
    throw new Error(`Duplicate order submission was not replay-safe: ${JSON.stringify(duplicate)}`)
  }
  const orderId = duplicate.body.order_id

  await page.reload({ waitUntil: 'networkidle' })
  const pendingOrder = page.getByRole('button', { name: new RegExp(`${productTitle}.*PAYMENT PENDING`, 'i') })
  await pendingOrder.waitFor({ timeout: 30000 })
  await pendingOrder.click()
  const receipt = page.getByRole('dialog', { name: /Order / })
  await receipt.waitFor()
  await page.getByRole('button', { name: 'Resume Razorpay payment' }).click()
  await receipt.getByText('PAID', { exact: true }).waitFor({ timeout: 30000 })
  await receipt.getByText(/Payment was confirmed and your order is complete/i).waitFor()

  await page.setViewportSize({ width: 390, height: 844 })
  const size = await receipt.evaluate((node) => ({ width: node.getBoundingClientRect().width, viewport: window.innerWidth }))
  if (size.width > size.viewport + 1) throw new Error('Order dialog overflows the mobile viewport')
  await page.goto(`${frontendUrl}/buyer`, { waitUntil: 'domcontentloaded' })
  const openNavigation = page.getByRole('button', { name: 'Open navigation' })
  await openNavigation.waitFor()
  await openNavigation.click()
  await page.getByText('Recent searches', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Close navigation' }).first().click()

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: 'Sign out' }).click()
  await login(merchantUsername, merchantPassword, true)
  await page.goto(`${frontendUrl}/merchant/analytics`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Sales insights', exact: true }).waitFor()
  await page.getByText('₹999').first().waitFor({ timeout: 30000 })
  await page.getByText(/1 purchased \/ 2 offered/i).waitFor()

  process.stdout.write(`${JSON.stringify({
    order_id: orderId,
    final_status: 'PAID',
    duplicate_idempotent_replay: true,
    mobile_viewport_checked: true,
  })}\n`)
} finally {
  await context.close()
  await browser.close()
}
