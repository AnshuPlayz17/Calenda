/**
 * Walks screens behind the front door and reports what a person could not do.
 *
 *   npm i -D playwright && node scripts/screencheck.mjs
 *
 * Committed because it has now been rebuilt from scratch three times and caught
 * something every time -- the same reason scripts/build-world-dots.mjs lives
 * here while the packages it needs do not. Playwright is not a dependency of
 * this project: it is a fifty-megabyte install for a check nothing in CI runs,
 * and the browsers are already on the machines where this gets used.
 *
 * WHAT IT ASKS
 *
 * Not "is the layout right" -- a screenshot answers that and answers it badly.
 * It asks whether the page scrolls sideways, whether anything sits wider than
 * the window, whether a control exists that a screen reader could not name, and
 * whether the console said anything. Those are things a person runs into.
 *
 * IT ASSERTS THAT IT ARRIVED, FIRST.
 *
 * This is the whole reason it is trustworthy. An earlier version reported 21/21
 * clean with `h1="Welcome back"` on every single configuration -- it had never
 * left the landing page, because preview mode is read once when its provider
 * mounts and writing the sessionStorage key before navigating gives it nothing
 * to read. Twenty-one configurations of the sign-in page are twenty-one clean
 * screens. It enters preview by pressing the button a person presses, and
 * compares `location.hash` against the route it asked for before believing any
 * other number it took.
 *
 * Preview mode is the only way in from a container that cannot reach Supabase,
 * so this measures seeded data rather than anybody's real account.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/Calenda/'
const ROUTES = [
  ['#/teaching', 'teaching'],
  ['#/teaching/preview-group-1', 'stream'],
  ['#/teaching/preview-group-1?tab=dates', 'dates'],
  ['#/teaching/preview-group-1?tab=people', 'people'],
  ['#/teaching/preview-group-1?tab=settings', 'code'],
  ['#/classes', 'classes'],
  ['#/settings', 'settings'],
]
const SIZES = [[1440, 900], [1280, 700], [1024, 760], [414, 736], [390, 844], [375, 667]]

let bad = 0
let n = 0
for (const [w, h] of SIZES) {
  for (const dark of w === 1440 ? [false, true] : [false]) {
    for (const [hash, label] of ROUTES) {
      const browser = await chromium.launch({
        // Set PLAYWRIGHT_CHROMIUM when the browser is not where playwright expects
        // it -- a container with browsers preinstalled elsewhere, usually.
        ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
      })
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        colorScheme: dark ? 'dark' : 'light',
      })
      const page = await ctx.newPage()
      const errors = []
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      page.on('pageerror', (e) => errors.push(String(e)))

      // Entered through the app's own button rather than by writing the
      // sessionStorage key. Writing the key landed on #/sign-in for twenty-one
      // configurations that all reported clean, because the provider reads it
      // once at mount and a page told to navigate before that has nothing to
      // read. Pressing the button is also what a person does.
      await page.goto(BASE + '#/sign-in', { waitUntil: 'load' })
      await page.waitForTimeout(400)
      const enter = page.getByRole('button', { name: /preview|explore|look around/i }).first()
      if (await enter.count()) await enter.click()
      await page.waitForTimeout(400)
      await page.evaluate((h) => { location.hash = h.slice(1) }, hash)
      await page.waitForTimeout(1200)

      const r = await page.evaluate(() => {
        const named = (el) => {
          if (el.getAttribute('aria-label')) return true
          if (el.getAttribute('aria-labelledby')) return true
          if (el.labels && el.labels.length) return true
          if (el.title) return true
          return Boolean(el.textContent && el.textContent.trim())
        }
        const controls = [...document.querySelectorAll(
          'button, a[href], input, select, textarea',
        )].filter((el) => el.checkVisibility())
        return {
          controls: controls.length,
          unnamed: controls.filter((el) => !named(el))
            .map((el) => `${el.tagName}${el.type ? `[${el.type}]` : ''}.${el.className.slice(0, 30)}`),
          overflowX: Math.round(document.documentElement.scrollWidth - window.innerWidth),
          wider: [...document.querySelectorAll('main *')]
            .filter((el) => el.getBoundingClientRect().width > window.innerWidth + 1).length,
          heading: document.querySelector('h1')?.textContent?.trim() ?? null,
          where: location.hash,
        }
      })
      n++
      // Arriving is the first assertion. Without it every other number is
      // about whatever page the app fell back to, and 21 configurations of the
      // landing page report as 21 clean screens.
      const arrived = r.where === hash
      const fail = !arrived || r.unnamed.length || r.overflowX > 0 || r.wider > 0 || errors.length
      if (fail) bad++
      console.log(
        `${fail ? 'FAIL' : 'ok  '} ${`${w}x${h}${dark ? ' dark' : ''}`.padEnd(14)} ${label.padEnd(10)} ` +
          `controls=${String(r.controls).padStart(3)} unnamed=${r.unnamed.length} ` +
          `overflowX=${r.overflowX} wider=${r.wider} errors=${errors.length} at=${r.where} h1=${JSON.stringify(r.heading)}` +
          (r.unnamed.length ? `\n      ${r.unnamed.join(' | ')}` : '') +
          (errors.length ? `\n      ${errors.slice(0, 2).join(' | ')}` : ''),
      )
      await browser.close()
    }
  }
}
console.log(bad ? `\n${bad}/${n} failed` : `\nall ${n} clean`)
