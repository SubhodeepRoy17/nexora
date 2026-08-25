import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.NEXORA_CAPTURE_URL ?? 'http://localhost:5173'
const executablePath = process.env.NEXORA_CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const output = resolve(process.cwd(), '../docs/screenshots')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.screenshot({ path: resolve(output, 'phase12-landing.png'), fullPage: true })

  await page.goto(`${baseUrl}/buyer`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Ask for the exact fit.' }).waitFor()
  await page.screenshot({ path: resolve(output, 'phase12-buyer.png'), fullPage: true })

  const username = process.env.NEXORA_CAPTURE_MERCHANT_USERNAME
  const password = process.env.NEXORA_CAPTURE_MERCHANT_PASSWORD
  if (username && password) {
    await page.goto(`${baseUrl}/login?role=merchant`, { waitUntil: 'networkidle' })
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: /Sign in securely/i }).click()
    await page.waitForURL('**/merchant')
    await page.getByRole('heading', { name: 'Merchant overview', exact: true }).waitFor()
    await page.waitForTimeout(750)
    await page.screenshot({ path: resolve(output, 'phase12-merchant.png'), fullPage: true })
  } else {
    process.stderr.write('Merchant screenshot skipped: set NEXORA_CAPTURE_MERCHANT_USERNAME and NEXORA_CAPTURE_MERCHANT_PASSWORD.\n')
  }
} finally {
  await browser.close()
}
