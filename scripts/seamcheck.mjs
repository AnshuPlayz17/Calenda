/**
 * Which chapter boundaries have room for something to cross them.
 *
 *   npm i -D playwright && node scripts/seamcheck.mjs
 *
 * A shared-element transition needs a gap. The mark exists to be read as the
 * outgoing chapter's subject continuing into the incoming one, and it can only
 * be read that way while neither chapter is on screen -- put it where content
 * is, and it is a rectangle sitting on top of a paragraph.
 *
 * Three seams were built by reasoning about which chapters "share a subject"
 * and two had to be removed after looking at them, because the pipeline is an
 * `Approach` chapter whose content is on screen the moment its section starts.
 * That is what this measures instead of guessing again.
 *
 * WHAT IT MEASURES
 *
 * Ink: how much of the window is covered by something a reader can see. For
 * every element with its own text, the rect it occupies inside the viewport
 * times its cumulative opacity -- cumulative, because the mechanism that
 * creates the gap is an opacity on an ANCESTOR (`PushThrough` fades a chapter
 * out over the last 6% of its own scroll), and an element's own computed
 * opacity is 1 the whole time it is invisible.
 *
 * It walks a window of one viewport either side of each boundary and reports
 * the quietest moment in it. A boundary whose quietest moment is still busy
 * has no room, whatever the two chapters have in common.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/Calenda/'

/**
 * Several viewports, because one of them is not an answer here.
 *
 * `FounderScene` measures its own panel against the window and pins only where
 * the whole thing fits -- 1440x900 and 1024x760 of the harness six, scrolling
 * at the other four. A boundary either side of it therefore has room at some
 * sizes and not others, and a seam measured only on a desktop would be a mark
 * landing on a paragraph on a laptop.
 */
const VIEWPORTS = [[1440, 900], [1280, 700], [1024, 760], [390, 844]]

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
})

const worst = new Map()

for (const [vw, vh] of VIEWPORTS) {
const ctx = await browser.newContext({ viewport: { width: vw, height: vh } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })

// The page sets scroll-behavior: smooth, so a plain scrollTo measures a page
// that has barely moved -- the trap dollycheck already records.
await page.addStyleTag({ content: 'html { scroll-behavior: auto !important }' })

/**
 * Every chapter, in the order they appear.
 *
 * Not `div[id][data-accent]`, which is what `Chapter` renders and which misses
 * `FounderScene` -- it writes its own `<section id="founder">` rather than
 * being wrapped in one. The first run of this probe reported ten boundaries
 * and called the last one `privacy -> start`, which is two boundaries with a
 * whole chapter between them. A probe that quietly measures nine of ten things
 * reports a clean sweep of the nine.
 */
const ids = await page.evaluate(() => {
  const known = new Set(['top', 'schools', 'morph', 'pipeline', 'import', 'more',
    'numbers', 'questions', 'world', 'privacy', 'founder', 'start'])
  return [...document.querySelectorAll('[id]')]
    .filter((el) => known.has(el.id))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    .map((el) => el.id)
})
if (ids.length !== 12) {
  console.error(`expected 12 chapters, found ${ids.length}: ${ids.join(', ')}`)
  process.exit(1)
}

const measure = async (y) => page.evaluate(({ top, known }) => {
  window.scrollTo({ top, behavior: 'instant' })
  // Read after a frame, so transforms driven by the scroll have been applied.
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const vh = window.innerHeight
    const vw = window.innerWidth
    let ink = 0
    for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,li,button,a,strong,em')) {
      if (el.querySelector('h1,h2,h3,h4,p,span,li,button,a,strong,em')) continue
      const text = (el.textContent ?? '').trim()
      if (!text) continue
      // Only ink belonging to a CHAPTER. The header and the footer are fixed
      // and on screen the whole way down, so counting them puts a floor under
      // every reading -- 0.004 of a desktop window and 0.015 of a phone one,
      // which is the same chrome and looks like a phone having less room. A
      // threshold tuned to that floor is a threshold tuned to the viewport.
      let chapter = el
      while (chapter && !known.includes(chapter.id)) chapter = chapter.parentElement
      if (!chapter) continue
      const r = el.getBoundingClientRect()
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
      if (w <= 0 || h <= 0) continue
      // Cumulative, because the fade that makes the gap lives on an ancestor.
      let o = 1
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n)
        if (s.visibility === 'hidden' || s.display === 'none') { o = 0; break }
        o *= Number(s.opacity)
        if (o < 0.005) break
      }
      ink += (w * h * o) / (vw * vh)
    }
    resolve(Math.round(ink * 1000) / 1000)
  })))
}, { top: y, known: ids })

