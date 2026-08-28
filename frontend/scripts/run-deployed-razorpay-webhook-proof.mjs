import { chromium } from 'playwright-core'
import { randomBytes } from 'node:crypto'

const frontendUrl = process.env.NEXORA_PROOF_FRONTEND_URL
const backendUrl = process.env.NEXORA_PROOF_BACKEND_URL
const buyerUsername = process.env.NEXORA_PROOF_BUYER_USERNAME
const buyerPassword = process.env.NEXORA_PROOF_BUYER_PASSWORD
const productTitle = process.env.NEXORA_PROOF_PRODUCT_TITLE ?? 'Nexora Nomad 75'
const addonTitle = process.env.NEXORA_PROOF_ADDON_TITLE ?? 'Nexora Nomad 75 Travel Case'
const proofEmail = `webhook-proof-${randomBytes(6).toString('hex')}@example.test`
const proofContact = `9${BigInt(`0x${randomBytes(6).toString('hex')}`) % 1_000_000_000n}`.padEnd(10, '0')

for (const [name, value] of Object.entries({ frontendUrl, backendUrl })) {
  if (!value) throw new Error(`Missing deployed webhook proof value: ${name}`)
}

const executableCandidates = [
  process.env.NEXORA_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

let browser
let launchError
for (const executablePath of executableCandidates) {
  try {
    browser = await chromium.launch({ executablePath, headless: true })
    break
  } catch (error) {
    launchError = error
  }
}
if (!browser) throw launchError ?? new Error('No supported Chrome/Edge executable was found')

const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
page.setDefaultTimeout(60_000)
page.setDefaultNavigationTimeout(60_000)

let createdOrder
page.on('response', async (response) => {
  if (response.request().method() !== 'POST' || !response.url().endsWith('/api/orders/create/')) return
  if (!response.ok()) return
  try {
    createdOrder = await response.json()
  } catch {
    // The main flow reports a bounded error if no order response is observed.
  }
})

// The acceptance proof intentionally withholds the browser callback so only
// Razorpay's signed webhook can settle this order. Order polling remains live.
await page.route('**/api/orders/*/payment-status/', (route) => route.abort('blockedbyclient'))

async function login() {
  const session = await context.request.get(`${backendUrl}/api/auth/me/`)
  if (!session.ok()) throw new Error(`Could not prepare sign in: ${session.status()}`)
  const { csrf_token: csrfToken } = await session.json()
  if (!buyerUsername || !buyerPassword) {
    const nonce = randomBytes(8).toString('hex')
    const generatedPassword = `Nx!${randomBytes(18).toString('base64url')}`
    const response = await context.request.post(`${backendUrl}/api/auth/register/`, {
      data: {
        first_name: 'Webhook proof buyer',
        username: `webhook-proof-${nonce}`,
        email: `webhook-proof-${nonce}@example.test`,
        password: generatedPassword,
        password_confirm: generatedPassword,
      },
      headers: {
        'X-CSRFToken': csrfToken,
        Origin: frontendUrl,
        Referer: `${frontendUrl}/`,
      },
    })
    if (!response.ok()) throw new Error(`Ephemeral proof account registration failed with status ${response.status()}`)
    return
  }
  const response = await context.request.post(`${backendUrl}/api/auth/login/`, {
    data: { username: buyerUsername, password: buyerPassword },
    headers: {
      'X-CSRFToken': csrfToken,
      Origin: frontendUrl,
      Referer: `${frontendUrl}/`,
    },
  })
  if (!response.ok()) throw new Error(`Sign in failed with status ${response.status()}`)
}

async function completeTestNetbankingPayment() {
  let checkoutFrame
  for (let attempt = 0; attempt < 30 && !checkoutFrame; attempt += 1) {
    checkoutFrame = page.frames().find((frame) => frame !== page.mainFrame() && frame.url().includes('razorpay'))
    if (!checkoutFrame) await page.waitForTimeout(1000)
  }
  if (!checkoutFrame) throw new Error('Razorpay Checkout frame did not open')

  let contactFrame
  for (const frame of page.frames()) {
    if (await frame.getByText('Contact details', { exact: true }).isVisible().catch(() => false)) {
      contactFrame = frame
      break
    }
  }
  if (contactFrame) {
    const contactHeading = contactFrame.getByText('Contact details', { exact: true })
    const contactPanel = contactHeading.locator('xpath=ancestor::div[.//button][1]')
    const mobileInput = contactPanel.locator('input').first()
    await mobileInput.fill(proofContact)
    await contactPanel.getByRole('button', { name: /^continue$/i }).click()
    await mobileInput.waitFor({ state: 'hidden', timeout: 30_000 })
  } else if (process.env.NEXORA_PROOF_DEBUG_DOM === '1') {
    const frameInputs = []
    for (const frame of page.frames()) {
      frameInputs.push(await frame.locator('input').evaluateAll((inputs) => inputs.map((input) => ({
        type: input.type,
        placeholder: input.placeholder,
        ariaLabel: input.getAttribute('aria-label'),
      }))).catch(() => []))
    }
    const overlay = checkoutFrame.locator('#overlay-backdrop')
    process.stdout.write(`${JSON.stringify({
      checkout_input_metadata: frameInputs,
      checkout_frame_url_origin: new URL(checkoutFrame.url()).origin,
      overlay_box: await overlay.boundingBox().catch(() => null),
      overlay_parent_box: await overlay.locator('..').boundingBox().catch(() => null),
      overlay_parent_child_count: await overlay.locator('..').evaluate((node) => node.children.length).catch(() => null),
    })}\n`)
    throw new Error('Stopped after sanitized Checkout DOM diagnostics')
  } else {
    // Razorpay currently renders this contact prompt in a fenced
    // surface that is visible to the browser but not exposed as a child frame.
    // Coordinates are relative to the stable 1000x584 Checkout overlay.
    const overlay = checkoutFrame.locator('#overlay-backdrop')
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ position: { x: 630, y: 362 }, force: true })
      await page.keyboard.press('Control+A')
      await page.keyboard.type(proofContact)
      await overlay.click({ position: { x: 645, y: 490 }, force: true })
      await overlay.waitFor({ state: 'hidden', timeout: 30_000 })
    }
  }

  await checkoutFrame.getByText(/^Netbanking$/i).click()
  const bank = checkoutFrame.getByText(/^Bank of Baroda - Retail Banking$/i).first()
  await bank.waitFor({ state: 'visible', timeout: 30_000 })
  await bank.click()

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(1000)
    for (const candidatePage of context.pages()) {
      for (const frame of candidatePage.frames()) {
        const success = frame.locator(
          'button:has-text("Success"), input[value="Success"], [role="button"]:has-text("Success")',
        ).first()
        if (await success.isVisible().catch(() => false)) {
          await success.click()
          return
        }
      }
    }
  }
  throw new Error('Razorpay Test Mode bank success action did not appear')
}

