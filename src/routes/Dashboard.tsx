import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight, CalendarDays, CalendarPlus, ClipboardList, GraduationCap,
  Lightbulb, NotebookPen, Sparkles,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { categoryColor } from '@/components/ui/CategoryDot'
import { EventDialog } from '@/features/events/EventDialog'
import { useEvents } from '@/features/events/queries'
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
  const { profile } = useAuth()
  const { current } = useSchoolYear()
  const reduce = useReducedMotion()
  const today = todayPlain()

  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: events = [], isLoading } = useEvents(
    current ? { schoolYearId: current.id, from: today, to: addDays(today, 60) } : null,
  )

  const { todayEvents, upcoming } = useMemo(() => {
    const onToday = events.filter((e) => e.start_date <= today && e.end_date >= today)
    const later = events
      .filter((e) => e.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
    return { todayEvents: onToday, upcoming: later }
  }, [events, today])

  const firstName = profile?.full_name?.split(' ')[0]

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
          {isLoading ? 'Checking your calendar…' : summarise(today, todayEvents, upcoming)}
        </p>
      </motion.header>

      <motion.div {...rise(1)} className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
          <CalendarPlus className="h-4 w-4" aria-hidden /> Add event
        </Button>
        <Button variant="secondary" size="sm" disabled title="Arrives with class workspaces">
          <ClipboardList className="h-4 w-4" aria-hidden /> Add assignment
        </Button>
        <Button variant="secondary" size="sm" disabled title="Arrives with class notebooks">
          <NotebookPen className="h-4 w-4" aria-hidden /> New note
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
          <Lightbulb className="h-4 w-4" aria-hidden /> Suggest an event
        </Button>
      </motion.div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <motion.div {...rise(2)} className="lg:col-span-2">
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
              />
            ) : (
              <ul className="flex flex-col gap-1.5 px-5 pb-5">
                {todayEvents.map((e) => <EventRow key={e.id} event={e} />)}
              </ul>
            )}
          </Card>
        </motion.div>

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
              />
            ) : (
              <ul className="flex flex-col gap-1.5 px-5 pb-5">
                {upcoming.slice(0, 5).map((e) => <EventRow key={e.id} event={e} showDate />)}
              </ul>
            )}
          </Card>
        </motion.div>

        <motion.div {...rise(4)}>
          <Card>
            <CardHeader title="Due soon" />
            <EmptyState
              icon={ClipboardList}
              title="No assignments yet"
              description="Deadlines you add to a class will collect here automatically."
            />
          </Card>
        </motion.div>

        <motion.div {...rise(5)}>
          <Card>
            <CardHeader title="Classes" />
            <EmptyState
              icon={GraduationCap}
              title="No classes yet"
              description="Connect Google Calendar or add your first class to get started."
            />
          </Card>
        </motion.div>

        <motion.div {...rise(6)}>
          <Card>
            <CardHeader title="Recent notes" />
            <EmptyState
              icon={NotebookPen}
              title="Your notebook is empty"
              description="Pages you write in a class notebook will show up here."
            />
          </Card>
        </motion.div>
      </div>

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
        <span className="block truncate text-[13.5px] font-medium text-text">{event.title}</span>
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
