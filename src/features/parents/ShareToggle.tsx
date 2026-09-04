import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useParentLinks, useSetShared } from './queries'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import type { Shareable } from '@/lib/types'
import { cn } from '@/lib/cn'

const STORAGE_KEY = 'calenda.sharePromptSeen'

/**
 * Turns parent visibility on or off for one thing.
 *
 * The first time anything is shared, a dialog explains what that actually
 * means, because "share" is doing a lot of work in one word: it grants a
 * standing view of this item to a connected parent. Afterwards the toggle is
 * immediate -- nobody wants a confirmation on the twentieth note.
 */
export function ShareToggle({
  kind, id, shared, label, className,
}: {
  kind: Shareable
  id: string
  shared: boolean
  /** What is being shared, named in the prompt. */
  label: string
  className?: string
}) {
  const { data: links = [] } = useParentLinks()
  const setShared = useSetShared()
  const [confirming, setConfirming] = useState(false)

  const connectedParents = links.filter((l) => l.status === 'accepted' && l.other_role === 'parent')
  const hasParent = connectedParents.length > 0

  function seenPrompt(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  }

  function markSeen() {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Non-fatal; they see the explanation once more next time.
    }
  }

  async function apply(next: boolean) {
    await setShared.mutateAsync({ kind, id, shared: next })
  }

  function onClick() {
    if (shared) return void apply(false)          // turning OFF never asks
    if (!seenPrompt()) return setConfirming(true) // first share explains itself
    void apply(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={setShared.isPending}
        aria-pressed={shared}
        title={
          !hasParent
            ? 'No parent connected yet — this stays private until one is'
            : shared ? 'Visible to your parents' : 'Only you can see this'
        }
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] transition-colors duration-150',
          shared
            ? 'border-brand bg-brand-subtle font-medium text-brand'
            : 'border-border text-text-muted hover:border-border-strong hover:text-text',
          className,
        )}
      >
        {shared
          ? <><Eye className="h-3.5 w-3.5" aria-hidden /> Shared</>
          : <><EyeOff className="h-3.5 w-3.5" aria-hidden /> Private</>}
      </button>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Share with your parents?"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
              Not now
            </Button>
            <Button
              size="sm"
              loading={setShared.isPending}
              onClick={async () => {
                markSeen()
                await apply(true)
                setConfirming(false)
              }}
            >
              Share
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-text-muted">
          <p>
            <strong className="font-medium text-text">{label}</strong> will become visible to
            {hasParent
              ? <> {connectedParents.map((p) => p.other_name ?? 'your parent').join(' and ')}.</>
              : <> any parent you connect later.</>}
          </p>
          <p>
            Nothing else is shared. Each note, class, event and assignment is separate —
            sharing one never shares the rest.
          </p>
          <p>You can stop sharing at any time, and they lose access immediately.</p>
          {!hasParent && (
            <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12.5px]">
              You haven't connected a parent yet, so nobody can see this until you do.
            </p>
          )}
        </div>
      </Dialog>
    </>
  )
}
