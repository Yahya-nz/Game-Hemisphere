import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium, openGame, solveCurrent } from './helpers.mjs'

const SHOTS = process.env.SHOTS || ''
const VIEWPORTS = [
  { width: 844, height: 390, mobile: true },
  { width: 568, height: 320, mobile: true },
  { width: 320, height: 568, mobile: true, locale: 'id-ID' },
  { width: 390, height: 844, mobile: true },
  { width: 1024, height: 768 },
]
// big board, coach levels with tiles near the bottom
const LEVELS = [[4, 6], [1, 7], [1, 6], [3, 0], [4, 0], [0, 1]]

test('every tile is reachable and never under the coach, HUD or card', async t => {
  const browser = await chromium.launch()
  t.after(() => browser.close().catch(() => {}))
  const problems = []
  for (const vp of VIEWPORTS) {
    const { page, errors } = await openGame(browser, vp)
    await page.waitForFunction(() => document.querySelector('#loading-note').style.visibility === 'hidden', null, { timeout: 20000 })
    for (const [c, l] of LEVELS) {
      await page.evaluate(([c, l]) => window.__hemisphere.startLevel(c, l), [c, l])
      await page.waitForTimeout(250)
      const res = await page.evaluate(() => {
        const h = window.__hemisphere, lv = h.level, out = []
        const coach = document.querySelector('#coach')
        const cr = coach && !coach.hidden ? coach.getBoundingClientRect() : null
        let cs = Infinity
        for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) {
          if (!h.hasTile(x, y)) continue
          const [px, py] = h.cellCenter(x, y)
          const [qx] = h.cellCenter(x + 1, y)
          cs = Math.min(cs, qx - px)
          const el = document.elementFromPoint(px, py)
          if (!el || el.id !== 'stage') out.push(`(${x},${y}) hit ${el ? (el.id || el.className) : 'nothing'}`)
          if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) out.push(`(${x},${y}) off screen`)
          if (cr && px > cr.left && px < cr.right && py > cr.top && py < cr.bottom) out.push(`(${x},${y}) under coach`)
        }
        return { out, cs: Math.round(cs), key: lv.key }
      })
      if (res.out.length) problems.push(`${vp.width}x${vp.height} ${res.key}: ${res.out.slice(0, 4).join('; ')}`)
      const nameHit = await page.evaluate(() => {
        const c = document.querySelector('#coach'), n = document.querySelector('#hud .level-name')
        if (!c || c.hidden) return false
        const a = c.getBoundingClientRect(), b = n.getBoundingClientRect()
        return a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
      })
      if (nameHit) problems.push(`${vp.width}x${vp.height} ${res.key}: coach overlaps the level name`)
      if (res.cs < (vp.height <= 320 ? 22 : 24)) problems.push(`${vp.width}x${vp.height} ${res.key}: cell ${res.cs}px`)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/layout-${vp.width}x${vp.height}-${res.key}.png` })
    }
    // the completion card must leave at least part of the solved brain uncovered
    await page.evaluate(() => window.__hemisphere.startLevel(2, 3))
    await page.waitForTimeout(200)
    await solveCurrent(page)
    await page.waitForTimeout(900)
    const cover = await page.evaluate(() => {
      const h = window.__hemisphere, lv = h.level
      const card = document.querySelector('.complete-card').getBoundingClientRect()
      let total = 0, covered = 0
      for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) {
        if (!h.hasTile(x, y)) continue
        const [px, py] = h.cellCenter(x, y)
        total++
        if (px > card.left && px < card.right && py > card.top && py < card.bottom) covered++
      }
      return covered / total
    })
    if (cover > 0.15) problems.push(`${vp.width}x${vp.height}: completion card covers ${Math.round(cover * 100)}% of the board`)
    const fit = await page.evaluate(() => { const r = document.querySelector('.complete-card').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight } })
    if (fit.top < -1 || fit.bottom > fit.h + 1) problems.push(`${vp.width}x${vp.height}: completion card spills off screen (${Math.round(fit.top)}..${Math.round(fit.bottom)} of ${fit.h})`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/layout-${vp.width}x${vp.height}-complete.png` })
    if (errors.length) problems.push(`${vp.width}x${vp.height} errors: ${errors.join(' | ')}`)
    await page.context().close()
  }
  await browser.close()
  assert.deepEqual(problems, [])
})
