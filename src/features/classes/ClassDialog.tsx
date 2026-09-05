import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useCreateClass, useDeleteClass, useUpdateClass } from './queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import type { NewClassInput, SchoolClass } from '@/lib/types'

const BLANK: NewClassInput = { name: '', courseCode: '', teacher: '', room: '' }

export function ClassDialog({
  open, onClose, existing, startInDelete = false,
}: {
  open: boolean
  onClose: () => void
  existing: SchoolClass | null
  /**
   * Open straight into the delete confirmation. Delete lived only at the
   * bottom of the edit form, which meant the way to remove a class was to
   * pick "Edit" -- so it read as missing rather than hidden.
   */
  startInDelete?: boolean
}) {
  const { current } = useSchoolYear()
  const create = useCreateClass(current?.id)
  const update = useUpdateClass()

  const remove = useDeleteClass()

  const [form, setForm] = useState<NewClassInput>(BLANK)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [typedName, setTypedName] = useState('')

  // Deleting takes the notes, assignments and tasks inside the class with it,
  // so it asks for the name to be typed rather than for one more click. There
  // is no password to ask for -- sign-in is through Google, and Calenda never
  // sees one.
  const nameMatches = existing !== null && typedName.trim() === existing.name.trim()

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmingDelete(startInDelete && existing !== null)
    setTypedName('')
    setForm(existing
      ? {
          name: existing.name,
          courseCode: existing.course_code ?? '',
          teacher: existing.teacher ?? '',
          room: existing.room ?? '',
        }
      : BLANK)
  }, [open, existing, startInDelete])

  const set = <K extends keyof NewClassInput>(k: K, v: NewClassInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('Give the class a name.')
    try {
      if (existing) await update.mutateAsync({ id: existing.id, input: form })
      else await create.mutateAsync(form)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  async function destroy() {
    if (!existing || !nameMatches) return
    setError(null)
    try {
      await remove.mutateAsync(existing.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't delete that class.")
    }
  }

  const busy = create.isPending || update.isPending || remove.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        existing
          ? startInDelete ? `Delete ${existing.name}?` : 'Edit class'
          : 'Add a class'
      }
      description={existing ? undefined : 'You can change any of this later.'}
      footer={
        confirmingDelete ? null : (
          <>
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="class-form" size="sm" loading={busy}>
              {existing ? 'Save changes' : 'Add class'}
            </Button>
          </>
        )
      }
    >
      {!confirmingDelete && (
      <form id="class-form" onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <p role="alert"
             className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        <Input label="Class name" value={form.name} autoFocus required
               placeholder="Computer Science"
               onChange={(e) => set('name', e.target.value)} />
        <Input label="Course code" value={form.courseCode ?? ''}
               placeholder="ICS3U"
               hint="Used to match this class to your Google Calendar."
               onChange={(e) => set('courseCode', e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Teacher" value={form.teacher ?? ''} placeholder="Optional"
                 onChange={(e) => set('teacher', e.target.value)} />
          <Input label="Room" value={form.room ?? ''} placeholder="Optional"
                 onChange={(e) => set('room', e.target.value)} />
        </div>
      </form>
      )}

      {existing && (
        <div className={confirmingDelete ? '' : 'mt-6 border-t border-border pt-4'}>
          {!confirmingDelete ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[13.5px] font-medium text-text">Delete this class</p>
                <p className="text-[12.5px] text-text-muted">
                  Archiving hides it and keeps everything. Deleting does not.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-danger-border bg-danger-subtle p-3">
              <p className="text-[13px] text-danger">
                This permanently deletes <strong>{existing.name}</strong>, along with its notes,
                assignments and tasks. It cannot be undone.
              </p>
              <Input
                label={`Type "${existing.name}" to confirm`}
                value={typedName}
                autoComplete="off"
                className="mt-3"
                onChange={(e) => setTypedName(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm"
                        onClick={() => { setConfirmingDelete(false); setTypedName('') }}>
                  Keep it
                </Button>
                <Button variant="danger" size="sm" disabled={!nameMatches}
                        loading={remove.isPending} onClick={() => void destroy()}>
                  Delete permanently
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
