import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { SEAMS } from './seams'
import type { Kind } from './seams'

/**
 * One object carried across the cut between two chapters, seven times.
 *
 * Every chapter on this page is a sticky frame with `overflow-hidden`, so an
 * element cannot literally travel out of one and into the next -- it is clipped
 * at the seam. What can cross is a third element that belongs to neither: a
 * mark that appears as the outgoing chapter leaves, moves to where the incoming
 * chapter's subject is about to be, and is gone before that subject arrives.
 * The reader reads it as the same thing continuing, which is what a shared
 * element transition is for; nothing is actually shared, because nothing can be.
 *
 * WHICH BOUNDARIES, AND HOW THAT WAS DECIDED
 *
 * A mark can only carry something across a gap if there is a gap, and which
 * boundaries have one is a measurement rather than a matter of opinion.
 * `scripts/seamcheck.mjs` walks a window either side of every boundary at four
 * viewports and reports the quietest moment in it, counting only ink that
 * belongs to a chapter -- the header and the footer are fixed and on screen the
 * whole way down, and including them put a floor under every reading that looked
 * like a phone having less room than a desktop.
 *
 * Eight boundaries measure exactly zero at every viewport. Three do not:
 *
 *   morph -> pipeline   0.129   the pipeline is an `Approach` chapter, so its
 *                               content is on screen the moment its section
 *                               starts. A mark here lands on the paragraph
 *                               beginning "The school publishes a PDF".
 *   privacy -> founder  0.221   `FounderScene` pins only where its panel fits
 *                               -- 1440x900 and 1024x760 of the harness six.
 *                               It measures 0.004 there and 0.118 at 1280x700,
 *                               which is the pin/no-pin split exactly. A seam
 *                               correct on two screens and wrong on four is
 *                               not a seam.
 *   founder -> start    0.272   the closing chapter is deliberately still and
 *                               arrives with its content already there.
 *
 * AND THE BOUNDARY MEASUREMENT IS NOT THE ANSWER. It reports the QUIETEST
 * moment in a window; the mark sits in the MIDDLE of that window, and those
 * are not the same place.
 *
 * `pipeline -> import` is what proved it. It measures zero at all four
 * viewports, so it was built -- and a note was written here declaring that the
 * original removal of this seam had been a mistake. Then the marks themselves
 * were measured: ink at the mark's own peak is 0.011, 0.039 and 0.113 at three
 * of the four sizes. The empty stretch at the end of an `Approach` chapter is
 * real and is not centred on the boundary, so the mark lands just outside it.
 *
 * The original removal was right. The note correcting it was wrong and was
 * nearly shipped, which is this project's most frequent failure -- a satisfying
 * story stated more strongly than the evidence supported -- caught here only
 * because the probe was extended to ask about the mark instead of about the
 * boundary. MAKE THE SIGNAL COME FROM THE FAR END: what matters is not whether
 * the gap exists but whether the thing you placed is in it. Every other seam
 * reads exactly zero at its own peak, at all four viewports, 28 for 28.
 *
 * SEVEN CROSSINGS NEED SEVEN OBJECTS
 *
 * The rule that orders the chapters is that no two adjacent ones move the same
 * way, because a fourth identical pinned section is the failure mode of this
 * genre. Seven identical marks would reintroduce exactly that at the seams: a
 * rectangle announcing every boundary is punctuation, not a transition.
 *
 * So each seam carries the thing its two chapters actually have in common, and
 * each is a different shape with a different path. A document leaves the
 * schools and becomes the morph's book; the day card shrinks into a school
 * tile; a chip becomes a panel; a panel edge stands up into a counted bar; the
 * bar lies back down into a rule under a question; an answer shrinks to a city
 * dot; a dot becomes a test thrown at a wall.
 *
 * It is driven imperatively from a scroll listener, like `ScrollCompanion`
 * beside it. The landing route renders every scene, so it must not re-render:
 * state here would re-render twelve chapters, the import's fifty-one chips and
 * the world map's thirteen hundred dots included, on every seam crossed.
 */

/** A number moved from one end of a seam to the other. */
const at = (pair: readonly [number, number], e: number) => pair[0] + (pair[1] - pair[0]) * e

