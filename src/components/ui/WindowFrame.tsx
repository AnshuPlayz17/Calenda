import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The app window every screenshot on the landing page is drawn inside.
 *
 * The tour panels and the hero card were showing the same kind of content in
 * two different containers -- one a windowed mockup, one a plain card -- so
 * the page read as though the hero were a component of the site and the tour
 * were pictures of something else. They are all pictures of the same app, and
 * they should say so in one visual language.
 *
 * `fill` is for the tour, where every chapter shares one fixed-height frame
 * and short content would otherwise hug the top of it. The hero card sizes to
 * its own content, and its list draws its own dividers edge to edge, so it
 * takes no padding from here.
 */
export function WindowFrame({
  title,
  aside,
  fill = false,
  className,
  children,
}: {
  title: string
  /** Optional right-aligned label, e.g. the school year. */
  aside?: ReactNode
  /** Stretch to the height of the parent and centre the content in it. */
  fill?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-md',
        fill && 'h-full',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <i className="h-2 w-2 rounded-full bg-surface-3" />
          <i className="h-2 w-2 rounded-full bg-surface-3" />
          <i className="h-2 w-2 rounded-full bg-surface-3" />
        </span>
        <span className="ml-1 text-[12px] font-medium text-text-muted">{title}</span>
        {aside && <span className="label-caps ml-auto">{aside}</span>}
      </div>

      <div className={cn('min-h-0', fill && 'flex flex-1 flex-col justify-center overflow-hidden p-4')}>
        {children}
      </div>
    </div>
  )
}
