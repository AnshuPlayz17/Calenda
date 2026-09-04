import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useCategories, useCreateEvent, useDeleteEvent, useUpdateEvent } from './queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import type { EventWithCategory, NewEventInput } from '@/lib/types'
import type { PlainDate } from '@/lib/events'
import { todayPlain } from '@/lib/datetime'

type Props = {
  open: boolean
  onClose: () => void
  /** Editing an existing event, or null to create one. */
  event: EventWithCategory | null
  /** Pre-fills the date when creating from a calendar cell. */
  defaultDate?: PlainDate
  /** Opens the form already set to suggest a community event. */
  defaultVisibility?: 'private' | 'community'
}

function blank(date: PlainDate, visibility: 'private' | 'community' = 'private'): NewEventInput {
  return {
    title: '',
    description: '',
    location: '',
    categoryId: null,
    isAllDay: true,
    startDate: date,
    endDate: date,
    startTime: '09:00',
    endTime: '10:00',
    visibility,
    priority: 0,
  }
}

export function EventDialog({ open, onClose, event, defaultDate, defaultVisibility }: Props) {
  const { current } = useSchoolYear()
  const { data: categories = [] } = useCategories()
  const create = useCreateEvent(current?.id)
  const update = useUpdateEvent()
  const remove = useDeleteEvent()

  const [form, setForm] = useState<NewEventInput>(() =>
    blank(defaultDate ?? todayPlain(), defaultVisibility))
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Reset whenever the dialog opens, so a previous edit never leaks into a new one.
  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmingDelete(false)
    setForm(
      event
        ? {
            title: event.title,
            description: event.description ?? '',
            location: event.location ?? '',
            categoryId: event.category_id,
            isAllDay: event.is_all_day,
            startDate: event.start_date,
            endDate: event.end_date,
            startTime: '09:00',
            endTime: '10:00',
            visibility: event.visibility,
            priority: event.priority,
          }
        : blank(defaultDate ?? todayPlain(), defaultVisibility),
    )
  }, [open, event, defaultDate, defaultVisibility])

  const set = <K extends keyof NewEventInput>(key: K, value: NewEventInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const busy = create.isPending || update.isPending || remove.isPending

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.title.trim()) return setError('Give the event a title.')
    if (form.endDate < form.startDate) {
      return setError('The end date is before the start date.')
    }

    try {
      if (event) await update.mutateAsync({ id: event.id, input: form })
      else await create.mutateAsync(form)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  async function destroy() {
    if (!event) return
    try {
      await remove.mutateAsync(event.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't delete that event.")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={event ? 'Edit event' : 'New event'}
      description={
        form.visibility === 'community'
          ? 'Community events are reviewed before everyone can see them.'
          : 'Only you can see a personal event.'
      }
      footer={
        <>
          {event && (
            <Button
              type="button"
              variant={confirmingDelete ? 'danger' : 'ghost'}
              size="sm"
              className="mr-auto"
              loading={remove.isPending}
              onClick={() => (confirmingDelete ? void destroy() : setConfirmingDelete(true))}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {confirmingDelete ? 'Really delete?' : 'Delete'}
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="event-form" size="sm" loading={busy}>
            {event ? 'Save changes' : 'Add event'}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <p role="alert"
             className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}

        <Input
          label="Title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Chemistry test"
          required
          autoFocus
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Starts"
            type="date"
            value={form.startDate}
            onChange={(e) => {
              const next = e.target.value as PlainDate
              set('startDate', next)
              // Keep the range valid rather than rejecting it later.
              if (form.endDate < next) set('endDate', next)
            }}
            required
          />
          <Input
            label="Ends"
            type="date"
            value={form.endDate}
            min={form.startDate}
            onChange={(e) => set('endDate', e.target.value as PlainDate)}
            required
          />
        </div>

        <label className="flex items-center gap-2.5 text-[13px] text-text">
          <input
            type="checkbox"
            checked={form.isAllDay}
            onChange={(e) => set('isAllDay', e.target.checked)}
            className="h-4 w-4 rounded border-border-strong accent-[var(--brand)]"
          />
          All day
        </label>

        {!form.isAllDay && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Start time"
              type="time"
              value={form.startTime ?? ''}
              onChange={(e) => set('startTime', e.target.value)}
            />
            <Input
              label="End time"
              type="time"
              value={form.endTime ?? ''}
              onChange={(e) => set('endTime', e.target.value)}
            />
          </div>
        )}

        <Select
          label="Category"
          value={form.categoryId ?? ''}
          onChange={(e) => set('categoryId', e.target.value || null)}
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>

        <Select
          label="Who can see this"
          value={form.visibility}
          onChange={(e) => set('visibility', e.target.value as NewEventInput['visibility'])}
          hint={
            form.visibility === 'community'
              ? 'Sent to an admin for approval before it appears for others.'
              : 'Private to you unless you share it.'
          }
        >
          <option value="private">Only me</option>
          <option value="community">Suggest for everyone</option>
        </Select>

        <Input
          label="Location"
          value={form.location ?? ''}
          onChange={(e) => set('location', e.target.value)}
          placeholder="Optional"
        />

        <Input
          label="Notes"
          value={form.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Optional"
        />
      </form>
    </Dialog>
  )
}
