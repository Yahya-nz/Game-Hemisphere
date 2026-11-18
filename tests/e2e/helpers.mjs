import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
export const { chromium } = require('playwright')
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const url = pathToFileURL(path.join(root, 'dist', 'preview.html')).href

export async function openGame(browser, { width = 1280, height = 800, mobile = false, colorScheme = 'light', locale = 'en-US' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, colorScheme, locale })
  await ctx.route(/^https?:\/\//, r => r.abort())
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e.stack || e)))
  await page.goto(url)
  await page.waitForFunction(() => window.__hemisphere !== undefined)
  return { ctx, page, errors }
}

// Solve the current level using the in-page hint step, then wait for the completion card.
export async function solveCurrent(page) {
  for (let k = 0; k < 400; k++) {
    const r = await page.evaluate(() => window.__hemisphere.solveStep())
    if (!r) break
  }
  await page.waitForFunction(() => window.__hemisphere.solved, null, { timeout: 8000 })
  await page.waitForSelector('#screen-complete:not([hidden])', { timeout: 8000 })
}
