import type { EventCategory } from '@/lib/types'
import { cn } from '@/lib/cn'

/** Category colours come from CSS tokens, so they adapt with the theme. */
export function categoryColor(category: EventCategory | null): string {
  return `var(--${category?.color_token ?? 'cat-other'})`
}

export function CategoryDot({
  category,
  className,
}: {
  category: EventCategory | null
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ background: categoryColor(category) }}
    />
  )
}