try {
  await login()
  await page.goto(`${frontendUrl}/buyer`, { waitUntil: 'networkidle' })
  await page.getByRole('textbox', { name: 'Shopping intent' }).fill(
    `Find the ${productTitle} quiet travel keyboard under ₹9000`,
  )
  await page.getByRole('button', { name: 'Send shopping intent' }).click()
  await page.getByRole('heading', { name: productTitle, exact: true }).waitFor({ timeout: 45_000 })
  await page.getByRole('button', { name: /Approve & Buy/i }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  const addon = dialog.getByText(addonTitle, { exact: true })
  if (await addon.isVisible().catch(() => false)) {
    await dialog.getByRole('button', { name: 'Add to basket' }).click()
  }
  await dialog.getByRole('button', { name: 'See final total' }).click()
  await page.getByRole('heading', { name: 'Confirm the total' }).waitFor()
  const approval = page.getByRole('checkbox', { name: /I approve ₹/i })
  await approval.check()
  await page.getByRole('button', { name: /Approve & pay/i }).click()
  for (let attempt = 0; attempt < 30 && !createdOrder?.razorpay_order_id; attempt += 1) {
    await page.waitForTimeout(250)
  }
  if (!createdOrder?.razorpay_order_id) throw new Error('Could not observe the approved provider order')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => Boolean(window.Razorpay))
  await page.evaluate(({ order, email, contact }) => {
    const checkout = new window.Razorpay({
      key: order.key,
      amount: order.amount,
      currency: order.currency,
      order_id: order.razorpay_order_id,
      name: 'Nexora',
      prefill: {
        email,
        contact: `+91${contact}`,
      },
      handler: () => {},
    })
    checkout.open()
  }, { order: createdOrder, email: proofEmail, contact: proofContact })
  await completeTestNetbankingPayment()

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (createdOrder?.order_id) {
      const response = await context.request.get(`${backendUrl}/api/orders/${createdOrder.order_id}/`)
      if (response.ok()) {
        const order = await response.json()
        if (order.status === 'PAID') {
          process.stdout.write(`${JSON.stringify({
            public_buyer_flow: true,
            browser_callback_withheld: true,
            order_suffix: String(order.order_id).slice(-6),
            provider_order_suffix: String(order.razorpay_order_id).slice(-6),
            status: order.status,
            total_amount: order.total_amount,
            currency: order.currency,
          })}\n`)
          process.exitCode = 0
          break
        }
      }
    }
    await page.waitForTimeout(2000)
  }
  if (process.exitCode !== 0) throw new Error('Signed webhook did not settle the test order within 60 seconds')
} catch (error) {
  if (process.env.NEXORA_PROOF_DEBUG_SCREENSHOT) {
    await page.screenshot({ path: process.env.NEXORA_PROOF_DEBUG_SCREENSHOT, fullPage: true })
  }
  throw error
} finally {
  await context.close()
  await browser.close()
}
