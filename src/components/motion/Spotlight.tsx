import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/cn'

/**
 * A soft light that follows the cursor inside its parent.
 *
 * The parent needs `position: relative` and usually `overflow: hidden`; this
 * fills it and is inert to pointer events, so it never interferes with whatever
 * it is lighting.
 *
 * Nothing at all without a hovering pointer, and nothing under reduced motion.
 * A light that can only appear where a finger already is has no work to do.
 */
export function Spotlight({
  className,
  size = 200,
  springOptions = { bounce: 0, duration: 0.4 },
}: {
  className?: string
  size?: number
  springOptions?: { bounce?: number; duration?: number }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const [fine, setFine] = useState(false)

  // Not merely inert on a touchscreen -- absent. It can only ever appear where
  // a finger already is, and until then it is a 420px element sitting in a
  // 390px viewport for no reason.
  useEffect(() => {
    try {
      setFine(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
    } catch {
      setFine(false)
    }
  }, [])

  const x = useSpring(useMotionValue(0), springOptions)
  const y = useSpring(useMotionValue(0), springOptions)

  if (reduce || !fine) return null

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      onPointerMove={undefined}
    >
      <motion.div
        className={cn('absolute rounded-full', className)}
        style={{
          // Capped against the viewport: a 420px light in a 390px window is a
          // wash over the whole section rather than a spot following a cursor,
          // which is a different effect and not the one intended. A narrow
          // desktop window is a real case -- a fine pointer says nothing about
          // how much room there is.
          width: `min(${size}px, 62vw)`,
          height: `min(${size}px, 62vw)`,
          left: x,
          top: y,
          translateX: '-50%',
          translateY: '-50%',
          opacity: visible ? 1 : 0,
          transition: 'opacity 200ms',
        }}
      />
      {/* The listener sits on a sibling that covers the parent, so the light
          itself never has to be hit-tested. */}
      <div
        className="pointer-events-auto absolute inset-0"
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return
          const r = e.currentTarget.getBoundingClientRect()
          x.set(e.clientX - r.left)
          y.set(e.clientY - r.top)
          if (!visible) setVisible(true)
        }}
        onPointerLeave={() => setVisible(false)}
      />
    </div>
  )
}
