import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { CalendarClock, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useWeekMeetings } from '@/features/timetable/queries'
import { CycleBanner } from '@/features/timetable/CycleBanner'
import {
  DAY_NAMES, DAY_SHORT, clockLabel, cycleDayFor, dayBounds, meetingsOn, minutesOf,
} from '@/features/timetable/schedule'
import type { MeetingWithClass } from '@/lib/types'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { useAuth } from '@/lib/auth'
import { todayPlain } from '@/lib/datetime'
import { cn } from '@/lib/cn'

/** Monday to Friday. Weekend rows would be five sixths empty on every screen. */
const WEEK = [1, 2, 3, 4, 5] as const

/**
 * The week, as a grid on a wide screen and as a list of days on a narrow one.
 *
 * Not one layout squeezed: a five-column grid at 375px gives each lesson 60
 * pixels, which is narrower than the word "Functions". A phone gets the day
 * you are actually in, which is the only column that matters when you are
 * standing in a corridor.
 */
export function Timetable() {
  const { current } = useSchoolYear()
  const { profile } = useAuth()
  const reduce = useReducedMotion()

  // Ticked rather than read at render, so the now-line moves while the page is
  // left open -- which it will be, for a whole school day.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const {
    data: meetings = [], isLoading, isError, refetch, isFetching,
  } = useWeekMeetings(current?.id)

  const today = todayPlain()
  const todayDow = new Date(`${today}T00:00:00Z`).getUTCDay()
  const [openDay, setOpenDay] = useState<number>(
    // Land on today, unless today is a weekend, in which case Monday is the
    // next thing anybody wants to see.
    todayDow >= 1 && todayDow <= 5 ? todayDow : 1,
  )

  const cycleLength = profile?.timetable_cycle_length ?? null
  const cycleAnchor = profile?.timetable_cycle_anchor ?? null
  const cycleAnchorDay = profile?.timetable_cycle_anchor_day ?? null
  const todayCycle = cycleDayFor(today, cycleAnchor, cycleAnchorDay, cycleLength)

  const bounds = useMemo(() => dayBounds(meetings), [meetings])

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />
  if (isError) {
    return <ErrorState what="your timetable" retrying={isFetching} onRetry={() => void refetch()} />
  }

  /**
   * The cycle day for a weekday of THIS week.
   *
   * A grid column headed "Wednesday" is this Wednesday, not any Wednesday, so
   * the cycle number under it has to be that date's -- otherwise a six-day
   * cycle shows the same number under a column every week, which is exactly
   * the thing a rotating timetable is not.
   */
  const cycleFor = (dow: number): number | null => {
    if (!cycleLength) return null
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + (dow - todayDow))
    return cycleDayFor(d.toISOString().slice(0, 10), cycleAnchor, cycleAnchorDay, cycleLength)
  }

  const empty = meetings.length === 0

  return (
    <div className="flex flex-col gap-5">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h1 className="font-display text-[30px] font-medium tracking-tight">Timetable</h1>
          <p className="mt-1 text-[13.5px] text-text-muted">
            When each class meets. Add slots from inside a class.
          </p>
        </div>
        <Link
          to="/classes"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] text-text no-underline transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add slots in Classes
        </Link>
      </motion.header>

      <CycleBanner todayCycle={todayCycle} />

      {empty ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="No timetable yet"
            description="Open a class and add when it meets. Once two or three are in, this page shows your week and the dashboard can tell you what is next."
            action={
              <Link to="/classes" className="text-[13px] text-brand">
                Go to your classes
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* Wide: the whole week at once. */}
          <Card className="hidden overflow-x-auto p-0 lg:block">
            <WeekGrid
              meetings={meetings}
              bounds={bounds}
              todayDow={todayDow}
              cycleFor={cycleFor}
              now={now}
            />
          </Card>

          {/* Narrow: one day, chosen. */}
          <div className="flex flex-col gap-3 lg:hidden">
            <div role="tablist" aria-label="Day" className="flex gap-1 overflow-x-auto pb-1">
              {WEEK.map((dow) => (
                <button
                  key={dow}
                  role="tab"
                  aria-selected={openDay === dow}
                  onClick={() => setOpenDay(dow)}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-150',
                    openDay === dow
                      ? 'bg-brand-subtle font-medium text-brand'
                      : 'text-text-muted hover:bg-surface-2 hover:text-text',
                  )}
                >
                  {DAY_SHORT[dow]}
                  {dow === todayDow && (
                    <span className="ml-1 text-[11px] text-text-subtle">today</span>
                  )}
                </button>
              ))}
            </div>
            <DayList
              meetings={meetingsOn(meetings, openDay, cycleFor(openDay))}
              dayName={DAY_NAMES[openDay] ?? ''}
            />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The week as a proportional grid: a block's height is how long the lesson is.
 *
 * A list of five equal rows would say a 75-minute period and a 40-minute one
 * are the same thing, which is the single most useful fact a timetable carries.
 */
