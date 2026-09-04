import { motion, useReducedMotion } from 'motion/react'
import {
  CalendarDays, CalendarPlus, ClipboardList, FilePlus2, GraduationCap,
  Lightbulb, NotebookPen, Sparkles,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/lib/auth'

/** Greets by time of day, so the dashboard reads as personal from the first line. */
function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const quickActions = [
  { label: 'Add event', Icon: CalendarPlus },
  { label: 'Add assignment', Icon: ClipboardList },
  { label: 'New note', Icon: NotebookPen },
  { label: 'Suggest an event', Icon: Lightbulb },
]

export function Dashboard() {
  const { profile } = useAuth()
  const reduce = useReducedMotion()
  const firstName = profile?.full_name?.split(' ')[0]

  // Cards settle in sequence, but from a visible resting state -- the page is
  // fully readable the instant it paints, animation or not.
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
          {greeting()}
          {firstName ? <>, {firstName}.</> : '.'}
        </h1>
        <p className="mt-1.5 max-w-[52ch] text-[15px] text-text-muted">
          Once your school year is set up, this line will tell you what's next —
          your upcoming events, what's due, and what needs your attention today.
        </p>
      </motion.header>

      <motion.div {...rise(1)} className="flex flex-wrap gap-2">
        {quickActions.map(({ label, Icon }) => (
          <Button key={label} variant="secondary" size="sm" disabled title="Available in the next phase">
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Button>
        ))}
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div {...rise(2)} className="lg:col-span-2">
          <Card>
            <CardHeader title="Today" />
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled today"
              description="Your school events and personal calendar will appear here once the calendar is connected."
            />
          </Card>
        </motion.div>

        <motion.div {...rise(3)}>
          <Card className="h-full">
            <CardHeader title="Coming up" />
            <EmptyState
              icon={Sparkles}
              title="You're all caught up"
              description="Upcoming events from the next two weeks will show here."
            />
          </Card>
        </motion.div>

        <motion.div {...rise(4)}>
          <Card className="h-full">
            <CardHeader title="Due soon" />
            <EmptyState
              icon={ClipboardList}
              title="No assignments yet"
              description="Deadlines you add to a class will collect here automatically."
            />
          </Card>
        </motion.div>

        <motion.div {...rise(5)}>
          <Card className="h-full">
            <CardHeader title="Classes" />
            <EmptyState
              icon={GraduationCap}
              title="No classes yet"
              description="Connect Google Calendar or add your first class to get started."
            />
          </Card>
        </motion.div>

        <motion.div {...rise(6)}>
          <Card className="h-full">
            <CardHeader title="Recent notes" />
            <EmptyState
              icon={FilePlus2}
              title="Your notebook is empty"
              description="Pages you write in a class notebook will show up here."
            />
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
