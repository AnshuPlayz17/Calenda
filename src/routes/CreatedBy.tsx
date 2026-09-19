import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { FounderPanel } from '@/features/landing/FounderScene'
import { useAuth } from '@/lib/auth'

/**
 * Who built it, as its own page.
 *
 * This used to be the tenth chapter of the landing page, reached from the app
 * sidebar as `/about#founder`. The landing page is three panels now, and a
 * chapter that no longer exists would have left that sidebar link scrolling to
 * nothing -- a navigation control that fails by doing no harm, which is the
 * kind that survives review for months.
 *
 * So it became a route. It renders the same `FounderPanel` the chapter did, so
 * the figures still come from `projectStats` and the disclaimer still exists in
 * exactly one place.
 */
export function CreatedBy() {
  const { session } = useAuth()

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-4">
          <Brand size="sm" to={session ? '/dashboard' : '/'} />
          <Link
            to={session ? '/dashboard' : '/'}
            className="inline-flex items-center gap-1.5 text-sm text-text-muted no-underline
                       underline-offset-4 hover:text-text hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {session ? 'Back to dashboard' : 'Back'}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-12 sm:px-8">
        <FounderPanel />
      </main>
    </div>
  )
}
