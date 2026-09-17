/**
 * Auth-page harness.
 *
 * The two things that were actually wrong here do not show in a screenshot of
 * the top of the page: the primary button being below the fold, and the reel
 * pushing the panel's own height past the window. So this measures both --
 * every interactive control's distance below the fold, plus overflow, oversized
 * elements, frame times while the reel runs through a full cycle, and console
 * errors.
 *
 * Not a dependency -- the same arrangement as build-world-dots.mjs and
 * screencheck.mjs:
 *
 *   npm i -D playwright
 *   npx vite preview --port 4173 --strictPort
 *   node scripts/authcheck.mjs http://localhost:4173/Calenda/
 *
 * It is committed because it rotted while it was not. It looked for a role
 * option by the text "I'm a parent"; adding the teacher role reworded those
 * labels, and from then on the click hung for thirty seconds and killed the
 * run at configuration 39 -- so the last eight, including the entire parent
 * branch, went unmeasured for days while the file that describes this harness
 * claimed it walked "both branches of the last one: 46 configurations". A probe
 * living outside the repo is a probe nothing can keep in step with the app.
 *
 * DO NOT RUN THE NPM GATES BESIDE IT. typecheck, lint, test and build against
 * the same cores turn clean configurations into frame failures; a measurement
 * taken while something else is compiling is not a measurement.
 */
import { chromium } from 'playwright'
const base = process.argv[2]

const VIEWPORTS = [
  [1440, 900, 'desktop'], [1280, 700, 'laptop-short'], [1024, 760, 'tablet'],
  [414, 736, 'phone-plus'], [390, 844, 'phone'], [375, 667, 'phone-small'],
]
/**
 * A fresh browser per configuration, not a fresh page.
 *
 * Reusing one browser across forty-six configurations made the frame numbers
 * lie: later runs picked up single frames over 50ms while the same
 * configuration measured on its own was clean twelve times out of twelve. It
 * was contention with the teardown of earlier pages inside the harness, and it
 * cost several rounds of investigating the page for a defect the page did not
 * have. A launch costs about half a second and buys a number worth believing.
 */
async function withBrowser(fn) {
  // PLAYWRIGHT_CHROMIUM lets a container point at a browser it already has;
  // everywhere else Playwright finds its own. Hard-coding the path is what
  // makes a probe run on one machine and nobody else's.
  const exe = process.env.PLAYWRIGHT_CHROMIUM
  const browser = await chromium.launch(exe ? { executablePath: exe } : {})
  try {
    return await fn(browser)
  } finally {
    await browser.close()
  }
}
let bad = 0

