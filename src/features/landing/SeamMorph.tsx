import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * One object carried across the cut between two chapters.
 *
 * Every chapter on this page is a sticky frame with `overflow-hidden`, so an
 * element cannot literally travel out of one and into the next -- it is clipped
 * at the seam. What can cross is a third element that belongs to neither: a
 * mark that appears as the outgoing chapter leaves, moves to where the incoming
 * chapter's subject is about to be, and is gone before that subject arrives.
 * The reader reads it as the same thing continuing, which is what a shared
 * element transition is for; nothing is actually shared, because nothing can be.
 *
 * SEAMS ARE NAMED, NOT GENERATED. There are eleven boundaries on this page and
 * a mark on every one of them would be decoration -- eleven identical crossings
 * are the same failure as four identical pinned sections, which is the rule the
 * chapter order already exists to avoid. These are the ones where the two
 * chapters genuinely share a subject, so the mark is carrying something rather
 * than announcing a boundary.
 *
 * It is driven imperatively from a scroll listener, like `ScrollCompanion`
 * beside it. The landing route renders every scene, so it must not re-render:
 * state here would re-render twelve chapters, the import's fifty-one chips and
 * the world map's thirteen hundred dots included, on every seam crossed.
 */

type Seam = {
  /** The chapter being left, and the one being entered. */
  from: string
  to: string
  /** Viewport-relative start and end, as fractions. */
  a: readonly [number, number]
  b: readonly [number, number]
  /** Size in px at each end -- a tile becoming a smaller mark, or the reverse. */
  size: readonly [number, number]
  /** Corner radius at each end. A card becoming a dot is mostly this. */
  round: readonly [number, number]
}

const SEAMS: readonly Seam[] = [
  // ONE seam, and the reason is what the page does at each boundary rather
  // than how many boundaries there are.
  //
  // A mark can only carry something across a gap if there is a gap. Between
  // two pinned chapters there is: the first has been pushed past the camera
  // and the second has not yet arrived out of depth, so for about half a
  // viewport nothing is on screen at all. Schools and the morph are both
  // pinned, so this crossing lands on dead air.
  //
  // The other two tried here were `morph -> pipeline` and `pipeline -> import`,
  // and both were removed after looking at them. The pipeline is an `Approach`
  // chapter, not a pinned one: its content is on screen the moment its section
  // starts, so there is no gap, and a mark crossing it does not carry anything
  // -- it lands on top of the paragraph that begins "The school publishes a
  // PDF". Eleven marks on eleven boundaries would have been eleven of those.
  { from: 'schools', to: 'morph', a: [0.50, 0.70], b: [0.69, 0.48], size: [48, 86], round: [10, 4] },
]

export function SeamMorph() {
  const reduce = useReducedMotion()
  const host = useRef<HTMLDivElement | null>(null)
  const marks = useRef<Array<HTMLElement | null>>([])
  const rules = useRef<Array<HTMLElement | null>>([])

  useEffect(() => {
    if (reduce) return

    /**
     * Section geometry, read once on mount and on resize.
     *
     * Not per frame: `offsetTop` forces layout, and doing three of them inside
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
      SEAMS.forEach((s, i) => {
        const el = marks.current[i]
        const b = bounds[i]
        if (!el || !b) return
        // The window is one viewport wide, centred on the boundary itself.
        const t = (y - (b.mid - b.vh / 2)) / b.vh
        if (t <= 0 || t >= 1) {
          if (el.style.opacity !== '0') el.style.opacity = '0'
          return
        }
        // In over the first quarter, out over the last: the mark is at full
        // strength only while both chapters are off doing something else.
        const o = t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1
        const e = t * t * (3 - 2 * t)
        const x = (s.a[0] + (s.b[0] - s.a[0]) * e) * window.innerWidth
        const ty = (s.a[1] + (s.b[1] - s.a[1]) * e) * b.vh
        const size = s.size[0] + (s.size[1] - s.size[0]) * e
        const round = s.round[0] + (s.round[1] - s.round[0]) * e
        el.style.opacity = String(o)
        el.style.width = `${size}px`
        el.style.height = `${size * 1.28}px`
        el.style.borderRadius = `${round}px`
        el.style.transform = `translate3d(${x - size / 2}px, ${ty - size * 0.64}px, 0)`
        // The ruling is what makes it a document rather than a rectangle. It
        // is strongest in the middle of the crossing, where the mark is the
        // only thing on screen, and thin at both ends where it is pretending
        // to be part of a chapter.
        const r = rules.current[i]
        if (r) r.style.opacity = String(0.22 + 0.5 * Math.sin(t * Math.PI))
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

  // No mark under reduced motion. It exists only to smooth a transition the
  // reduced-motion page does not make -- there the chapters are plain blocks
  // one after another, and a thing flying between them would be the only
  // moving object on a page that asked for none.
  if (reduce) return null

  return (
    <div ref={host} aria-hidden className="pointer-events-none fixed inset-0 z-20">
      {SEAMS.map((s, i) => (
        <span
          key={`${s.from}-${s.to}`}
          ref={(el) => { marks.current[i] = el }}
          style={{ opacity: 0 }}
          className="absolute left-0 top-0 overflow-hidden border border-border-strong bg-surface shadow-sm"
        >
          {/* Four plain bars, not one bar with a stacked box-shadow. The
              shadow version is a third of the markup and did not render at
              all: a multi-value `shadow-[...]` arbitrary carrying commas and
              a var() does not survive the class parser, and a class that
              fails to compile fails silently -- the mark shipped as an empty
              rectangle and looked deliberate. */}
          <i
            ref={(el) => { rules.current[i] = el }}
            className="absolute inset-0 block"
            style={{ opacity: 0 }}
          >
            {[0.3, 0.46, 0.62, 0.78].map((top) => (
              <span
                key={top}
                className="absolute inset-x-[20%] block h-px bg-text-subtle"
                style={{ top: `${top * 100}%` }}
              />
            ))}
          </i>
        </span>
      ))}
    </div>
  )
}
