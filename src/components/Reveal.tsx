import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/**
 * Reveals content as it scrolls into view.
 *
 * Two rules keep this from becoming the thing that makes a page feel cheap:
 *
 *   - `once: true`, so content never re-animates when scrolled back to. A
 *     section that fades out again on the way up reads as broken, not clever.
 *   - Under prefers-reduced-motion it renders plainly, with no transform and
 *     no opacity change at all -- not a faster animation, none.
 *
 * The margin starts the animation slightly before the element is fully in
 * view, so it has finished by the time it is actually being read.
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: ReactNode
  delay?: number
  /** Distance travelled. Small is better; large reads as a slideshow. */
  y?: number
  className?: string
}) {
  const reduce = useReducedMotion()

  if (reduce) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Staggers children of a list without hand-writing a delay for each. */
export function RevealGroup({
  children,
  className,
  stagger = 0.08,
}: {
  children: ReactNode[]
  className?: string
  stagger?: number
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <Reveal key={i} delay={Math.min(i, 6) * stagger}>
          {child}
        </Reveal>
      ))}
    </div>
  )
}
