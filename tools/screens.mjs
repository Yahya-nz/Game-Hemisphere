// Screenshots of every panel at desktop and phone sizes.
import { chromium, openGame, solveCurrent } from '../tests/e2e/helpers.mjs'
const out = process.argv[2]
const browser = await chromium.launch()
for (const [name, opts] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, mobile: true }]]) {
  const { page, errors } = await openGame(browser, opts)
  await page.waitForFunction(() => document.querySelector('#loading-note').style.visibility === 'hidden', null, { timeout: 20000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/${name}-title.png` })
  for (const act of ['levels', 'howto', 'settings', 'dream']) {
    await page.click(`#screen-title [data-act="${act}"]`)
    await page.waitForTimeout(450)
    await page.screenshot({ path: `${out}/${name}-${act}.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
  await page.evaluate(() => window.__hemisphere.startLevel(2, 4))
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/${name}-mix.png` })
  await page.click('#hud [data-act="menu"]')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/${name}-menu.png` })
  await page.keyboard.press('Escape')
  await solveCurrent(page)
  await page.waitForTimeout(1600)
  await page.screenshot({ path: `${out}/${name}-mix-done.png` })
  console.log(name, 'errors:', JSON.stringify(errors))
}
await browser.close()
