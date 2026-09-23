/**
 * Frame times for a full traversal of the landing page.
 *
 *   npm i -D playwright && node scripts/scrollcheck.mjs
 *   BASE=... STEP=... node scripts/scrollcheck.mjs
 *
 * Committed for the reason screencheck.mjs and seamcheck.mjs are: this has been
 * rebuilt from memory more than once, and each rebuild has repeated at least
 * one of the mistakes below.
 *
 * IT IS DRIVEN FROM INSIDE THE PAGE.
 *
 * An earlier version stepped the scroll from the test runner and awaited
 * between wheel events. That paces the page at whatever the round trip costs --
 * it measured 30fps and reported p95 33ms, which was its own cadence and not
 * the page's. One `scrollBy` per animation frame, inside the page, with the
 * frame intervals recorded in the same loop, is the only version that reports
 * the page.
 *
 * `scroll-behavior: smooth` is turned off first. With it on, a scroll request
 * is animated by the browser and the probe measures a page that has barely
 * moved.
 *
 * WHAT THE NUMBERS MEAN, AND WHAT THEY DO NOT
 *
 * p95 is the honest figure. The long-frame count is not stable enough to quote
 * on its own: an untouched page measures between 12 and 23 frames over 50ms on
 * repeat runs of the identical build, so a difference inside that spread is not
 * a difference. Compare against a baseline built from the same tree, run back
 * to back, with nothing else on the machine -- a measurement taken while
 * something is compiling is not a measurement.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/Calenda/'
const STEP = Number(process.env.STEP ?? 24)

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.addStyleTag({ content: 'html { scroll-behavior: auto !important }' })

const result = await page.evaluate((step) => new Promise((resolve) => {
  const gaps = []
  let last = performance.now()
  window.scrollTo({ top: 0, behavior: 'instant' })

  function tick() {
    const now = performance.now()
    gaps.push(now - last)
    last = now

    const end = document.documentElement.scrollHeight - window.innerHeight
    if (window.scrollY >= end - 1) {
      // The first few frames include the scheduler settling after goto, and
      // are not the page.
      const g = gaps.slice(5).sort((a, b) => a - b)
      resolve({
        frames: g.length,
        distance: end,
        p50: Math.round(g[Math.floor(g.length * 0.50)]),
        p95: Math.round(g[Math.floor(g.length * 0.95)]),
        max: Math.round(g[g.length - 1]),
        over50: g.filter((x) => x > 50).length,
        over100: g.filter((x) => x > 100).length,
      })
      return
    }
    window.scrollBy(0, step)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}), STEP)

console.log(JSON.stringify({ ...result, step: STEP, errors: errors.length }))
if (errors.length) console.log('console errors:', errors.slice(0, 5))

await browser.close()
