import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { CalendarPlus, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react'
import {
  addDays, addMonths, endOfMonth, monthLabel, startOfMonth, startOfWeek, todayPlain, weekGrid,
} from '@/lib/datetime'
import type { PlainDate } from '@/lib/events'
import type { EventSource, EventWithCategory } from '@/lib/types'
import type { CalendarItem } from '@/features/assignments/toCalendarItem'
import { useCategories, useEvents } from '@/features/events/queries'
import { useUpcomingAssignments } from '@/features/classes/queries'
import { mergeCalendarItems } from '@/features/assignments/toCalendarItem'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { MonthView } from '@/features/calendar/MonthView'
import { WeekView } from '@/features/calendar/WeekView'
import { AgendaView } from '@/features/calendar/AgendaView'
import { EventDialog } from '@/features/events/EventDialog'
import { DayDialog } from '@/features/calendar/DayDialog'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { CategoryDot } from '@/components/ui/CategoryDot'
import { cn } from '@/lib/cn'

type ViewMode = 'month' | 'week' | 'agenda'
/**
 * The school calendar and your own imported calendar are different things to
 * look at, so they are separately switchable rather than one undifferentiated
 * pile of events.
 */
const SOURCE_FILTERS: Array<{ id: EventSource; label: string }> = [
  { id: 'pdf_import', label: 'School calendar' },
  { id: 'google', label: 'From Google' },
  { id: 'manual', label: 'Added by hand' },
]

const VIEWS: Array<{ id: ViewMode; label: string }> = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'agenda', label: 'Agenda' },
]

