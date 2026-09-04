import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="flex max-w-[38ch] flex-col items-center gap-3 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-text-subtle">
          <Compass className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-medium">This page doesn't exist</h1>
        <p className="text-[13.5px] leading-relaxed text-text-muted">
          The link may be out of date, or the page may have moved.
        </p>
        {/* A link, not a button wrapping a link -- nesting the two is invalid
            and breaks keyboard and screen-reader behaviour. */}
        <Link
          to="/"
          className="mt-1 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-contrast no-underline transition-colors duration-150 hover:bg-brand-hover"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
