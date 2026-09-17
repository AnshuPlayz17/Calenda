/**
 * Does the Content-Security-Policy break anything a person actually does?
 *
 * A CSP violation is a console error, and the screencheck probe already fails
 * on those -- but only on the screens it visits. This walks the landing page
 * and the app, and reports violations specifically, because "no console
 * errors" and "no CSP violations" are the same signal only until the first
 * time they are not.
 */
import { chromium } from 'playwright'

// npm i -D playwright && npm run build && npx vite preview --port 4173
//   then: node scripts/cspcheck.mjs
//
// Playwright is deliberately not a dependency, the same arrangement
// screencheck.mjs and build-world-dots.mjs already have.
const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/Calenda/'
const ROUTES = ['', '#/sign-in', '#/dashboard', '#/calendar', '#/classes',
                '#/teaching', '#/teaching/preview-group-1?tab=settings', '#/settings']

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
})
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()

const violations = []
const errors = []
page.on('console', (m) => {
  const t = m.text()
  if (/Content Security Policy|Refused to/i.test(t)) violations.push(t)
  else if (m.type() === 'error') errors.push(t)
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE + '#/sign-in', { waitUntil: 'load' })
await page.waitForTimeout(600)
const enter = page.getByRole('button', { name: /preview|explore|look around/i }).first()
if (await enter.count()) await enter.click()
await page.waitForTimeout(400)

for (const route of ROUTES) {
  await page.evaluate((h) => { location.hash = h.replace(/^#/, '') || '/' }, route)
  await page.waitForTimeout(900)
  // Scroll the landing page so the scroll-driven scenes actually run: Motion
  // writes styles per frame, which is the thing most likely to trip style-src.
  if (route === '') {
    await page.evaluate(() => new Promise((done) => {
      let n = 0
      const tick = () => {
        window.scrollBy(0, 400)
        if (++n > 40) return done()
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }))
    await page.waitForTimeout(400)
  }
  console.log(`${route || '(landing)'} — violations so far: ${violations.length}`)
}

console.log('\n=== CSP violations ===')
console.log(violations.length ? violations.slice(0, 8).join('\n') : '(none)')
console.log('\n=== other console errors ===')
console.log(errors.length ? errors.slice(0, 5).join('\n') : '(none)')
await browser.close()
process.exit(violations.length ? 1 : 0)
