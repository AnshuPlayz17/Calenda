import { Info } from 'lucide-react'
import { usePreview } from '@/lib/preview'

/**
 * Says plainly that this is sample data and nothing is being saved. Showing
 * seeded data without saying so would be misleading.
 */
export function PreviewBanner() {
  const { active, exit } = usePreview()
  if (!active) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2 text-[12.5px]"
      style={{
        background: 'var(--warning-subtle)',
        borderColor: 'var(--warning-border)',
        color: 'var(--warning)',
      }}
    >
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">Preview.</strong> Showing the real 2026–27 school
        calendar as sample data. Changes are not saved — connect Supabase to keep them.
      </span>
      <button
        onClick={exit}
        className="ml-auto shrink-0 underline underline-offset-2 hover:no-underline"
      >
        Leave preview
      </button>
    </div>
  )
}
