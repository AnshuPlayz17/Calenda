import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/cn'

/**
 * A rotating wheel of labels with the active one's panel beside it.
 *
 * Drag it, click a label, or use the arrow keys -- but scrolling over it moves
 * the page, not the wheel.
 *
 * It did capture the wheel event at first, which is the usual way this
 * component is built and it is wrong. A reader scrolling down a page has not
 * asked to operate a control; they get a section that resists them for a
 * moment and then lets go, and it reads as the page being slow rather than as
 * a thing they could have interacted with. Every other way in is still there,
 * and none of them costs anybody their scroll. Momentum carries after the input
 * stops and it settles on whole items, so it never rests between two things.
 *
 * The published component pairs each label with a photograph. Calenda has no
 * photographs and inventing some would put fiction on a page whose whole
 * argument is that its contents are real -- so each item carries a panel that
 * is rendered rather than fetched, and the wheel is a way of choosing between
 * them rather than a slideshow.
 *
 * Keyboard support is not a courtesy here: a wheel you can only drag is a
 * control most people cannot use, and this one carries content.
 */

export type WheelCarouselItem = {
  label: string
  detail: string
  panel?: React.ReactNode
}

export function WheelCarousel({
  items,
  radius = 130,
  spacing = 15,
  visibleItems = 3,
  initialIndex = 0,
  /** Where the wheel is read, as a fraction down the frame. Above the middle,
   *  because the first item is selected at rest and everything else hangs
   *  below it -- a centred apex leaves the arc running off the bottom. */
  apex = 0.34,
  onActiveChange,
  className,
}: {
  items: WheelCarouselItem[]
  radius?: number
  spacing?: number
  visibleItems?: number
  initialIndex?: number
  apex?: number
  onActiveChange?: (item: WheelCarouselItem, index: number) => void
  className?: string
}) {
  const [active, setActive] = useState(initialIndex)
  const reduce = useReducedMotion()
  const wheelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const item = items[active]
    if (item) onActiveChange?.(item, active)
  }, [active, items, onActiveChange])

  const move = (delta: number) =>
    setActive((i) => Math.min(items.length - 1, Math.max(0, i + delta)))

  // Reduced motion gets a list. A wheel is a rotation, and there is no way to
  // present a rotation to somebody who asked not to be shown one.
  if (reduce) {
    return (
      <ul className={cn('flex flex-col divide-y divide-border border-y border-border', className)}>
        {items.map((it) => (
          <li key={it.label} className="py-4">
            <p className="text-[15px] font-medium text-text">{it.label}</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-text-muted">{it.detail}</p>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className={cn('grid items-center gap-5 sm:gap-8 lg:grid-cols-[1fr_1.1fr]', className)}>
      <div
        ref={wheelRef}
        role="listbox"
        aria-label="Choose a topic"
        aria-activedescendant={`wheel-${active}`}
        tabIndex={0}
        className="relative h-[210px] select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:h-[260px] lg:h-[360px]"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(1) }
          if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
          if (e.key === 'Home') { e.preventDefault(); setActive(0) }
          if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1) }
        }}
      >
        {/* The dot marking where the wheel is read. */}
        <span
          aria-hidden
          style={{ top: `${apex * 100}%` }}
          className="absolute left-3 h-2 w-2 -translate-y-1/2 rounded-full bg-brand"
        />
        {items.map((it, i) => {
          const offset = i - active
          if (Math.abs(offset) > visibleItems) return null
          const angle = offset * spacing
          const rad = (angle * Math.PI) / 180
          return (
            <motion.button
              key={it.label}
              id={`wheel-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              animate={{
                y: Math.sin(rad) * radius,
                x: (1 - Math.cos(rad)) * radius * 0.45,
                opacity: 1 - Math.min(0.85, Math.abs(offset) / (visibleItems + 1)),
                rotate: angle * 0.16,
              }}
              transition={{ type: 'spring', stiffness: 180, damping: 26, mass: 0.6 }}
              style={{ transformOrigin: 'left center', top: `${apex * 100}%` }}
              className={cn(
                'absolute left-8 origin-left whitespace-nowrap text-left font-display',
                'text-[17px] leading-none tracking-tight sm:text-[22px] lg:text-[28px]',
                i === active ? 'font-medium text-text' : 'text-text-subtle',
              )}
            >
              {it.label}
            </motion.button>
          )
        })}
      </div>

      <div className="min-h-[170px] sm:min-h-[200px]">
        {items.map((it, i) => (
          <motion.div
            key={it.label}
            initial={false}
            animate={{ opacity: i === active ? 1 : 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden={i !== active}
            className={cn('col-start-1 row-start-1', i !== active && 'pointer-events-none')}
            style={{ display: 'grid' }}
          >
            {i === active && (
              <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
                <p className="text-[15.5px] leading-relaxed text-text">{it.detail}</p>
                {it.panel}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
