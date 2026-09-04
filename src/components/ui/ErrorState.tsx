import { CloudOff, RefreshCw } from 'lucide-react'
import { Button } from './Button'

/**
 * What a page shows when it could not load, as distinct from a page that
 * loaded and found nothing.
 *
 * Every list in the app used to default a failed query to an empty array, so a
 * database that was unreachable rendered "no classes yet" -- the same screen as
 * a genuinely new account. During a Supabase outage that reads as though your
 * work has been deleted, which is the single most alarming thing an app can
 * tell you, and it was never true.
 */
export function ErrorState({
  what,
  onRetry,
  retrying,
}: {
  /** What failed to load, in the user's words: "your classes", "this week". */
  what: string
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-10 text-center"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-text-subtle">
        <CloudOff className="h-5 w-5" aria-hidden />
      </span>

      <div>
        <p className="text-[15px] font-medium text-text">Couldn't load {what}</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[13.5px] leading-relaxed text-text-muted">
          This is a connection problem, not missing data — nothing has been deleted.
          Check your connection and try again.
        </p>
      </div>

      {onRetry && (
        <Button variant="secondary" size="sm" loading={retrying} onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  )
}
