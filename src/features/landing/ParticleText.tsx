import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/cn'

/**
 * Text drawn as particles that scatter from the cursor and spring home.
 *
 * Three things had to change from the usual version of this effect before it
 * could go on this page.
 *
 * The real text is still in the document. A canvas is invisible to a screen
 * reader and to a search engine, so putting a heading inside one deletes it
 * from the page in every sense except the visual. The words are rendered
 * normally and hidden from sight; the canvas is decoration and says so.
 *
 * It never runs without a hovering pointer. The whole effect is cursor-driven,
 * so on a phone it would be a non-selectable picture of text and nothing else --
 * worse than text in every respect, for no gain. Touch devices get the words.
 *
 * And it stops. An always-running animation frame per instance is exactly the
 * main-thread cost this page has kept at zero; this one sleeps when the section
 * is off screen and again once every particle has settled, and wakes on the next
 * pointer move.
 */

type Props = {
  text: string
  /** Base size in pixels; scaled down to fit narrow containers. */
  fontSize?: number
  fontFamily?: string
  /** Radius of each particle. Derived from the sampling step when omitted, so
   *  the dots stay proportional to the gaps between them at any size. */
  particleSize?: number
  /** Sampling step at 92px; scaled with the rendered size. Lower is denser. */
  particleDensity?: number
  /** How hard the cursor pushes. */
  dispersionStrength?: number
  /** Spring constant pulling each particle home. */
  returnSpeed?: number
  color?: string
  className?: string
  /** Rendered instead of the canvas wherever the effect cannot or should not run. */
  as?: 'h1' | 'h2' | 'p' | 'span'
}

type Particle = { x: number; y: number; ox: number; oy: number; vx: number; vy: number }

/** Above this the effect costs more than it is worth; the text is drawn smaller instead. */
const MAX_PARTICLES = 3200

export function ParticleText({
  text,
  fontSize = 120,
  fontFamily = "'Newsreader Variable', Newsreader, Georgia, serif",
  particleSize,
  particleDensity = 5,
  dispersionStrength = 15,
  returnSpeed = 0.08,
  color,
  className,
  as: Tag = 'span',
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()
  const [pointer, setPointer] = useState(false)

  // A hovering pointer is a property of the device, so it is read once rather
  // than watched -- swapping the rendering mode mid-read helps nobody.
  useEffect(() => {
    try {
      setPointer(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
    } catch {
      setPointer(false)
    }
  }, [])

  const live = pointer && !reduce

  useEffect(() => {
    if (!live) return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let particles: Particle[] = []
    let dotRadius = particleSize ?? 1.5
    let frame = 0
    let running = false
    const cursor = { x: -9999, y: -9999 }
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const build = () => {
      const w = wrap.clientWidth
      if (!w) return
      // Fit the word to the box before sampling, so a narrow phone-width
      // container does not simply crop it.
      const size = Math.min(fontSize, Math.floor(w / (text.length * 0.52)))
      const h = Math.ceil(size * 1.32)

      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      ctx.clearRect(0, 0, w, h)
      ctx.font = `500 ${size}px ${fontFamily}`
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#000'
      ctx.fillText(text, 0, h / 2)

      const { data } = ctx.getImageData(0, 0, w * dpr, h * dpr)
      // Sampling has to scale with the type, not sit at a fixed pixel step. Six
      // pixels across a 92px word is a readable letterform; the same six across
      // a 40px word is six rows of dots and the heading disappears.
      const step = Math.max(2, Math.round((particleDensity * size) / 92))
      // A fixed radius on a scaled grid is either a smear or a dotted outline.
      // Just over half the step keeps the strokes reading as strokes.
      dotRadius = particleSize ?? Math.max(1, step * 0.58)
      const next: Particle[] = []
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = ((Math.floor(y * dpr) * Math.floor(w * dpr)) + Math.floor(x * dpr)) * 4
          if ((data[i + 3] ?? 0) > 128) next.push({ x, y, ox: x, oy: y, vx: 0, vy: 0 })
        }
      }
      particles = next.length > MAX_PARTICLES
        ? next.filter((_, i) => i % Math.ceil(next.length / MAX_PARTICLES) === 0)
        : next
      ctx.clearRect(0, 0, w, h)
    }

    const paint = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color ?? getComputedStyle(wrap).color

      let moving = 0
      for (const p of particles) {
        const dx = p.x - cursor.x
        const dy = p.y - cursor.y
        const d2 = dx * dx + dy * dy
        if (d2 < 8000 && d2 > 0.01) {
          const d = Math.sqrt(d2)
          const push = ((90 - d) / 90) * dispersionStrength
          if (push > 0) {
            p.vx += (dx / d) * push * 0.08
            p.vy += (dy / d) * push * 0.08
          }
        }
        p.vx += (p.ox - p.x) * returnSpeed
        p.vy += (p.oy - p.y) * returnSpeed
        p.vx *= 0.82
        p.vy *= 0.82
        p.x += p.vx
        p.y += p.vy
        if (Math.abs(p.vx) + Math.abs(p.vy) > 0.02) moving++
        ctx.beginPath()
        ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Nothing is moving and the cursor has left: stop until it comes back.
      if (moving === 0 && cursor.x < -1000) {
        running = false
        return
      }
      frame = requestAnimationFrame(paint)
    }

    const wake = () => {
      if (running) return
      running = true
      frame = requestAnimationFrame(paint)
    }

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      cursor.x = e.clientX - r.left
      cursor.y = e.clientY - r.top
      wake()
    }
    const onLeave = () => { cursor.x = -9999; cursor.y = -9999; wake() }

    build()
    wake()

    // Off screen is the cheapest state of all: no sampling, no frames.
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) wake()
      else { running = false; cancelAnimationFrame(frame) }
    })
    io.observe(wrap)

    const ro = new ResizeObserver(() => { build(); wake() })
    ro.observe(wrap)

    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      io.disconnect()
      ro.disconnect()
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerleave', onLeave)
    }
  }, [live, text, fontSize, fontFamily, particleSize, particleDensity, dispersionStrength, returnSpeed, color])

  if (!live) return <Tag className={className}>{text}</Tag>

  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>
      {/* The words themselves, for anything that does not have eyes. */}
      <Tag className="sr-only">{text}</Tag>
      <canvas ref={canvasRef} aria-hidden className="block" />
    </div>
  )
}