console.log(`\n${vw}x${vh}`)
console.log('boundary'.padEnd(26), 'quietest ink in the crossing window')
for (let i = 1; i < ids.length; i++) {
  const top = await page.evaluate(
    (id) => document.getElementById(id).getBoundingClientRect().top + window.scrollY, ids[i])
  let min = Infinity
  for (let s = -0.5; s <= 0.5; s += 0.05) {
    min = Math.min(min, await measure(Math.round(top + s * vh)))
  }
  const label = `${ids[i - 1]} -> ${ids[i]}`
  // The WORST reading across every viewport, not this one's. A seam is only
  // safe where it is safe everywhere.
  worst.set(label, Math.max(worst.get(label) ?? 0, min))
  console.log(label.padEnd(26), String(min).padStart(6), min <= 0.005 ? '  room' : '')
}

// ---- and whether the marks that were placed actually show up --------------
//
// The boundary measurement says where there is room. It says nothing about
// whether anything arrived. A mark whose window never opens, or that is painted
// at opacity 0 for the whole crossing, is invisible for the life of the page
// and nothing else on this page would notice -- which is the silent failure
// `landingSections.test.tsx` was rewritten to cover for the cues.
console.log('\nmarks')
const placed = await page.evaluate(() =>
  [...document.querySelectorAll('[data-seam]')].map((el) => el.dataset.seam))
for (let i = 1; i < ids.length; i++) {
  const top = await page.evaluate(
    (id) => document.getElementById(id).getBoundingClientRect().top + window.scrollY, ids[i])
  let peak = 0
  let inkAtPeak = 1
  for (let f = -0.5; f <= 0.5; f += 0.05) {
    const r = await page.evaluate(({ y, known, seam }) => {
      window.scrollTo({ top: y, behavior: 'instant' })
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        // THIS seam's mark, by name.
        const m = document.querySelector(`[data-seam="${seam}"]`)
        const best = m ? Number(getComputedStyle(m).opacity) : 0
        // Chapter ink at this same instant, so a mark at full strength on top
        // of a paragraph is distinguishable from one on an empty screen.
        let ink = 0
        const vw = window.innerWidth, vh = window.innerHeight
        for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,li,button,a')) {
          if (el.querySelector('h1,h2,h3,h4,p,span,li,button,a')) continue
          if (!(el.textContent ?? '').trim()) continue
          let ch = el
          while (ch && !known.includes(ch.id)) ch = ch.parentElement
          if (!ch) continue
          const b = el.getBoundingClientRect()
          const w = Math.max(0, Math.min(b.right, vw) - Math.max(b.left, 0))
          const h = Math.max(0, Math.min(b.bottom, vh) - Math.max(b.top, 0))
          if (w <= 0 || h <= 0) continue
          let o = 1
          for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
            o *= Number(getComputedStyle(n).opacity)
            if (o < 0.005) break
          }
          ink += (w * h * o) / (vw * vh)
        }
        resolve({ best: Math.round(best * 100) / 100, ink: Math.round(ink * 1000) / 1000 })
      })))
    }, { y: Math.round(top + f * vh), known: ids, seam: `${ids[i - 1]}-${ids[i]}` })
    if (r.best > peak) { peak = r.best; inkAtPeak = r.ink }
  }
  const label = `${ids[i - 1]} -> ${ids[i]}`
  if (!placed.includes(`${ids[i - 1]}-${ids[i]}`)) {
    console.log(label.padEnd(26), 'no seam placed here')
    continue
  }
  const verdict = peak < 0.9 ? 'NEVER VISIBLE' : inkAtPeak > 0.005 ? 'ON TOP OF CONTENT' : 'ok'
  console.log(label.padEnd(26), `peak=${String(peak).padStart(4)} ink=${String(inkAtPeak).padStart(5)}  ${verdict}`)
}
console.log(`(${placed.length} marks placed: ${placed.join(', ')})`)

await ctx.close()
}

console.log('\n=== worst across every viewport ===')
for (const [label, m] of worst) {
  console.log(label.padEnd(26), String(m).padStart(6), m <= 0.005 ? '  ROOM' : '')
}
console.log('\nboundaries with room everywhere:',
  [...worst].filter(([, m]) => m <= 0.005).map(([l]) => l).join(', ') || 'none')

await browser.close()
