import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useWeekMeetings } from './queries'
import { awayLabel, clockLabel, cycleDayFor, meetingsOn, nextUp } from './schedule'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { useAuth } from '@/lib/auth'
import { todayPlain } from '@/lib/datetime'
import { cn } from '@/lib/cn'

/** How often the countdown is recomputed. */
const TICK_MS = 30_000

/**
 * What is on right now, or next, out of today's timetable.
 *
 * The one sentence this whole feature exists to be able to say. It renders
 * nothing at all when there is no timetable and nothing when the school day is
 * over -- a dashboard announcing "next: Functions" at eleven at night, meaning
 * tomorrow morning, is worse than one that says nothing.
 */
export function NextUpCard() {
  const { current } = useSchoolYear()
  const { profile } = useAuth()
  const { data: meetings = [] } = useWeekMeetings(current?.id)

  // Re-read the clock on a timer rather than on render. Without this the card
  // says "in 20 minutes" for as long as the tab is open, which is wrong within
  // a minute and stays wrong -- and a countdown that does not count is worse
  // than a plain start time.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const today = todayPlain()
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  const cycle = cycleDayFor(
    today,
    profile?.timetable_cycle_anchor ?? null,
    profile?.timetable_cycle_anchor_day ?? null,
    profile?.timetable_cycle_length ?? null,
  )

  const todays = meetingsOn(meetings, dow, cycle)
  const next = nextUp(todays, now.getHours() * 60 + now.getMinutes())

  if (meetings.length === 0 || !next) return null

  const { meeting } = next
  const room = meeting.room ?? meeting.classRoom

  return (
    <Card className={cn(
      'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3',
      next.now && 'border-brand/40',
    )}>
      <span className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
        next.now ? 'bg-brand text-brand-contrast' : 'bg-brand-subtle text-brand',
      )}>
        <CalendarClock className="h-[18px] w-[18px]" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-text">
          {meeting.className}
        </span>
        <span className="block truncate text-[12.5px] text-text-muted">
          {clockLabel(meeting.starts_at)}–{clockLabel(meeting.ends_at)}
          {meeting.label && ` · ${meeting.label}`}
        </span>
      </span>

      {room && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] text-text-muted">
          <MapPin className="h-3.5 w-3.5" aria-hidden /> {room}
        </span>
      )}

      <span className={cn(
        'shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium',
        next.now ? 'bg-brand text-brand-contrast' : 'bg-surface-2 text-text-muted',
      )}>
        {awayLabel(next)}
      </span>

      <Link
        to="/timetable"
        className="shrink-0 text-[12.5px] text-brand no-underline hover:underline"
      >
        Timetable
      </Link>
    </Card>
  )
}
