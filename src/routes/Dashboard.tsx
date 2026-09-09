import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight, CalendarDays, CalendarPlus, ClipboardList, GraduationCap,
  Lightbulb, NotebookPen, Sparkles,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { MagneticDock } from '@/components/motion/MagneticDock'
import { Skeleton } from '@/components/ui/Skeleton'
import { categoryColor } from '@/components/ui/CategoryDot'
import { EventDialog } from '@/features/events/EventDialog'
import { NextUpCard } from '@/features/timetable/NextUpCard'
import { FirstDay } from '@/features/welcome/FirstDay'
import { useAllGrades } from '@/features/grades/queries'
import { averageNote, averageOf } from '@/features/grades/average'
import { useEvents } from '@/features/events/queries'
import { useClasses, useRecentPages, useUpcomingAssignments } from '@/features/classes/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { useAuth } from '@/lib/auth'
import { addDays, agendaLabel, todayPlain } from '@/lib/datetime'
import { spanDays } from '@/lib/events'
import type { EventWithCategory } from '@/lib/types'

function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The one line that makes the dashboard feel personal. It names the next real
 * thing rather than reporting a count, because "your next event is Thanksgiving,
 * in 9 days" is useful and "4 events this week" is not.
 */
function summarise(today: string, todayEvents: EventWithCategory[], upcoming: EventWithCategory[]) {
  if (todayEvents.length === 1) return `Today: ${todayEvents[0]!.title}.`
  if (todayEvents.length > 1) {
    return `${todayEvents.length} things on today, starting with ${todayEvents[0]!.title}.`
  }
  const next = upcoming[0]
  if (!next) return "Nothing scheduled — you're all caught up."
  const days = spanDays(today, next.start_date) - 1
  if (days === 1) return `Next up: ${next.title}, tomorrow.`
  return `Next up: ${next.title}, in ${days} days.`
}

