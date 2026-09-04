import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Empty states say what is missing and offer the next step. "No data" alone
 * leaves the user with nothing to do.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'default',
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  /**
   * 'compact' for a tile sitting beside other tiles. The full-size padding is
   * right for a whole page, but in a dashboard grid it stretched an empty tile
   * to several times the height of a full one next to it, which made a normal
   * quiet day look like something had gone wrong.
   */
  size?: 'default' | 'compact'
}) {
  const compact = size === 'compact'
  return (
    <div
      className={
        compact
          ? 'flex flex-col items-center justify-center gap-2 px-5 pb-5 pt-1 text-center'
          : 'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center'
      }
    >
      <span
        className={
          compact
            ? 'grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-text-subtle'
            : 'grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-text-subtle'
        }
      >
        <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className={compact ? 'text-[13.5px] font-medium text-text' : 'text-sm font-medium text-text'}>
          {title}
        </p>
        {description && (
          <p className={
            compact
              ? 'max-w-[34ch] text-[12.5px] leading-relaxed text-text-muted'
              : 'max-w-[38ch] text-[13px] leading-relaxed text-text-muted'
          }>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
