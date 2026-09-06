import { useEffect } from 'react'
import { useMotionValue, useSpring, useTransform, useReducedMotion, motion } from 'motion/react'

/**
 * A number that springs to its value rather than counting linearly.
 *
 * Reduced motion gets the number, immediately. The value was always the point;
 * the travel toward it never was.
 */
export function AnimatedNumber({
  value,
  className,
  springOptions = { bounce: 0, duration: 2000 },
  format = true,
}: {
  value: number
  className?: string
  springOptions?: { bounce?: number; duration?: number }
  /** Thousands separators. Off for anything that is an identifier, not a count. */
  format?: boolean
}) {
  const reduce = useReducedMotion()
  const raw = useMotionValue(reduce ? value : 0)
  const spring = useSpring(raw, springOptions)
  const text = useTransform(spring, (n) =>
    format ? Math.round(n).toLocaleString() : String(Math.round(n)),
  )

  useEffect(() => { raw.set(value) }, [raw, value])

  if (reduce) return <span className={className}>{format ? value.toLocaleString() : value}</span>
  return <motion.span className={className}>{text}</motion.span>
}