export function SeamMorph() {
  const reduce = useReducedMotion()
  const marks = useRef<Array<HTMLElement | null>>([])
  const insides = useRef<Array<HTMLElement | null>>([])

  useEffect(() => {
    if (reduce) return

    /**
     * Section geometry, read once on mount and on resize.
     *
     * Not per frame: `offsetTop` forces layout, and doing eight of them inside
     * a scroll handler is the kind of thing that turns a 17ms page into a 40ms
     * one. These are layout numbers and an ancestor transform does not move
     * them, which is the same reason the schools chapter measures its own stage
     * with offsetWidth rather than a rect.
     */
    let bounds: Array<{ mid: number; vh: number } | null> = []

    function measure() {
      const vh = window.innerHeight
      bounds = SEAMS.map((s) => {
        const to = document.getElementById(s.to)
        if (!to) return null
        return { mid: to.getBoundingClientRect().top + window.scrollY, vh }
      })
      paint()
    }

    function paint() {
      const y = window.scrollY
      const vw = window.innerWidth
      SEAMS.forEach((s, i) => {
        const el = marks.current[i]
        const b = bounds[i]
        if (!el || !b) return
        // The window is one viewport wide, centred on the boundary itself.
        const t = (y - (b.mid - b.vh / 2)) / b.vh
        // Every seam but one is off screen at any moment, so this is the whole
        // cost of the other seven.
        if (t <= 0 || t >= 1) {
          if (el.style.opacity !== '0') el.style.opacity = '0'
          return
        }
        // In over the first quarter, out over the last: the mark is at full
        // strength only while both chapters are off doing something else.
        const o = t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1
        const e = t * t * (3 - 2 * t)
        const w = at(s.size, e)
        const h = w * at(s.ratio, e)
        // `a` and `b` are POINTS, so each axis is interpolated between the two
        // points -- not within one of them. Written as `at(s.a, e)` this
        // travelled from the start's x to the start's y, which is a number
        // with no meaning that happens to be in range.
        const x = at([s.a[0], s.b[0]], e) * vw
        const ty = at([s.a[1], s.b[1]], e) * b.vh
        el.style.opacity = String(o)
        el.style.width = `${w}px`
        el.style.height = `${h}px`
        el.style.borderRadius = `${Math.min(at(s.round, e), Math.min(w, h) / 2)}px`
        el.style.transform =
          `translate3d(${x - w / 2}px, ${ty - h / 2}px, 0)`
          + (s.turn ? ` rotate(${at(s.turn, e)}deg)` : '')
        // The insides are strongest in the middle of the crossing, where the
        // mark is the only thing on screen, and thin at both ends where it is
        // pretending to be part of a chapter.
        const inner = insides.current[i]
        if (inner) inner.style.opacity = String(0.22 + 0.5 * Math.sin(t * Math.PI))
      })
    }

    measure()
    window.addEventListener('scroll', paint, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', paint)
      window.removeEventListener('resize', measure)
    }
  }, [reduce])

  // No marks under reduced motion. They exist only to smooth transitions the
  // reduced-motion page does not make -- there the chapters are plain blocks
  // one after another, and eight things flying between them would be the only
  // moving objects on a page that asked for none.
  if (reduce) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-20">
      {SEAMS.map((s, i) => (
        <span
          key={`${s.from}-${s.to}`}
          // Named so a probe can ask about THIS mark rather than about
          // whatever else on the page happens to be a span inside something
          // aria-hidden. The first version of seamcheck matched twenty-five
          // elements and reported confident numbers about none of them.
          data-seam={`${s.from}-${s.to}`}
          ref={(el) => { marks.current[i] = el }}
          style={{ opacity: 0 }}
          className="absolute left-0 top-0 overflow-hidden border border-border-strong bg-surface shadow-sm"
        >
          <i
            ref={(el) => { insides.current[i] = el }}
            className="absolute inset-0 block"
            style={{ opacity: 0 }}
          >
            <Insides kind={s.kind} />
          </i>
        </span>
      ))}
    </div>
  )
}

/**
 * What each mark has inside it, which is what makes it a thing rather than a
 * rectangle.
 *
 * Plain elements with single-value utilities throughout. The first version of
 * the ruled paper was one bar carrying a stacked `shadow-[...]` -- a third of
 * the markup, and it did not render at all: a multi-value arbitrary carrying
 * commas and a `var()` does not survive the class parser, and a class that
 * fails to compile fails silently. The mark shipped as an empty rectangle and
 * looked deliberate.
 *
 * Neutral tokens, never `bg-accent`. This layer is fixed and sits outside every
 * `<Chapter>`, and `data-accent` is set on the chapter -- so `--accent` here
 * resolves to nothing and an accented mark is an invisible one.
 */
function Insides({ kind }: { kind: Kind }) {
  switch (kind) {
    // A page of ruled lines.
    case 'paper':
      return (
        <>
          {[0.3, 0.46, 0.62, 0.78].map((top) => (
            <span key={top} className="absolute inset-x-[20%] block h-px bg-text-subtle"
              style={{ top: `${top * 100}%` }} />
          ))}
        </>
      )

    // A card: a heading bar and two lines under it.
    case 'card':
      return (
        <>
          <span className="absolute left-[14%] top-[20%] block h-[8%] w-[46%] rounded-sm bg-text-muted" />
          <span className="absolute left-[14%] top-[46%] block h-px w-[72%] bg-text-subtle" />
          <span className="absolute left-[14%] top-[64%] block h-px w-[54%] bg-text-subtle" />
        </>
      )

    // A chip: one short line, centred, the way a date sits in one.
    case 'chip':
      return <span className="absolute left-1/2 top-1/2 block h-[10%] w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-muted" />

    // A bar: filled from the bottom, which is what a counted one does.
    case 'bar':
      return <span className="absolute inset-x-[22%] bottom-0 top-[34%] block rounded-t-sm bg-text-muted" />

    // A rule with a tick at one end, the way the answers are marked off.
    case 'rule':
      return (
        <>
          <span className="absolute inset-x-[6%] top-1/2 block h-px -translate-y-1/2 bg-text-subtle" />
          <span className="absolute left-[6%] top-[28%] block h-[44%] w-[3%] bg-text-muted" />
        </>
      )

    // A dot: a ring around a centre, which is how the cities land.
    case 'dot':
      return <span className="absolute left-1/2 top-1/2 block h-[34%] w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-muted" />

    // A token thrown at a wall: solid, no insides to read at speed.
    case 'token':
      return <span className="absolute inset-[26%] block rounded-sm bg-text-muted" />
  }
}
