import { useState } from 'react'
import { Check, Clock, Pencil, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDelete } from '@/components/ui/ConfirmDelete'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useCreateMeeting, useDeleteMeeting, useMeetings, useUpdateMeeting,
} from '@/features/timetable/queries'
import { DAY_NAMES, clockLabel, minutesOf } from '@/features/timetable/schedule'
import { useAuth } from '@/lib/auth'
import type { ClassMeeting } from '@/lib/types'

/**
 * When this class meets, edited where the class is.
 *
 * A timetable is built one class at a time -- you know that Functions is
 * Monday period one and Wednesday period one, and you do not know the whole
 * grid until every class is in. So slots are added here and the /timetable page
 * only reads. One editing surface, in the place where the fact is known.
 */
export function MeetingsEditor({ classId }: { classId: string }) {
  const { profile } = useAuth()
  const { data: meetings = [], isLoading, isError, refetch, isFetching } = useMeetings(classId)
  const create = useCreateMeeting(classId)
  const update = useUpdateMeeting()
  const remove = useDeleteMeeting()

  const cycleLength = profile?.timetable_cycle_length ?? null

  const [day, setDay] = useState('1')
  const [from, setFrom] = useState('08:50')
  const [to, setTo] = useState('10:05')
  const [label, setLabel] = useState('')
  const [room, setRoom] = useState('')
  const [error, setError] = useState<string | null>(null)
  /**
   * The slot being corrected, or null while one is being added.
   *
   * A time typed wrong was unfixable except by removing the row and typing all
   * five fields again -- and a period label and a room are exactly the sort of
   * thing nobody remembers the second time. Same form either way, because the
   * fields are identical and a second copy is two forms to keep in step.
   */
  const [editing, setEditing] = useState<ClassMeeting | null>(null)

  function edit(m: ClassMeeting) {
    setDay(String(m.day_of_week ?? m.cycle_day ?? 1))
    // Stored as a time, which Postgres hands back with seconds. An <input
    // type="time"> shows an empty box for "08:50:00", so it is trimmed.
    setFrom(m.starts_at.slice(0, 5))
    setTo(m.ends_at.slice(0, 5))
    setLabel(m.label ?? '')
    setRoom(m.room ?? '')
    setError(null)
    setEditing(m)
  }

  function stopEditing() {
    setEditing(null)
    setLabel('')
    setRoom('')
    setError(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // Checked here as well as by the database, because a check constraint
    // surfaces as "we couldn't add that" and this can say which field is wrong.
    if (minutesOf(to) <= minutesOf(from)) {
      setError('The end time has to be after the start time.')
      return
    }
    const input = {
      // One or the other, never both -- the column check enforces it, and
      // sending both would be refused outright.
      dayOfWeek: cycleLength ? null : Number(day),
      cycleDay: cycleLength ? Number(day) : null,
      startsAt: from,
      endsAt: to,
      label: label || null,
      room: room || null,
    }
    if (editing) await update.mutateAsync({ id: editing.id, input })
    else await create.mutateAsync(input)
    if (editing) setEditing(null)
    setLabel('')
    setRoom('')
  }

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />
  if (isError) {
    return <ErrorState what="this timetable" retrying={isFetching} onRetry={() => void refetch()} />
  }

  return (
    <div className="flex flex-col gap-3">
      {meetings.length === 0 ? (
        <Card>
          <EmptyState
            icon={Clock}
            title="No times yet"
            description="Add when this class meets and it appears on your timetable, and on the dashboard as what is coming up next."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {meetings.map((m) => (
            <li key={m.id}>
              <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-[92px] shrink-0 text-[13.5px] font-medium text-text">
                  {m.day_of_week !== null
                    ? DAY_NAMES[m.day_of_week]
                    : `Day ${m.cycle_day}`}
                </span>
                <span className="text-[13px] tabular-nums text-text-muted">
                  {clockLabel(m.starts_at)}–{clockLabel(m.ends_at)}
                </span>
                {(m.label || m.room) && (
                  <span className="min-w-0 truncate text-[12.5px] text-text-subtle">
                    {[m.label, m.room].filter(Boolean).join(' · ')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => edit(m)}
                  aria-label={`Edit the ${m.day_of_week !== null ? DAY_NAMES[m.day_of_week] : `Day ${m.cycle_day}`} slot at ${clockLabel(m.starts_at)}`}
                  className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
                <ConfirmDelete
                  what={`the ${m.day_of_week !== null ? DAY_NAMES[m.day_of_week] : `Day ${m.cycle_day}`} slot at ${clockLabel(m.starts_at)}`}
                  title="Remove this slot?"
                  pending={remove.isPending}
                  onConfirm={() => remove.mutateAsync(m.id)}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="p-4">
        <form onSubmit={save} className="flex flex-col gap-3">
          <p className="text-[13px] font-medium text-text">
            {editing ? 'Correct this time' : 'Add a time'}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label={cycleLength ? 'Cycle day' : 'Day'}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            >
              {cycleLength
                ? Array.from({ length: cycleLength }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>Day {d}</option>
                  ))
                : [1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>{DAY_NAMES[d]}</option>
                  ))}
            </Select>

            <Input
              label="From"
              type="time"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              label="To"
              type="time"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              error={error ?? undefined}
            />
            <Input
              label="Period"
              placeholder="Optional"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              hint="Your school's name for it."
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Room"
              placeholder="Only if it differs"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="w-[180px]"
            />
            <Button type="submit" size="sm" loading={create.isPending || update.isPending}>
              {editing
                ? <><Check className="h-4 w-4" aria-hidden /> Save</>
                : <><Plus className="h-4 w-4" aria-hidden /> Add</>}
            </Button>
            {editing && (
              <Button type="button" size="sm" variant="secondary" onClick={stopEditing}>
                <X className="h-4 w-4" aria-hidden /> Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  )
}