function WeekGrid({
  meetings, bounds, todayDow, cycleFor, now,
}: {
  meetings: MeetingWithClass[]
  bounds: { from: number; to: number }
  todayDow: number
  cycleFor: (dow: number) => number | null
  now: Date
}) {
  const span = Math.max(bounds.to - bounds.from, 60)
  // A pixel a minute is legible without being enormous: a 75-minute lesson is
  // 75px tall, which fits a class name and a time on two lines.
  const PX_PER_MIN = 1
  const height = span * PX_PER_MIN

  const hours: number[] = []
  for (let m = bounds.from; m <= bounds.to; m += 60) hours.push(m)

  // A time now, recomputed on a timer, for the line across today's column.
  // Read once per tick rather than per render: a value read during render
  // makes the line's position depend on what else caused a re-render.
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const showNow = minutesNow >= bounds.from && minutesNow <= bounds.to

  return (
    // pb-4 because the last hour label is centred on the grid's bottom edge,
    // so half of it hangs outside -- and the card clips it. Without this the
    // final hour reads as a rendering fault rather than a label.
    <div className="flex min-w-[720px] pb-4">
      {/* Hour labels. Their own column rather than a background image, so they
          stay put and stay readable in both themes. */}
      <div className="w-14 shrink-0 pt-8">
        <div className="relative" style={{ height }}>
          {hours.map((m) => (
            <span
              key={m}
              className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-text-subtle"
              style={{ top: (m - bounds.from) * PX_PER_MIN }}
            >
              {clockLabel(`${String(Math.floor(m / 60)).padStart(2, '0')}:00`)}
            </span>
          ))}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-5">
        {WEEK.map((dow) => {
          const day = meetingsOn(meetings, dow, cycleFor(dow))
          const cycle = cycleFor(dow)
          return (
            <div key={dow} className="min-w-0 border-l border-border">
              <div className={cn(
                'flex h-8 items-center justify-center gap-1.5 border-b border-border text-[12px]',
                dow === todayDow ? 'font-medium text-brand' : 'text-text-muted',
              )}>
                {DAY_SHORT[dow]}
                {cycle !== null && (
                  <span className="rounded bg-surface-2 px-1 text-[10px] text-text-subtle">
                    Day {cycle}
                  </span>
                )}
              </div>

              <div
                className={cn('relative', dow === todayDow && 'bg-brand-subtle/30')}
                style={{ height }}
              >
                {hours.map((m) => (
                  <div
                    key={m}
                    aria-hidden
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: (m - bounds.from) * PX_PER_MIN }}
                  />
                ))}

                {/* Where you are in the day. Only on today's column, and only
                    while the current time is inside the grid -- a line pinned
                    to the top edge all evening would read as 8am forever. */}
                {dow === todayDow && showNow && (
                  <div
                    aria-hidden
                    className="absolute inset-x-0 z-10 border-t border-danger"
                    style={{ top: (minutesNow - bounds.from) * PX_PER_MIN }}
                  >
                    <span className="absolute -left-0.5 -top-[3px] block h-1.5 w-1.5 rounded-full bg-danger" />
                  </div>
                )}

                {day.map((m) => {
                  const top = (minutesOf(m.starts_at) - bounds.from) * PX_PER_MIN
                  const tall = (minutesOf(m.ends_at) - minutesOf(m.starts_at)) * PX_PER_MIN
                  return (
                    <Link
                      key={m.id}
                      to={`/classes/${m.class_id}`}
                      className="absolute inset-x-1 overflow-hidden rounded-md border border-border bg-surface px-2 py-1 text-left no-underline transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
                      style={{ top, height: Math.max(tall, 28) }}
                    >
                      <span className="block truncate text-[12px] font-medium text-text">
                        {m.className}
                      </span>
                      <span className="block truncate text-[11px] text-text-muted">
                        {clockLabel(m.starts_at)}
                        {(m.room ?? m.classRoom) && ` · ${m.room ?? m.classRoom}`}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayList({ meetings, dayName }: { meetings: MeetingWithClass[]; dayName: string }) {
  if (meetings.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-[13.5px] text-text-muted">
          Nothing on {dayName}.
        </p>
      </Card>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {meetings.map((m) => (
        <li key={m.id}>
          <Card className="px-4 py-3">
            <Link to={`/classes/${m.class_id}`} className="flex items-baseline gap-3 no-underline">
              <span className="w-[70px] shrink-0 text-[12.5px] tabular-nums text-text-muted">
                {clockLabel(m.starts_at)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-text">
                  {m.className}
                </span>
                <span className="block truncate text-[12.5px] text-text-muted">
                  {clockLabel(m.starts_at)}–{clockLabel(m.ends_at)}
                  {m.label && ` · ${m.label}`}
                  {(m.room ?? m.classRoom) && ` · ${m.room ?? m.classRoom}`}
                </span>
              </span>
            </Link>
          </Card>
        </li>
      ))}
    </ul>
  )
}