export function CalendarPage() {
  const { current, loading: yearLoading } = useSchoolYear()
  const { data: categories = [] } = useCategories()
  const reduce = useReducedMotion()
  const navigate = useNavigate()

  const [view, setView] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState<PlainDate>(todayPlain)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'all' | 'community' | 'personal'>('all')
  const [activeCategories, setActiveCategories] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EventWithCategory | null>(null)
  const [defaultDate, setDefaultDate] = useState<PlainDate | undefined>()
  const [dayOpen, setDayOpen] = useState<PlainDate | null>(null)
  const [sources, setSources] = useState<EventSource[]>([])

  // The window the current view needs. Month pads to the full six-week grid so
  // events in the leading and trailing days are fetched too.
  const range = useMemo(() => {
    if (view === 'week') {
      const days = weekGrid(anchor)
      return { from: days[0]!, to: days[6]! }
    }
    if (view === 'agenda') {
      return { from: anchor, to: addDays(anchor, 120) }
    }
    return { from: addDays(startOfWeek(startOfMonth(anchor)), 0), to: addDays(endOfMonth(anchor), 13) }
  }, [view, anchor])

  const filters = current
    ? {
        schoolYearId: current.id,
        from: range.from,
        to: range.to,
        search: search.trim() || undefined,
        scope,
        sources,
        categoryIds: activeCategories.length ? activeCategories : undefined,
      }
    : null

  const { data: events = [], isLoading, isError, refetch, isFetching } = useEvents(filters)
  const { data: assignments = [] } = useUpcomingAssignments(current?.id, 200)

  // Assignments are shown on the calendar without being stored twice --
  // they are derived from the assignment rows at read time.
  const assignmentCategory = categories.find((c) => c.slug === 'assignment') ?? null
  const items = useMemo(
    () => mergeCalendarItems(events, assignments, assignmentCategory),
    [events, assignments, assignmentCategory],
  )

  function openNew(date?: PlainDate) {
    setEditing(null)
    setDefaultDate(date)
    setDialogOpen(true)
  }

  function openEdit(e: EventWithCategory) {
    // A derived assignment is not an event row, so the event editor cannot
    // save it. Send the user to the class that owns it instead.
    const item = e as CalendarItem
    if (item.assignmentId) {
      navigate('/classes')
      return
    }
    setDayOpen(null)
    setEditing(e)
    setDefaultDate(undefined)
    setDialogOpen(true)
  }

  function openDay(date: PlainDate) {
    setDayOpen(date)
  }

  const step = (delta: number) =>
    setAnchor((a) =>
      view === 'month' ? addMonths(a, delta)
      : view === 'week' ? addDays(a, delta * 7)
      : addDays(a, delta * 30))

  const heading =
    view === 'agenda' ? 'Upcoming' : view === 'week'
      ? `Week of ${weekGrid(anchor)[0]}` : monthLabel(anchor)

  const filtersActive = activeCategories.length > 0 || scope !== 'all'

  return (
    <div className="flex flex-col gap-5">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-[28px] font-medium tracking-tight sm:text-[32px]">
              {heading}
            </h1>
            {current && (
              <p className="mt-0.5 text-[13px] text-text-muted">{current.label} school year</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-surface">
              <button
                onClick={() => step(-1)}
                aria-label="Previous"
                className="grid h-9 w-9 place-items-center rounded-l-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                onClick={() => setAnchor(todayPlain())}
                className="h-9 border-x border-border px-3 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                Today
              </button>
              <button
                onClick={() => step(1)}
                aria-label="Next"
                className="grid h-9 w-9 place-items-center rounded-r-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <Button size="sm" onClick={() => openNew()}>
              <CalendarPlus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">New event</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Calendar view"
               className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="radio"
                aria-checked={view === v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  'h-8 rounded-md px-3 text-[13px] transition-colors duration-150',
                  view === v.id
                    ? 'bg-surface font-medium text-text shadow-xs'
                    : 'text-text-subtle hover:text-text-muted',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
            <Search aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events"
              aria-label="Search events"
              className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-[13.5px] text-text placeholder:text-text-subtle hover:border-border-strong"
            />
          </div>

          <Button
            variant={filtersActive ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
            {filtersActive && (
              <span className="tabular ml-0.5 rounded-full bg-brand-contrast/20 px-1.5 text-[11px]">
                {activeCategories.length + (scope !== 'all' ? 1 : 0) + sources.length}
              </span>
            )}
          </Button>
        </div>

        {filtersOpen && (
          <motion.div
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="overflow-hidden rounded-xl border border-border bg-surface p-4"
          >
            <p className="label-caps mb-2">Show</p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {(['all', 'community', 'personal'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={cn(
                    'h-7 rounded-full border px-3 text-[12.5px] capitalize transition-colors duration-150',
                    scope === s
                      ? 'border-brand bg-brand-subtle font-medium text-brand'
                      : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                  )}
                >
                  {s === 'all' ? 'Everything' : s}
                </button>
              ))}
            </div>

            <p className="label-caps mb-2">Where from</p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {SOURCE_FILTERS.map(({ id, label }) => {
                const on = sources.includes(id)
                return (
                  <button
                    key={id}
                    aria-pressed={on}
                    onClick={() =>
                      setSources((prev) =>
                        on ? prev.filter((v) => v !== id) : [...prev, id])
                    }
                    className={cn(
                      'h-7 rounded-full border px-3 text-[12.5px] transition-colors duration-150',
                      on
                        ? 'border-brand bg-brand-subtle font-medium text-brand'
                        : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <p className="label-caps mb-2">Categories</p>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const on = activeCategories.includes(c.id)
                return (
                  <button
                    key={c.id}
                    aria-pressed={on}
                    onClick={() =>
                      setActiveCategories((prev) =>
                        on ? prev.filter((id) => id !== c.id) : [...prev, c.id])
                    }
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-colors duration-150',
                      on
                        ? 'border-brand bg-brand-subtle font-medium text-brand'
                        : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                    )}
                  >
                    <CategoryDot category={c} />
                    {c.name}
                  </button>
                )
              })}
            </div>

            {filtersActive && (
              <Button variant="ghost" size="sm" className="mt-3"
                      onClick={() => { setActiveCategories([]); setScope('all'); setSources([]) }}>
                Clear filters
              </Button>
            )}
          </motion.div>
        )}
      </motion.header>

      {yearLoading || isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[420px] w-full rounded-xl" />
        </div>
      ) : isError ? (
        <ErrorState what="your calendar" retrying={isFetching} onRetry={() => void refetch()} />
      ) : view === 'month' ? (
        <MonthView anchor={anchor} events={items} onSelect={openEdit} onSelectDay={openDay} />
      ) : view === 'week' ? (
        <WeekView anchor={anchor} events={items} onSelect={openEdit} />
      ) : (
        <AgendaView events={items} onSelect={openEdit} />
      )}

      <DayDialog
        date={dayOpen}
        events={items}
        onClose={() => setDayOpen(null)}
        onSelect={openEdit}
        onCreate={(d) => { setDayOpen(null); openNew(d) }}
      />

      <EventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        event={editing}
        defaultDate={defaultDate}
      />
    </div>
  )
}
