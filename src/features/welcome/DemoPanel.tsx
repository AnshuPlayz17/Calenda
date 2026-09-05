import { motion, useReducedMotion } from 'motion/react'
import { Bell, Check, Clock, Eye, EyeOff } from 'lucide-react'
import { schoolEvents2026_27 } from '@/data/schoolCalendar'
import { agendaLabel } from '@/lib/datetime'
import { cn } from '@/lib/cn'

export type DemoKind = 'calendar' | 'classes' | 'assignments' | 'reminders' | 'parents'

/**
 * Miniatures of the real screens, built from the real 2026-27 dates rather
 * than invented ones. A walkthrough that shows a screenshot of data the app
 * does not have teaches the wrong thing on the first day.
 */
export function DemoPanel({ kind }: { kind: DemoKind }) {
  return (
    <div className="h-full overflow-hidden rounded-2xl border border-border bg-surface shadow-md">
      {kind === 'calendar' && <CalendarDemo />}
      {kind === 'classes' && <ClassesDemo />}
      {kind === 'assignments' && <AssignmentsDemo />}
      {kind === 'reminders' && <RemindersDemo />}
      {kind === 'parents' && <ParentsDemo />}
    </div>
  )
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <i className="h-2 w-2 rounded-full bg-surface-3" />
          <i className="h-2 w-2 rounded-full bg-surface-3" />
          <i className="h-2 w-2 rounded-full bg-surface-3" />
        </span>
        <span className="ml-1 text-[12px] font-medium text-text-muted">{title}</span>
      </div>
      {/* Centred rather than hugging the top: the frame is a fixed height
          for every chapter, and the shorter demos looked abandoned in it. */}
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden p-4">
        {children}
      </div>
    </div>
  )
}

/** The first handful of real school dates, in order. */
const REAL = schoolEvents2026_27.slice(0, 5)

function CalendarDemo() {
  const reduce = useReducedMotion()
  return (
    <Frame title="Calendar">
      <ul className="flex flex-col gap-1.5">
        {REAL.map((e, i) => (
          <motion.li
            key={e.title + e.startDate}
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2"
          >
            <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full bg-brand" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text">
              {e.title}
            </span>
            <span className="shrink-0 text-[11px] tabular text-text-subtle">
              {agendaLabel(e.startDate)}
            </span>
          </motion.li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[11.5px] text-text-subtle">
        …and {schoolEvents2026_27.length - REAL.length} more, already imported
      </p>
    </Frame>
  )
}

const DEMO_CLASSES = [
  { name: 'Computer Science', code: 'ICS3U', notes: 12, due: 2 },
  { name: 'Functions', code: 'MCR3U', notes: 8, due: 1 },
  { name: 'Biology', code: 'SBI3U', notes: 15, due: 3 },
]

function ClassesDemo() {
  const reduce = useReducedMotion()
  return (
    <Frame title="Classes">
      <div className="grid grid-cols-2 gap-2">
        {DEMO_CLASSES.map((c, i) => (
          <motion.div
            key={c.code}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-lg border border-border p-3"
          >
            <p className="truncate text-[12.5px] font-medium text-text">{c.name}</p>
            <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wider text-text-subtle">
              {c.code}
            </p>
            <p className="mt-2 text-[11px] text-text-muted">
              {c.notes} notes · {c.due} due
            </p>
          </motion.div>
        ))}
      </div>
    </Frame>
  )
}

function AssignmentsDemo() {
  const reduce = useReducedMotion()
  return (
    <Frame title="Biology · Assignments">
      <div className="flex flex-col gap-2">
        <div className="rounded-lg border border-border p-3">
          <p className="text-[12.5px] font-medium text-text">Cell respiration lab</p>
          <p className="mt-1 text-[11.5px] text-text-muted">Due Fri 16 Oct</p>
        </div>

        <motion.div
          aria-hidden
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="flex items-center justify-center gap-2 text-[11px] text-text-subtle"
        >
          <span className="h-px w-8 bg-border" />
          appears on your calendar
          <span className="h-px w-8 bg-border" />
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2.5 rounded-lg border border-brand-border bg-brand-subtle px-3 py-2"
        >
          <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full bg-brand" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text">
            Cell respiration lab
          </span>
          <span className="shrink-0 text-[11px] tabular text-brand">Fri 16 Oct</span>
        </motion.div>
      </div>
    </Frame>
  )
}

const OFFSETS = ['1 week before', '1 day before', '1 hour before']

function RemindersDemo() {
  const reduce = useReducedMotion()
  return (
    <Frame title="Notifications">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5">
          <Bell className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
          <span className="flex-1 text-[12.5px] font-medium text-text">Exams</span>
          <span className="h-5 w-9 rounded-full bg-brand p-0.5" aria-hidden>
            <span className="block h-4 w-4 translate-x-4 rounded-full bg-white" />
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {OFFSETS.map((o, i) => (
            <motion.span
              key={o}
              initial={reduce ? false : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.2 + i * 0.09 }}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px]',
                i < 2
                  ? 'border-brand-border bg-brand-subtle font-medium text-brand'
                  : 'border-border text-text-muted',
              )}
            >
              {o}
            </motion.span>
          ))}
        </div>

        <div className="mt-1 rounded-lg border border-border px-3 py-2.5">
          <p className="flex items-center gap-2 text-[12px] font-medium text-text">
            <Clock className="h-3.5 w-3.5 text-text-subtle" aria-hidden />
            Quiet 22:00 – 07:00
          </p>
          <div className="mt-2 flex gap-1">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span
                key={`${d}${i}`}
                className={cn(
                  'grid h-6 w-6 place-items-center rounded text-[10.5px]',
                  i < 5
                    ? 'bg-brand-subtle font-medium text-brand'
                    : 'bg-surface-2 text-text-subtle',
                )}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  )
}

function ParentsDemo() {
  const reduce = useReducedMotion()
  const rows = [
    { label: 'Biology', shared: true },
    { label: 'Computer Science', shared: false },
    { label: 'Private notes', shared: false, locked: true },
  ]
  return (
    <Frame title="Sharing">
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.label}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5"
          >
            {r.shared ? (
              <Eye className="h-4 w-4 shrink-0 text-brand" aria-hidden />
            ) : (
              <EyeOff className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
            )}
            <span className="flex-1 truncate text-[12.5px] text-text">{r.label}</span>
            <span
              className={cn(
                'shrink-0 text-[11px]',
                r.shared ? 'font-medium text-brand' : 'text-text-subtle',
              )}
            >
              {r.locked ? 'never shared' : r.shared ? 'shared' : 'private'}
            </span>
          </motion.div>
        ))}
        <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-text-subtle">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Connecting a parent shows them nothing on its own
        </p>
      </div>
    </Frame>
  )
}
