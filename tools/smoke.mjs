// Usage: node tools/smoke.mjs [outDir] [waitMs]
// Loads dist/preview.html offline (external requests aborted) at phone and desktop sizes,
// reports console errors / page errors / horizontal overflow, saves screenshots.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright') // preinstalled globally; ESM import can't see NODE_PATH
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.resolve(process.argv[2] || path.join(root, 'shots'))
const waitMs = Number(process.argv[3] || 1500)
await mkdir(outDir, { recursive: true })
const url = pathToFileURL(path.join(root, 'dist', 'preview.html')).href
const browser = await chromium.launch()
const report = []
for (const vp of [
  { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'phone-dark', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: 'dark' },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor, colorScheme: vp.colorScheme || 'light' })
  await ctx.route(/^https?:\/\//, r => r.abort())
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message)))
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(waitMs)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const file = path.join(outDir, `smoke-${vp.name}.png`)
  await page.screenshot({ path: file })
  report.push({ viewport: vp.name, errors, horizontalOverflowPx: overflow, screenshot: file })
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(report, null, 2))
if (report.some(r => r.errors.length || r.horizontalOverflowPx > 0)) process.exitCode = 1
