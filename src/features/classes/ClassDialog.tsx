import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useCreateClass, useUpdateClass } from './queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import type { NewClassInput, SchoolClass } from '@/lib/types'

const BLANK: NewClassInput = { name: '', courseCode: '', teacher: '', room: '' }

export function ClassDialog({
  open, onClose, existing,
}: {
  open: boolean
  onClose: () => void
  existing: SchoolClass | null
}) {
  const { current } = useSchoolYear()
  const create = useCreateClass(current?.id)
  const update = useUpdateClass()

  const [form, setForm] = useState<NewClassInput>(BLANK)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setForm(existing
      ? {
          name: existing.name,
          courseCode: existing.course_code ?? '',
          teacher: existing.teacher ?? '',
          room: existing.room ?? '',
        }
      : BLANK)
  }, [open, existing])

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

  const busy = create.isPending || update.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existing ? 'Edit class' : 'Add a class'}
      description={existing ? undefined : 'You can change any of this later.'}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="class-form" size="sm" loading={busy}>
            {existing ? 'Save changes' : 'Add class'}
          </Button>
        </>
      }
    >
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
    </Dialog>
  )
}
