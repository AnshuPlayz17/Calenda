import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { cn } from '@/lib/cn'

/**
 * A delete that asks first, in one component so it cannot be forgotten again.
 *
 * WHY THIS EXISTS
 *
 * "Nothing is silently merged or deleted" is one of this project's stated
 * constraints, and the notebook had already had a whole round spent on it: a
 * hover-revealed bin with no confirmation, one mis-click, a page and its
 * branch gone, no undo anywhere in the app. That was fixed for pages and then
 * the same control was written four more times -- for a mark, an attached
 * file, a timetable slot and a whole report card, the last of which also
 * deletes the uploaded document.
 *
 * Fixing four copies would have left the fifth to be written. The pattern is
 * the component now.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * There is no "don't ask again". A confirmation people have learned to dismiss
 * is worse than none, because it costs a click and buys nothing -- but a
 * setting that removes it puts the destructive path one forgotten checkbox
 * away, and nobody remembers ticking it a term later.
 *
 * The confirming button is the danger one and the cancel is the default, so a
 * reflexive Enter keeps the thing rather than destroying it.
 */
export function ConfirmDelete({
  what,
  title = 'Delete this?',
  detail,
  onConfirm,
  pending,
  className,
}: {
  /** Named in the dialog, in the reader's own words: `the mark for "Unit 3"`. */
  what: string
  title?: string
  /** An extra sentence when there is a consequence beyond the row itself. */
  detail?: string
  onConfirm: () => Promise<unknown>
  pending?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Delete ${what}`}
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-subtle',
          'transition-colors duration-150 hover:bg-surface-2 hover:text-danger',
          className,
        )}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={`${what.charAt(0).toUpperCase()}${what.slice(1)} will be gone. This cannot be undone.`}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={pending}
              onClick={async () => {
                await onConfirm()
                setOpen(false)
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        {/* The irreversibility stays in the description, where every caller
            gets it. Moving it here to fill the body meant the three callers
            with a second consequence to name -- the ones most worth warning --
            were the three that stopped being told the delete was permanent.
            Dialog pads an empty body, which is air rather than a defect. */}
        {detail ? <p className="text-[13.5px] text-text-muted">{detail}</p> : null}
      </Dialog>
    </>
  )
}
