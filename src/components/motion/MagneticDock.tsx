import { useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { cn } from '@/lib/cn'

/**
 * A dock whose icons swell as the cursor passes.
 *
 * The magnification is driven by one motion value -- the pointer's position
 * along the dock -- which every icon reads. No React state changes while the
 * cursor moves, so eighty pointer events a second cost nothing but transforms.
 *
 * Without a hovering pointer it is a plain row of buttons, which is the right
 * answer rather than a fallback: the whole effect is a response to a cursor,
 * and a phone has none. Same under reduced motion.
 */

export type DockItem = {
  id: string
  label: string
  icon: ReactNode
  onClick?: () => void
  isActive?: boolean
  badge?: number
}

export function MagneticDock({
  items,
  iconSize = 56,
  maxScale = 1.5,
  magneticDistance = 150,
  showLabels = true,
  variant = 'glass',
  className,
}: {
  items: DockItem[]
  iconSize?: number
  maxScale?: number
  magneticDistance?: number
  showLabels?: boolean
  variant?: 'glass' | 'solid' | 'transparent'
  className?: string
}) {
  const reduce = useReducedMotion()
  // Infinity parks every icon at rest: the falloff is a function of distance,
  // and an unreachable pointer is the cleanest way to say "not hovering".
  const pointerX = useMotionValue(Number.POSITIVE_INFINITY)

  return (
    <div
      onPointerMove={(e) => { if (e.pointerType === 'mouse') pointerX.set(e.clientX) }}
      onPointerLeave={() => pointerX.set(Number.POSITIVE_INFINITY)}
      className={cn(
        'flex items-end gap-2 rounded-2xl px-3 pb-2 pt-2',
        variant === 'glass' && 'border border-border bg-surface/70 shadow-md backdrop-blur-md',
        variant === 'solid' && 'border border-border bg-surface shadow-md',
        className,
      )}
      role="toolbar"
      aria-label="Quick actions"
    >
      {items.map((item) => (
        <DockButton
          key={item.id}
          item={item}
          pointerX={pointerX}
          iconSize={iconSize}
          maxScale={maxScale}
          magneticDistance={magneticDistance}
          showLabels={showLabels}
          reduce={Boolean(reduce)}
        />
      ))}
    </div>
  )
}

function DockButton({
  item, pointerX, iconSize, maxScale, magneticDistance, showLabels, reduce,
}: {
  item: DockItem
  pointerX: MotionValue<number>
  iconSize: number
  maxScale: number
  magneticDistance: number
  showLabels: boolean
  reduce: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)

  // Distance from the pointer to this icon's centre, measured at read time so
  // it stays correct after a resize without anything having to observe one.
  const distance = useTransform(pointerX, (x) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return magneticDistance
    return Math.abs(x - (r.x + r.width / 2))
  })
  const target = useTransform(distance, [0, magneticDistance], [iconSize * maxScale, iconSize], {
    clamp: true,
  })
  const size = useSpring(target, { stiffness: 260, damping: 22, mass: 0.4 })

  return (
    <div className="group relative flex flex-col items-center">
      {showLabels && (
        <span
          className={cn(
            'pointer-events-none absolute -top-9 whitespace-nowrap rounded-md border border-border',
            'bg-surface px-2 py-1 text-[11.5px] font-medium text-text opacity-0 shadow-sm',
            'transition-opacity duration-150 group-hover:opacity-100',
          )}
        >
          {item.label}
        </span>
      )}

      <motion.button
        ref={ref}
        type="button"
        onClick={item.onClick}
        aria-label={item.label}
        aria-current={item.isActive ? 'page' : undefined}
        style={reduce ? { width: iconSize, height: iconSize } : { width: size, height: size }}
        className={cn(
          'relative grid shrink-0 place-items-center rounded-xl border transition-colors duration-150',
          item.isActive
            ? 'border-brand-border bg-brand-subtle text-brand'
            : 'border-border bg-surface-2 text-text-muted hover:text-text',
        )}
      >
        {item.icon}
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className="tabular absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold text-brand-contrast"
            style={{ background: 'var(--danger)' }}
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </motion.button>

      {item.isActive && (
        <span aria-hidden className="mt-1 h-1 w-1 rounded-full bg-brand" />
      )}
    </div>
  )
}
