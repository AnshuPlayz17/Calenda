import { useCallback, useEffect, useRef } from 'react'
import { useMotionValueEvent } from 'motion/react'
import { BookOpen } from 'lucide-react'
import { ChapterHeading, Measure, PinnedFrame } from './Chapter'
import { paced, useScrollScene } from './scrollScene'
import { draw, type Palette } from './scrub/draw'
import { Stills } from './scrub/Stage'

/**
 * The chapter where paper becomes software.
 *
 * A retro ledger swings open, its spine turns a quarter turn into a hinge, and
 * it stands up as a laptop showing a month. It is the one chapter that is a
 * single object transforming continuously, which is why it sits where it does:
 * Schools before it is many discrete objects arriving, and the pipeline after
 * it is an unpinned line being drawn. No two adjacent chapters move the same
 * way, and this one would have broken that rule at the other end of the page,
 * because the founder chapter is a hinge swinging open and so is a book cover.
 *
 * It began as a whole landing page of its own and was reverted; the drawing is
 * the part worth keeping, so it is a chapter now rather than a front door.
 *
 * DRAWN, NOT FILMED, and `draw(ctx, p, ...)` holds no state between calls. That
 * is what lets it be scrubbed: any scroll position paints its own frame, so
 * going back up the page costs exactly what coming down it did.
 */
export function MorphScene() {
  const { ref, reduce, progress, height } = useScrollScene(paced(4))
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const surface = useRef<HTMLDivElement | null>(null)

  /**
   * Ink and paper, read off the page rather than hard-coded.
   *
   * A canvas cannot inherit a custom property, and the app has three themes. So
   * the wrapper carries `text-text` and `bg-surface` and this reads back what
   * the browser resolved. `getComputedStyle().color` is always an rgb()/rgba()
   * string, which is the only reason this is safe: reading `--accent` instead
   * would hand back an `oklch(...)` whose first three numbers are a lightness,
   * a chroma and an angle, and the renderer would take them for red, green and
   * blue.
   */
  const paletteOf = useCallback((): Palette => {
    const el = surface.current
    if (!el) return { ink: 'rgb(30, 55, 101)', paper: 'rgb(255, 255, 255)', tint: 1 }
    const cs = getComputedStyle(el)
    return { ink: cs.color, paper: cs.backgroundColor, tint: 1 }
  }, [])

  /**
   * The scene's scroll maps onto the drawing's 0..1, but not one to one.
   *
   * `PushThrough` arrives the chapter out of depth over its first 8% and
   * carries the camera past it over its last 8%. Painted against raw scroll
   * progress the laptop finishes at 0.95, by which point the chapter is already
   * leaving -- so the one frame the whole sequence is building towards was
   * never seen at full size. The drawing is done by 0.86 now, and the rest of
   * the scroll is the chapter's own exit.
   */
  const shaped = (p: number) => Math.min(1, Math.max(0, (p - 0.04) / 0.82))

  const paint = useCallback((p: number) => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const w = c.clientWidth
    const h = c.clientHeight
    if (w <= 0 || h <= 0) return
    // Capped at 2: a 3x buffer is nine times the fill for a difference nobody
    // can see on line art.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const want = { w: Math.round(w * dpr), h: Math.round(h * dpr) }
    if (c.width !== want.w || c.height !== want.h) {
      c.width = want.w
      c.height = want.h
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    draw(ctx, shaped(p), w, h, paletteOf())
  }, [paletteOf])

  /**
   * Driven by the scroll value, not by a permanent animation loop.
   *
   * The standalone version ran rAF forever because it *was* the page. Here it
   * is one chapter of eleven on a page with a frame budget, and a loop that
   * repaints a canvas every frame for the whole document is a cost paid even
   * while the reader is nine chapters away. Motion emits on scroll, which is
   * exactly when a scrubbed drawing needs to change.
   */
  useMotionValueEvent(progress, 'change', paint)

  useEffect(() => {
    if (reduce) return
    paint(progress.get())
    const onResize = () => paint(progress.get())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [paint, progress, reduce])

  const heading = (
    <ChapterHeading
      Icon={BookOpen}
      eyebrow="From paper"
      title="The year arrives as a document."
      lede={
        <>
          Schools publish the year as a file. Calenda reads it, stages every date for you
          to review, and what you keep becomes a calendar you can search, share and take
          with you.
        </>
      }
      note={<>Nothing is merged or deleted without you choosing it.</>}
    />
  )

  if (reduce) {
    // The three states the scrub passes through, at once. More of the object
    // than the moving version shows at any single moment, not less.
    return (
      <section className="relative z-10 border-y border-border bg-surface px-5 py-20 sm:px-8 sm:py-28">
        <Measure className="grid items-center gap-12 lg:grid-cols-2">
          <div>{heading}</div>
          <div ref={surface} className="text-text">
            <Stills paletteOf={paletteOf} />
          </div>
        </Measure>
      </section>
    )
  }

  return (
    <section ref={ref} className="relative z-10 border-y border-border bg-surface" style={{ height }}>
      <PinnedFrame progress={progress} depth={420}>
        <Measure className="grid items-center gap-10 lg:grid-cols-[0.9fr_1fr] lg:gap-14">
          <div>{heading}</div>
          <div ref={surface} className="text-text">
            <canvas
              ref={canvas}
              className="aspect-[4/3] w-full"
              aria-hidden
            />
          </div>
        </Measure>
      </PinnedFrame>
    </section>
  )
}
