import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright-core'

const key = process.env.NEXORA_RAZORPAY_KEY_ID
const orderId = process.env.NEXORA_RAZORPAY_ORDER_ID
const amount = Number(process.env.NEXORA_RAZORPAY_AMOUNT)
const executablePath = process.env.NEXORA_CHROME_PATH

if (!key?.startsWith('rzp_test_')) throw new Error('A Razorpay Test Mode key is required')
if (!orderId || !Number.isSafeInteger(amount) || amount < 1) throw new Error('An exact existing test order is required')
if (!executablePath) throw new Error('NEXORA_CHROME_PATH is required')

const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
page.setDefaultTimeout(60_000)
const proofEmail = `webhook-proof-${randomBytes(6).toString('hex')}@example.test`
const proofContact = `9${BigInt(`0x${randomBytes(6).toString('hex')}`) % 1_000_000_000n}`.padEnd(10, '0')

try {
  await page.setContent('<main><p>Opening Razorpay Test Checkout…</p></main>')
  await page.addScriptTag({ url: 'https://checkout.razorpay.com/v1/checkout.js' })
  await page.evaluate(({ keyId, providerOrderId, exactAmount, email, contact }) => {
    const checkout = new window.Razorpay({
      key: keyId,
      amount: exactAmount,
      currency: 'INR',
      order_id: providerOrderId,
      name: 'Nexora',
      prefill: { email, contact: `+91${contact}` },
      handler: () => {},
    })
    checkout.open()
  }, {
    keyId: key,
    providerOrderId: orderId,
    exactAmount: amount,
    email: proofEmail,
    contact: proofContact,
  })

  let checkoutFrame
  for (let attempt = 0; attempt < 30 && !checkoutFrame; attempt += 1) {
    checkoutFrame = page.frames().find((frame) => frame !== page.mainFrame() && frame.url().includes('razorpay'))
    if (!checkoutFrame) await page.waitForTimeout(1000)
  }
  if (!checkoutFrame) throw new Error('Razorpay Checkout frame did not open')

  await checkoutFrame.getByText(/^Netbanking$/i).click()
  await checkoutFrame.getByText(/^Bank of Baroda - Retail Banking$/i).first().click()

  let completed = false
  for (let attempt = 0; attempt < 40 && !completed; attempt += 1) {
    await page.waitForTimeout(1000)
    for (const candidatePage of context.pages()) {
      for (const frame of candidatePage.frames()) {
        const success = frame.locator(
          'button:has-text("Success"), input[value="Success"], [role="button"]:has-text("Success")',
        ).first()
        if (await success.isVisible().catch(() => false)) {
          await success.click()
          completed = true
          break
        }
      }
      if (completed) break
    }
  }
  if (!completed) throw new Error('Razorpay Test Mode bank success action did not appear')
  await page.waitForTimeout(5000)
  process.stdout.write(`${JSON.stringify({
    checkout_completed: true,
    provider_order_suffix: orderId.slice(-6),
    amount,
    currency: 'INR',
  })}\n`)
} finally {
  await context.close()
  await browser.close()
}
