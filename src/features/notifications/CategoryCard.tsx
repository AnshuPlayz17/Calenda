import { motion, useReducedMotion } from 'motion/react'
import { CategoryDot } from '@/components/ui/CategoryDot'
import { Switch } from './Switch'
import { OFFSETS } from './offsets'
import type { EventCategory } from '@/lib/types'
import { cn } from '@/lib/cn'

/**
 * One category, with its timings on the face of it.
 *
 * These used to be rows that all read "1 day before" and hid their timings
 * behind a click. Thirteen of them stacked up as one undifferentiated list,
 * and changing when something warned you meant expanding it first -- so the
 * setting people most want to change was the one furthest away.
 *
 * The timings are the content now, not a detail. A muted category shows none,
 * because a timing you cannot receive is not worth reading.
 */
export function CategoryCard({
  category,
  enabled,
  offsets,
  onToggle,
  onSetOffsets,
}: {
  category: EventCategory
  enabled: boolean
  offsets: number[]
  onToggle: () => void
  onSetOffsets: (next: number[]) => void
}) {
  const reduce = useReducedMotion()

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-surface p-3.5 transition-colors duration-200',
        enabled ? 'border-border' : 'border-border bg-surface-2/40',
      )}
    >
      <div className="flex items-start gap-2.5">
        <CategoryDot category={category} className="mt-1.5" />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-[13.5px] font-medium',
              enabled ? 'text-text' : 'text-text-subtle',
            )}
          >
            {category.name}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-text-subtle">
            {enabled
              ? offsets.length === 0
                ? 'On, but no timings picked'
                : `${offsets.length} reminder${offsets.length === 1 ? '' : 's'}`
              : 'Muted'}
          </span>
        </span>
        <Switch on={enabled} label={`Remind me about ${category.name}`} onToggle={onToggle} />
      </div>

      {enabled && (
        <motion.div
          initial={reduce ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="mt-3 flex flex-wrap gap-1">
            {OFFSETS.map((o) => {
              const on = offsets.includes(o.minutes)
              return (
                <button
                  key={o.minutes}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${o.label} before ${category.name}`}
                  onClick={() =>
                    onSetOffsets(
                      on
                        ? offsets.filter((m) => m !== o.minutes)
                        : [...offsets, o.minutes].sort((a, b) => b - a),
                    )
                  }
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11.5px] transition-colors duration-150',
                    on
                      ? 'border-brand bg-brand-subtle font-medium text-brand'
                      : 'border-border text-text-subtle hover:border-border-strong hover:text-text',
                  )}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
