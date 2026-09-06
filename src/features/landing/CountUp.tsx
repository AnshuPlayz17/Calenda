import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'motion/react'

/**
 * A number that counts up once, when it is first read.
 *
 * `once` matters: a figure that re-runs every time it scrolls back into view
 * reads as decoration, and the second time you see it you stop believing it is
 * a real number. Under reduced motion it is simply the number, immediately --
 * the value was always the point, the counting was never it.
 */
export function CountUp({ to, duration = 1100 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' })
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? to : 0)

  useEffect(() => {
    if (reduce || !inView) return
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration)
      // Ease out, so it decelerates into the real figure instead of stopping dead.
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, reduce, to, duration])

  return <span ref={ref} className="tabular">{n.toLocaleString()}</span>
}