export function Dashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { current } = useSchoolYear()
  const reduce = useReducedMotion()
  const today = todayPlain()

  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: events = [], isLoading } = useEvents(
    current ? { schoolYearId: current.id, from: today, to: addDays(today, 60) } : null,
  )
  const { data: assignments = [] } = useUpcomingAssignments(current?.id, 5)
  const { data: classes = [] } = useClasses(current?.id)
  const { data: recentNotes = [] } = useRecentPages(4)
  const { data: allGrades = [] } = useAllGrades(current?.id)

  /**
   * One overall average, and one per class.
   *
   * Both computed here rather than stored, for the same reason the class page
   * does it: a stored average is a second copy of a fact that goes stale
   * silently, and a mark somebody did not expect is the worst thing for this
   * app to be confidently wrong about.
   */
  const average = useMemo(() => averageOf(allGrades), [allGrades])
  const byClass = useMemo(() => {
    const groups = new Map<string, typeof allGrades>()
    for (const g of allGrades) {
      const list = groups.get(g.className)
      if (list) list.push(g)
      else groups.set(g.className, [g])
    }
    return [...groups.entries()]
      .map(([className, rows]) => ({ className, percent: averageOf(rows).percent }))
      .filter((row): row is { className: string; percent: number } => row.percent !== null)
      .sort((a, b) => b.percent - a.percent)
  }, [allGrades])

  const { todayEvents, upcoming } = useMemo(() => {
    const onToday = events.filter((e) => e.start_date <= today && e.end_date >= today)
    const later = events
      .filter((e) => e.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
    return { todayEvents: onToday, upcoming: later }
  }, [events, today])

  const firstName = profile?.full_name?.split(' ')[0]

  /**
   * A genuinely new account, as opposed to a quiet week.
   *
   * All three, not just events: somebody who has classes but nothing on today
   * is having an ordinary Tuesday and wants the normal dashboard, not a
   * getting-started card telling them to do what they have already done.
   */
  const blank = !isLoading
    && classes.length === 0 && events.length === 0 && assignments.length === 0

  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
        }

  return (
    <div className="flex flex-col gap-6">
      <motion.header {...rise(0)}>
        <p className="label-caps">
          {new Date().toLocaleDateString('en-CA', {
            weekday: 'long', month: 'long', day: 'numeric',
          })}
        </p>
        <h1 className="mt-1.5 font-display text-[32px] font-medium leading-tight tracking-tight sm:text-[38px]">
          {greeting()}{firstName ? <>, {firstName}.</> : '.'}
        </h1>
        <p className="mt-1.5 max-w-[52ch] text-[15px] text-text-muted">
          {isLoading
            ? 'Checking your calendar…'
            // "You're all caught up" is what summarise() says with nothing to
            // report, and on a brand-new account that is simply false: you are
            // not caught up, you have not started. Congratulating somebody on
            // the screen where they are meant to begin is worse than saying
            // nothing.
            : blank
              ? 'Nothing in here yet — this is where your week will be.'
              : summarise(today, todayEvents, upcoming)}
        </p>
      </motion.header>

      {/* Above the dock, because "you have Functions in twenty minutes" is the
          most time-sensitive thing on this page and the only one that is wrong
          if you read it five minutes late. It renders nothing when there is no
          timetable, and nothing once the school day is over. */}
      <motion.div {...rise(1)}>
        <NextUpCard />
      </motion.div>

      {/* The four things somebody opens the dashboard to do. The dock magnifies
          under a cursor and is a plain row of buttons without one, which is the
          right answer on a phone rather than a fallback. */}
      <motion.div {...rise(1)} className="flex">
        <MagneticDock
          iconSize={44}
          maxScale={1.45}
          magneticDistance={130}
          items={[
            {
              id: 'event',
              label: 'Add event',
              icon: <CalendarPlus className="h-[18px] w-[18px]" aria-hidden />,
              onClick: () => setDialogOpen(true),
            },
            {
              id: 'assignment',
              label: 'Add assignment',
              icon: <ClipboardList className="h-[18px] w-[18px]" aria-hidden />,
              onClick: () => navigate('/classes'),
            },
            {
              id: 'note',
              label: 'New note',
              icon: <NotebookPen className="h-[18px] w-[18px]" aria-hidden />,
              onClick: () => navigate('/classes'),
            },
            {
              id: 'suggest',
              label: 'Suggest an event',
              icon: <Lightbulb className="h-[18px] w-[18px]" aria-hidden />,
              onClick: () => setDialogOpen(true),
            },
          ]}
        />
      </motion.div>

      {/* min-w-0 on both columns, and it is load-bearing rather than tidy. A
          grid item defaults to min-width: auto, so it refuses to shrink below
          its content's minimum -- and something in this column has a wide one,
          which made it 384px inside a 343px parent on a 375px phone. The whole
          dashboard scrolled sideways and the Calendar and Classes links sat off
          the right edge. min-w-0 is what lets the truncation inside actually
          take effect. */}
      {/* Day one gets one card with three steps instead of five cards each
          correctly reporting that it is empty. See FirstDay for why. */}
      {blank ? (
        <motion.div {...rise(2)}>
          <FirstDay />
        </motion.div>
      ) : (
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <motion.div {...rise(2)}>
            <Card>
              <CardHeader
                title="Today"
                action={
                  <Link to="/calendar"
                        className="flex items-center gap-1 text-[12.5px] text-text-muted no-underline hover:text-text">
                    Calendar <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                }
              />
              {isLoading ? (
                <div className="flex flex-col gap-2 px-5 pb-5">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : todayEvents.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="Nothing scheduled today"
                  description="A clear day. Anything you add will show up here."
                  size="compact"
                />
              ) : (
                <ul className="flex flex-col gap-1.5 px-5 pb-5">
                  {todayEvents.map((e) => <EventRow key={e.id} event={e} />)}
                </ul>
              )}
            </Card>
          </motion.div>
          {/* Same reason, one level down: this becomes two columns at sm and
              its children inherit the same min-width: auto. */}
          <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
            <motion.div {...rise(4)}>
              <Card>
                <CardHeader
                  title="Due soon"
                  action={
                    <Link to="/classes"
                          className="flex items-center gap-1 text-[12.5px] text-text-muted no-underline hover:text-text">
                      Classes <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  }
                />
                {assignments.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="Nothing due"
                    description="Deadlines you add to a class collect here automatically."
                    size="compact"
                  />
                ) : (
                  <ul className="flex flex-col gap-1.5 px-5 pb-5">
                    {assignments.map((a) => (
                      <li key={a.id}
                          className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-[13.5px] font-medium leading-snug text-text">
                            {a.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-text-muted">
                            {a.className}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11.5px] tabular text-text-subtle">
                          {a.due_at
                            ? new Date(a.due_at).toLocaleDateString('en-CA', {
                                month: 'short', day: 'numeric',
                              })
                            : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </motion.div>
            <motion.div {...rise(5)}>
              <Card>
                <CardHeader title="Classes" />
                {classes.length === 0 ? (
                  <EmptyState
                    icon={GraduationCap}
                    title="No classes yet"
                    description="Add your first class to keep notes, assignments and deadlines together."
                    action={
                      <Link to="/classes"
                            className="text-[13px] text-brand no-underline hover:underline">
                        Add a class
                      </Link>
                    }
                  />
                ) : (
                  <ul className="flex flex-col gap-1.5 px-5 pb-5">
                    {classes.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <Link
                          to={`/classes/${c.id}`}
                          className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 no-underline transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text">
                            {c.name}
                          </span>
                          {c.course_code && (
                            <span className="shrink-0 font-mono text-[11px] uppercase text-brand">
                              {c.course_code}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </motion.div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <motion.div {...rise(3)}>
            <Card>
              <CardHeader title="Coming up" />
              {isLoading ? (
                <div className="flex flex-col gap-2 px-5 pb-5">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : upcoming.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="You're all caught up"
                  description="Nothing in the next two months."
                  size="compact"
                />
              ) : (
                <ul className="flex flex-col gap-1.5 px-5 pb-5">
                  {upcoming.slice(0, 5).map((e) => <EventRow key={e.id} event={e} showDate />)}
                </ul>
              )}
            </Card>
          </motion.div>
          {/* Marks, and only when there are any. A card headed "Marks" reading
              "nothing yet" on a dashboard that already has four other empty
              cards is the day-one problem again, one card at a time. */}
          {average.percent !== null && (
            <motion.div {...rise(5)}>
              <Card>
                <CardHeader
                  title="Marks"
                  action={
                    <Link to="/classes"
                          className="flex items-center gap-1 text-[12.5px] text-text-muted no-underline hover:text-text">
                      Classes <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  }
                />
                <div className="px-5 pb-5">
                  <p className="font-display text-[30px] font-medium leading-none tracking-tight text-text">
                    {average.percent}%
                  </p>
                  {/* The working, same as the class page. A number without it
                      is a claim; with it, it can be checked. */}
                  <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">
                    {averageNote(average)}
                  </p>
                  <ul className="mt-3 flex flex-col gap-1">
                    {byClass.slice(0, 4).map(({ className, percent }) => (
                      <li key={className} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[13px] text-text-muted">
                          {className}
                        </span>
                        <span className="shrink-0 tabular-nums text-[13px] font-medium text-text">
                          {percent}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </motion.div>
          )}

          <motion.div {...rise(6)}>
            <Card>
              <CardHeader title="Recent notes" />
              {recentNotes.length === 0 ? (
                <EmptyState
                  icon={NotebookPen}
                  title="Your notebook is empty"
                  description="Pages you write in a class notebook show up here."
                  size="compact"
                />
              ) : (
                <ul className="flex flex-col gap-1.5 px-5 pb-5">
                  {recentNotes.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/classes/${p.class_id}`}
                        className="block rounded-lg border border-border px-3 py-2.5 no-underline transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
                      >
                        <span className="block truncate text-[13.5px] font-medium text-text">
                          {p.title || 'Untitled'}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-text-muted">
                          {p.className}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.div>
        </div>
      </div>
      )}

      <EventDialog open={dialogOpen} onClose={() => setDialogOpen(false)} event={null} />
    </div>
  )
}

function EventRow({ event, showDate }: { event: EventWithCategory; showDate?: boolean }) {
  const days = spanDays(event.start_date, event.end_date)
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
      <span
        aria-hidden
        className="mt-0.5 h-7 w-[3px] shrink-0 rounded-full"
        style={{ background: categoryColor(event.category) }}
      />
      <span className="min-w-0 flex-1">
        {/* Two lines, not an ellipsis. In a third-width column "National Day
            for Truth and Reconciliation" clipped to "National Day for Tru..."
            which tells the reader nothing they did not already know. */}
        <span className="line-clamp-2 block text-[13.5px] font-medium leading-snug text-text">
          {event.title}
        </span>
        {event.description && (
          <span className="mt-0.5 block truncate text-[12px] text-text-muted">
            {event.description}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right text-[11.5px] tabular text-text-subtle">
        {showDate && <span className="block">{agendaLabel(event.start_date)}</span>}
        {days > 1 && <span className="block">{days} days</span>}
      </span>
    </li>
  )
}
