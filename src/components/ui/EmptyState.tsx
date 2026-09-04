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
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-text-subtle">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text">{title}</p>
        {description && (
          <p className="max-w-[38ch] text-[13px] leading-relaxed text-text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
