import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

/**
 * The [MARK] | Calenda lockup.
 *
 * There used to be a slot here for a school crest, loaded from public/brand/
 * with Calenda's own mark standing in whenever the file was absent. It was
 * always absent: a school crest is that school's trademark and could not be
 * bundled with this source. So the slot only ever rendered its fallback, while
 * tying the product to one particular school in the one place a reader takes
 * as a statement of ownership. Calenda's own mark is now the only mark.
 */
export function Brand({
  size = 'md',
  showMark = true,
  className,
  to,
}: {
  size?: 'sm' | 'md' | 'lg'
  /** Whether the mark and its divider appear, or only the wordmark. */
  showMark?: boolean
  className?: string
  /**
   * Where clicking the lockup goes. A logo in the corner is the one thing
   * everybody tries to click to get home, so every place it appears says
   * where home is from there: the dashboard once you are signed in, the
   * landing page before that.
   */
  to?: string
}) {
  const mark = { sm: 'h-6 w-6', md: 'h-8 w-8', lg: 'h-11 w-11' }[size]
  const word = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' }[size]

  const inner = (
    <>
      {showMark && (
        <>
          <CalendaMark className={mark} />
          <span aria-hidden className="h-6 w-px bg-border" />
        </>
      )}

      <span
        className={cn(
          'font-display italic font-medium leading-none tracking-tight text-text',
          word,
        )}
      >
        Calenda
      </span>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        aria-label="Calenda home"
        className={cn(
          'inline-flex items-center gap-2.5 rounded-lg no-underline transition-opacity duration-150',
          'hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand',
          className,
        )}
      >
        {inner}
      </Link>
    )
  }

  return <span className={cn('inline-flex items-center gap-2.5', className)}>{inner}</span>
}

/** Calenda's own mark. Deliberately not a facsimile of any school's crest. */
function CalendaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Calenda">
      <rect width="32" height="32" rx="7" fill="var(--brand)" />
      <path
        d="M9 11h14M9 11v12h14V11"
        fill="none"
        stroke="var(--brand-contrast)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 8v5M20 8v5"
        fill="none"
        stroke="var(--brand-contrast)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="18" r="2" fill="var(--brand-contrast)" />
    </svg>
  )
}
