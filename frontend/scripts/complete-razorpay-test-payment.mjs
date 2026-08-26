import { chromium } from 'playwright-core'
import { resolve } from 'node:path'

const checkoutUrl = process.env.NEXORA_TEST_CHECKOUT_URL
if (!checkoutUrl) throw new Error('NEXORA_TEST_CHECKOUT_URL is required')

const executablePath = process.env.NEXORA_CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const screenshotPath = resolve(
  process.cwd(),
  process.env.NEXORA_TEST_PAYMENT_SCREENSHOT ?? '../docs/screenshots/p02-razorpay-test-payment.png',
)
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const checkoutFrame = page.frames().find((frame) => frame !== page.mainFrame())
  if (!checkoutFrame) throw new Error('Razorpay Checkout frame did not open')

  const contactOverlay = checkoutFrame.getByTestId('contact-overlay-container')
  const mobileInput = contactOverlay.locator('input').first()
  if (await mobileInput.isVisible().catch(() => false)) {
    await mobileInput.fill('9876543210')
    await contactOverlay.getByRole('button', { name: /continue/i }).click()
  }

  await checkoutFrame.getByText(/^Netbanking$/i).click()
  const bank = checkoutFrame.getByText(/^Bank of Baroda - Retail Banking$/i).first()
  await bank.waitFor({ state: 'visible', timeout: 30000 })
  await bank.click()

  let completedAtBank = false
  for (let attempt = 0; attempt < 30 && !completedAtBank; attempt += 1) {
    await page.waitForTimeout(1000)
    for (const candidatePage of browser.contexts()[0].pages()) {
      for (const frame of candidatePage.frames()) {
        const successButton = frame.locator(
          'button:has-text("Success"), input[value="Success"], [role="button"]:has-text("Success")',
        ).first()
        if (await successButton.isVisible().catch(() => false)) {
          await successButton.click()
          completedAtBank = true
          break
        }
      }
    }
  }
  if (!completedAtBank) throw new Error('Razorpay mock bank success action did not appear')
  await page.waitForFunction(
    () => document.body?.innerText.includes('Browser authorization received'),
    { timeout: 60000 },
  )
  await page.screenshot({ path: screenshotPath, fullPage: true })
  process.stdout.write(`${JSON.stringify({ checkout_authorized: true, screenshot: screenshotPath })}\n`)
} catch (error) {
  const debugScreenshot = process.env.NEXORA_TEST_PAYMENT_DEBUG_SCREENSHOT
  if (debugScreenshot) {
    await page.screenshot({ path: resolve(process.cwd(), debugScreenshot), fullPage: true })
  }
  const frameOrigins = page.frames().map((frame) => {
    try { return new URL(frame.url()).origin } catch { return 'unknown' }
  })
  process.stderr.write(`${JSON.stringify({ frame_origins: frameOrigins, error: error.message })}\n`)
  throw error
} finally {
  await browser.close()
}
