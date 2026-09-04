import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import {
  useCreateAssignment, useDeleteAssignment, useUpdateAssignment,
} from '@/features/classes/queries'
import type { Assignment, NewAssignmentInput } from '@/lib/types'
import { todayPlain } from '@/lib/datetime'

function blank(): NewAssignmentInput {
  return {
    title: '', description: '', dueDate: todayPlain(), dueTime: '23:59',
    dueAllDay: true, priority: 'normal', status: 'not_started', estimatedMinutes: null,
  }
}

/** Splits a stored instant back into the local date and time fields. */
function fromAssignment(a: Assignment): NewAssignmentInput {
  const d = a.due_at ? new Date(a.due_at) : null
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    title: a.title,
    description: a.description ?? '',
    dueDate: d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null,
    dueTime: d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '23:59',
    dueAllDay: a.due_all_day,
    priority: a.priority,
    status: a.status,
    estimatedMinutes: a.estimated_minutes,
  }
}

export function AssignmentDialog({
  open, onClose, classId, existing,
}: {
  open: boolean
  onClose: () => void
  classId: string
  existing: Assignment | null
}) {
  const create = useCreateAssignment(classId)
  const update = useUpdateAssignment()
  const remove = useDeleteAssignment()

  const [form, setForm] = useState<NewAssignmentInput>(blank)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirming(false)
    setForm(existing ? fromAssignment(existing) : blank())
  }, [open, existing])

  const set = <K extends keyof NewAssignmentInput>(k: K, v: NewAssignmentInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const busy = create.isPending || update.isPending || remove.isPending

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.title.trim()) return setError('Give the assignment a title.')
    try {
      if (existing) await update.mutateAsync({ id: existing.id, input: form })
      else await create.mutateAsync(form)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existing ? 'Edit assignment' : 'New assignment'}
      description="Anything with a due date shows up on your calendar and dashboard."
      footer={
        <>
          {existing && (
            <Button
              variant={confirming ? 'danger' : 'ghost'}
              size="sm"
              className="mr-auto"
              loading={remove.isPending}
              onClick={async () => {
                if (!confirming) return setConfirming(true)
                await remove.mutateAsync(existing.id)
                onClose()
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {confirming ? 'Really delete?' : 'Delete'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="assignment-form" size="sm" loading={busy}>
            {existing ? 'Save changes' : 'Add assignment'}
          </Button>
        </>
      }
    >
      <form id="assignment-form" onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <p role="alert"
             className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}

        <Input label="Title" value={form.title} autoFocus required
               placeholder="Recursion lab report"
               onChange={(e) => set('title', e.target.value)} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Due date" type="date" value={form.dueDate ?? ''}
                 onChange={(e) => set('dueDate', e.target.value || null)} />
          {!form.dueAllDay && (
            <Input label="Due time" type="time" value={form.dueTime ?? ''}
                   onChange={(e) => set('dueTime', e.target.value)} />
          )}
        </div>

        <label className="flex items-center gap-2.5 text-[13px] text-text">
          <input
            type="checkbox"
            checked={form.dueAllDay}
            onChange={(e) => set('dueAllDay', e.target.checked)}
            className="h-4 w-4 rounded border-border-strong accent-[var(--brand)]"
          />
          Due any time that day
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Priority" value={form.priority}
                  onChange={(e) => set('priority', e.target.value as NewAssignmentInput['priority'])}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </Select>
          <Select label="Status" value={form.status}
                  onChange={(e) => set('status', e.target.value as NewAssignmentInput['status'])}>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </Select>
        </div>

        <Input label="Notes" value={form.description ?? ''} placeholder="Optional"
               onChange={(e) => set('description', e.target.value)} />
      </form>
    </Dialog>
  )
}
