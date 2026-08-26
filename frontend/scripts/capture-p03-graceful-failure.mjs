import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.NEXORA_CAPTURE_URL ?? 'http://localhost:5173'
const executablePath = process.env.NEXORA_CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const username = process.env.NEXORA_CAPTURE_MERCHANT_USERNAME
const password = process.env.NEXORA_CAPTURE_MERCHANT_PASSWORD
const prompt = process.env.NEXORA_P03_PROMPT ?? 'Find the Nexora Nomad 75 quiet travel keyboard under ₹9000'
const productTitle = process.env.NEXORA_P03_PRODUCT_TITLE ?? 'Nexora Nomad 75'
if (!username || !password) {
  throw new Error('NEXORA_CAPTURE_MERCHANT_USERNAME and NEXORA_CAPTURE_MERCHANT_PASSWORD are required')
}

const output = resolve(process.cwd(), '../docs/screenshots')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /Sign in securely/i }).click()
  await page.waitForURL('**/buyer')

  await page.getByRole('textbox', { name: 'Shopping intent' }).fill(prompt)
  await page.getByRole('button', { name: 'Send shopping intent' }).click()
  await page.getByRole('heading', { name: productTitle, exact: true }).waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: /Approve & Buy/i }).first().click()
  const addToBasket = page.getByRole('button', { name: 'Add to basket' })
  for (let index = 0; index < await addToBasket.count(); index += 1) {
    await addToBasket.nth(index).click()
  }
  await page.getByRole('button', { name: /Generate exact quote/i }).click()
  await page.getByRole('heading', { name: 'Confirm the precise basket' }).waitFor()
  await page.getByRole('button', { name: /Demo safe block: exceed quantity limit/i }).click()
  await page.getByRole('heading', { name: 'Money action blocked safely' }).waitFor()
  await page.getByText('REASON · QUANTITY_LIMIT_EXCEEDED').waitFor()
  await page.screenshot({ path: resolve(output, 'p03-buyer-quantity-block.png'), fullPage: true })

  await page.goto(`${baseUrl}/merchant/analytics`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Agent insights', exact: true }).waitFor()
  await page.getByText(/QUANTITY_LIMIT_EXCEEDED/).first().waitFor({ timeout: 30000 })
  await page.screenshot({ path: resolve(output, 'p03-merchant-blocked-audit.png'), fullPage: true })

  process.stdout.write(`${JSON.stringify({
    reason_code: 'QUANTITY_LIMIT_EXCEEDED',
    buyer_capture: resolve(output, 'p03-buyer-quantity-block.png'),
    merchant_capture: resolve(output, 'p03-merchant-blocked-audit.png'),
  })}\n`)
} finally {
  await browser.close()
}
