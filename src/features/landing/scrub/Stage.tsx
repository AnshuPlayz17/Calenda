import { useEffect, useRef } from 'react'
import { draw, type Palette } from './draw'

/**
 * The fixed drawing surface, and the one animation loop on the page.
 *
 * Everything that moves on this page moves from here. The panels' opacity and
 * the progress hairline are written imperatively out of the same rAF callback
 * that paints the canvas, rather than through React state -- a scroll-driven
 * page that re-renders a component tree on every frame is a page that drops
 * them, and there is nothing here React needs to reconcile: the values are all
 * numbers going straight onto style properties.
 *
 * The scrub eases toward the scroll position rather than snapping to it. With
 * a video that was the difference between a scrub and a slideshow; with a
 * drawing it is cheaper than that and still worth having, because a pointer
 * wheel arrives in coarse steps and easing turns the steps into travel.
 */

/** Matches the spec's video-scrub easing. Small enough to feel like weight. */
const EASE = 0.115

export type StageHandle = {
  /** 0..1 down the page, written by the loop, read by the panels. */
  progress: number
}

export function Stage({
  onFrame, paletteOf,
}: {
  /** Called once per painted frame with eased progress. */
  onFrame: (p: number) => void
  /** Re-read whenever the theme or the mono toggle changes. */
  paletteOf: () => Palette
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const target = useRef(0)
  const eased = useRef(0)
  const frame = useRef(0)
  // Held in refs so changing the palette never restarts the loop -- a loop
  // torn down and rebuilt on a theme change drops the frame it was mid-way
  // through, which reads as a stutter at the exact moment somebody is looking.
  const paint = useRef(onFrame)
  const pal = useRef(paletteOf)
  paint.current = onFrame
  pal.current = paletteOf

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0

    function size() {
      const c = canvas.current
      if (!c) return
      // Capped at 2: a 3x buffer on a phone is nine times the fill for a
      // difference nobody can see on line art.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = c.clientWidth
      h = c.clientHeight
      c.width = Math.max(1, Math.round(w * dpr))
      c.height = Math.max(1, Math.round(h * dpr))
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function read() {
      const max = document.documentElement.scrollHeight - window.innerHeight
      target.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
    }

    function tick() {
      const gap = target.current - eased.current
      if (Math.abs(gap) > 0.00008) eased.current += gap * EASE
      else eased.current = target.current
      if (ctx && w > 0 && h > 0) draw(ctx, eased.current, w, h, pal.current())
      paint.current(eased.current)
      frame.current = requestAnimationFrame(tick)
    }

    size()
    read()
    eased.current = target.current

    window.addEventListener('scroll', read, { passive: true })
    window.addEventListener('resize', size)
    frame.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame.current)
      window.removeEventListener('scroll', read)
      window.removeEventListener('resize', size)
    }
  }, [])

  return <canvas ref={canvas} className="h-full w-full" aria-hidden />
}

/**
 * The reduced-motion alternative: three drawings, side by side, that do not move.
 *
 * Not a faster version of the scrub and not a single still. The argument the
 * animated page makes is that one object becomes another, and a reader who has
 * asked for no motion still deserves the argument -- so they get the three
 * states the scrub passes through, at once, which is more of the object than
 * the moving version shows at any single moment.
 */
export function Stills({ paletteOf }: { paletteOf: () => Palette }) {
  const refs = useRef<Array<HTMLCanvasElement | null>>([])

  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    refs.current.forEach((c, i) => {
      if (!c) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      const w = c.clientWidth
      const h = c.clientHeight
      c.width = Math.max(1, Math.round(w * dpr))
      c.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(ctx, [0.06, 0.45, 0.99][i] ?? 0, w, h, paletteOf())
    })
  }, [paletteOf])

  return (
    <div className="grid gap-8 sm:grid-cols-3">
      {['Closed', 'Open', 'On screen'].map((label, i) => (
        <figure key={label} className="m-0">
          <canvas
            ref={(el) => { refs.current[i] = el }}
            className="aspect-[5/4] w-full"
            aria-hidden
          />
          <figcaption className="mt-2 text-center text-xs text-text-subtle">{label}</figcaption>
        </figure>
      ))}
    </div>
  )
}
