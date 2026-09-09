import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, GraduationCap, Upload } from 'lucide-react'
import { Card } from '@/components/ui/Card'

/**
 * The dashboard on day one, when there is genuinely nothing yet.
 *
 * WHAT THIS REPLACES
 *
 * Five cards, each correctly reporting that it was empty: "Nothing scheduled
 * today", "Nothing due", "No classes yet", "You're all caught up", "Your
 * notebook is empty". Every one of those sentences is right, and together they
 * are the worst possible first impression -- a wall of nothing, with the single
 * useful link ("Add a class") buried in the third box.
 *
 * The line above them was worse than useless: "Nothing scheduled -- you're all
 * caught up." You are not caught up. You have not started. Telling somebody
 * they are finished on the screen where they are meant to begin is the kind of
 * copy that is technically true and actively unhelpful.
 *
 * One card, three steps, in the order they actually depend on each other.
 * Classes first because everything hangs off them -- notes, assignments, marks
 * and timetable slots all need one to exist.
 */
export function FirstDay() {
  const steps = [
    {
      to: '/classes',
      Icon: GraduationCap,
      title: 'Add your classes',
      body: 'Everything else hangs off them — notes, assignments, marks and times.',
      first: true,
    },
    {
      to: '/timetable',
      Icon: CalendarClock,
      title: 'Say when they meet',
      body: 'Then the dashboard can tell you what you have next, and where.',
    },
    {
      to: '/settings',
      Icon: Upload,
      title: 'Bring in a calendar',
      body: 'Import from Google, or let an admin load the school year.',
    },
  ]

  return (
    <Card className="p-6 sm:p-7">
      <h2 className="font-display text-[22px] font-medium tracking-tight text-text">
        Set up your year
      </h2>
      <p className="mt-1.5 max-w-[54ch] text-[13.5px] text-text-muted">
        Three things, and the first one takes about a minute. Nothing here is
        required — you can add a class and stop.
      </p>

      <ol className="mt-5 flex flex-col gap-2">
        {steps.map(({ to, Icon, title, body, first }, i) => (
          <li key={to}>
            <Link
              to={to}
              className="group flex items-start gap-3 rounded-xl border border-border p-3.5 no-underline transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
            >
              <span
                aria-hidden
                className={
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg '
                  // Only the first step is emphasised. Three equally weighted
                  // calls to action is the same problem as five empty cards.
                  + (first ? 'bg-brand text-brand-contrast' : 'bg-surface-2 text-text-subtle')
                }
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-text">
                  <span className="text-text-subtle">{i + 1}. </span>{title}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-text-muted">
                  {body}
                </span>
              </span>
              <ArrowRight
                aria-hidden
                className="mt-1 h-4 w-4 shrink-0 text-text-subtle transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  )
}
