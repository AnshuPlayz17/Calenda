import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * A grid of short lines that turn to face the cursor.
 *
 * Written to the DOM directly rather than through state: a nine by nine grid is
 * eighty-one elements, and re-rendering all of them on every pointer move is
 * the kind of thing that quietly costs a page its frame budget. Each line's
 * transform is set on the node, so React does no work at all after mount.
 *
 * Still under reduced motion, and still without a hovering pointer.
 */
export function MagnetLines({
  rows = 9,
  columns = 9,
  containerSize = '60vmin',
  lineColor = 'currentColor',
  lineWidth = '0.8vmin',
  lineHeight = '5vmin',
  baseAngle = 0,
  className,
}: {
  rows?: number
  columns?: number
  containerSize?: string
  lineColor?: string
  lineWidth?: string
  lineHeight?: string
  baseAngle?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (reduce) return
    const el = ref.current
    if (!el) return
    let fine = false
    try {
      fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    } catch { /* treated as coarse */ }
    if (!fine) return

    const spans = Array.from(el.querySelectorAll('span'))
    const onMove = (e: PointerEvent) => {
      for (const s of spans) {
        const r = s.getBoundingClientRect()
        const cx = r.x + r.width / 2
        const cy = r.y + r.height / 2
        // atan2 gives the bearing from the line to the pointer; +90 because the
        // lines are drawn vertically.
        const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90
        s.style.transform = `rotate(${angle}deg)`
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [reduce, rows, columns])

  return (
    <div
      ref={ref}
      aria-hidden
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        width: containerSize,
        height: containerSize,
        placeItems: 'center',
      }}
    >
      {Array.from({ length: rows * columns }, (_, i) => (
        <span
          key={i}
          style={{
            display: 'block',
            width: lineWidth,
            height: lineHeight,
            background: lineColor,
            borderRadius: '9999px',
            transform: `rotate(${baseAngle}deg)`,
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  )
}