async function check(route, w, h, name, opts = {}) {
 return withBrowser(async (browser) => {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    reducedMotion: opts.reduce ? 'reduce' : 'no-preference',
    colorScheme: opts.dark ? 'dark' : 'light',
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.goto(`${base}#/${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)

  // The email form, not just the screen that offers it. This check existed to
  // catch a submit button below the fold and for its whole life only ever
  // measured the providers screen -- where the button in question is not even
  // rendered. Every field added to the form since was unmeasured.
  if (opts.form) {
    const open = page.getByRole('button', { name: /email and password/i })
    if (await open.count()) {
      await open.first().click()
      await page.waitForTimeout(400)
    }
    // Sign-up is two steps now, and the submit button lives on the second one.
    // Checking only the first would repeat the original mistake one screen
    // further along.
    if (opts.form >= 2) {
      await page.getByLabel('Email').fill('someone@example.com')
      await page.getByLabel('Password', { exact: true }).fill('a-long-enough-password')
      const confirm = page.getByLabel('Confirm password')
      if (await confirm.count()) await confirm.fill('a-long-enough-password')
      const next = page.getByRole('button', { name: /^Continue$/ })
      if (await next.count()) {
        await next.click()
        await page.waitForTimeout(400)
      }
    }
    // Sign-up is three steps and the third one branches by role, so a student
    // and a parent see different fields. Both are measured: whichever is
    // taller is the one that decides whether the button fits.
    if (opts.form >= 3) {
      await page.getByLabel('First name').fill('Alex')
      await page.getByLabel('Last name').fill('Rivera')
      // getByRole, not getByText. This line used to read
      // `getByText("I'm a parent")`, and when the teacher role was added the
      // picker's labels lost their "I'm a" -- so the click hung for thirty
      // seconds and the whole run died with a TimeoutError at configuration 39,
      // leaving the last eight unmeasured. It had been doing that since
      // teachers shipped, and read as a flaky probe every time.
      //
      // The radio is `sr-only` inside its <label>, so the label is its
      // accessible name and this is stable against the copy being reworded
      // again -- which is the actual failure mode here.
      if (opts.role) {
        await page.getByRole('radio', { name: opts.role, exact: true }).check()
      }
      await page.waitForTimeout(200)
      const next = page.getByRole('button', { name: /^Continue$/ })
      if (await next.count()) {
        await next.click()
        await page.waitForTimeout(400)
      }
    }
  }

  // Watch a full reel cycle (4 scenes x 6s) at desktop, a short pass elsewhere.
  const dwell = name === 'desktop' && !opts.reduce ? 25000 : 2500
  await page.evaluate(() => {
    window.__f = []
    let last = performance.now()
    const tick = (t) => { window.__f.push(t - last); last = t; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  await page.waitForTimeout(dwell)

  const r = await page.evaluate(() => {
    const vh = window.innerHeight
    const overflow = document.documentElement.scrollWidth - window.innerWidth
    const wide = []
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect()
      if (b.width > window.innerWidth + 1) wide.push(el.tagName + '.' + String(el.className).slice(0, 28))
    }
    // Every control a person has to reach, and how far below the fold it is --
    // split, because they are not the same defect. A submit button or a
    // provider button below the fold means the page's whole purpose has to be
    // hunted for, and that is a failure. A footnote link below it means the
    // page is a little tall, which is what scrolling is for. Reported
    // separately rather than the check being loosened to make both pass.
    const primary = []
    const secondary = []
    const scope = document.querySelector('main') || document.body
    for (const el of scope.querySelectorAll('button, a[href], input')) {
      const b = el.getBoundingClientRect()
      if (b.height === 0) continue
      // The not-connected card exists only without a Supabase project, so it
      // is never on the deployed page. It is skipped here rather than the
      // threshold being loosened -- every control a visitor can actually reach
      // is still measured exactly as before.
      if (el.closest('[data-dev-only]')) continue
      const past = Math.round(b.bottom - vh)
      if (past <= 0) continue
      const label = (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 26)
      const isPrimary = el.tagName === 'BUTTON' || el.tagName === 'INPUT'
      ;(isPrimary ? primary : secondary).push(`${label}+${past}`)
    }
    const frames = (window.__f || []).slice(2)
    frames.sort((a, b) => a - b)
    return {
      overflow, wide: wide.slice(0, 3), primary, secondary,
      p95: Math.round(frames[Math.floor(frames.length * 0.95)] || 0),
      long: frames.filter((f) => f > 50).length,
    }
  })
  const problems = []
  if (r.overflow > 0) problems.push(`overflow ${r.overflow}px`)
  if (r.wide.length) problems.push(`wide: ${r.wide.join(', ')}`)
  if (r.primary.length) problems.push(`PRIMARY below fold: ${r.primary.join(' ')}`)
  if (r.long) problems.push(`${r.long} frames >50ms`)
  if (errors.length) problems.push(`errors: ${errors.slice(0, 2).join(' | ')}`)
  if (problems.length) bad++
  const notes = r.secondary.length ? `  (links below fold: ${r.secondary.join(' ')})` : ''
  const tag = `${route} ${w}x${h} ${name}${opts.form === 3 ? ` [step3 ${(opts.role ?? 'Student').toLowerCase()}]` : opts.form === 2 ? ' [step2]' : opts.form ? ' [form]' : ''}${opts.reduce ? ' [reduced]' : ''}${opts.dark ? ' [dark]' : ''}`
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${tag.padEnd(38)} p95=${String(r.p95).padStart(3)}ms  ${problems.join('; ')}${notes}`)
  await page.close()
 })
}

for (const route of ['sign-in', 'sign-up']) {
  for (const [w, h, n] of VIEWPORTS) await check(route, w, h, n)
  // Again, with the email form open -- the state the submit button exists in.
  for (const [w, h, n] of VIEWPORTS) await check(route, w, h, n, { form: true })
  if (route === 'sign-up') {
    for (const [w, h, n] of VIEWPORTS) await check(route, w, h, n, { form: 2 })
    // All three branches. A teacher is asked nothing on this step, which makes
    // it the shortest and the one least likely to overflow -- but "least
    // likely" is not a measurement, and it was not being measured at all.
    for (const [w, h, n] of VIEWPORTS) await check(route, w, h, n, { form: 3 })
    for (const [w, h, n] of VIEWPORTS) await check(route, w, h, n, { form: 3, role: 'Parent' })
    for (const [w, h, n] of VIEWPORTS) await check(route, w, h, n, { form: 3, role: 'Teacher' })
  }
  await check(route, 1440, 900, 'desktop', { reduce: true })
  await check(route, 1440, 900, 'desktop', { dark: true })
  console.log('')
}
console.log(bad ? `${bad} configuration(s) with problems` : 'all configurations clean')
