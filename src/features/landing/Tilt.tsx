import { useRef } from 'react'
import type { ReactNode } from 'react'
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react'

/**
 * A card that leans toward the pointer.
 *
 * The only thing on the page that responds to a person rather than to scroll
 * position, which is the point: it is the first surface they meet, and a page
 * that only reacts to scrolling feels like a film. Two degrees, not ten --
 * enough to read as a physical object catching the light, not enough to make
 * the text underneath it hard to read.
 *
 * Off entirely under reduced motion, and off wherever there is no hovering
 * pointer, because on a touchscreen the effect can only fire on tap and a card
 * that flinches when you try to press it is worse than a card that sits still.
 */
export function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const spring = { stiffness: 140, damping: 18, mass: 0.6 }
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-2.2, 2.2]), spring)
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [1.8, -1.8]), spring)

  if (reduce) return <div className={className}>{children}</div>

  return (
    <div
      ref={ref}
      className={className}
      style={{ perspective: 1200 }}
      onPointerMove={(e) => {
        // Coarse pointers get nothing: the handler only fires on contact there,
        // so the card would tilt away from the finger pressing it.
        if (e.pointerType !== 'mouse') return
        const r = ref.current?.getBoundingClientRect()
        if (!r) return
        px.set((e.clientX - r.left) / r.width - 0.5)
        py.set((e.clientY - r.top) / r.height - 0.5)
      }}
      onPointerLeave={() => { px.set(0); py.set(0) }}
    >
      <motion.div style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}>
        {children}
      </motion.div>
    </div>
  )
}
