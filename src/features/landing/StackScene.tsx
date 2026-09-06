import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { useRef } from 'react'
import { CalendarClock, GraduationCap, NotebookPen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DemoPanel } from '@/features/welcome/DemoPanel'
import type { DemoKind } from '@/features/welcome/DemoPanel'
import { held } from './scrollScene'

/**
 * What else it does, as a deck that stacks.
 *
 * This replaces a four-chapter pinned tour, for two reasons. Two of its
 * chapters -- the school calendar, and what a parent can see -- are now told
 * properly by the import scene and the six attempts, so it was repeating the
 * page back to itself. And it sat directly after a pinned scene: two
 * full-viewport pins in a row is the point at which a reader stops reading the
 * argument and starts recognising the device.
 *
 * So this is a different mechanism. Each card sticks a little lower than the
 * one before, and the deck gathers as you pass -- the sections layer instead of
 * replacing each other, which is closer to what the product actually is. It is
 * ordinary CSS stickiness, so it costs no extra scroll distance and there is
 * nothing to keep in sync.
 */

type Layer = {
  Icon: LucideIcon
  eyebrow: string
  title: string
  body: string
  demo: DemoKind
}

const LAYERS: Layer[] = [
  {
    Icon: GraduationCap,
    eyebrow: 'Your classes',
    title: 'A workspace for each subject.',
    body: `Notes, assignments and deadlines live in the class they belong to, not in one
           long list. Course codes match your Google Calendar by pattern, and a low
           confidence match is proposed rather than applied.`,
    demo: 'classes',
  },
  {
    Icon: CalendarClock,
    eyebrow: 'Deadlines',
    title: 'Entered once, agreed everywhere.',
    body: `An assignment with a due date creates the calendar event itself. Edit either one
           and both change, because they are the same fact — so your calendar cannot quietly
           disagree with your class page.`,
    demo: 'assignments',
  },
  {
    Icon: NotebookPen,
    eyebrow: 'Reminders',
    title: 'Warned early, and only once.',
    body: `Pick the timings per category — a week before an exam, an hour before a meeting —
           and set quiet hours you will not be woken inside. A duplicate reminder is not
           unlikely, it is impossible: the database refuses to store the second one.`,
    demo: 'reminders',
  },
]

/** Clears the page header, then a card's worth of offset for each layer above. */
const TOP = (i: number) => 84 + i * 16

export function StackScene() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  return (
    <section ref={ref} className="relative z-10 px-5 pb-24 pt-16 sm:px-8 sm:pb-32 sm:pt-24">
      <div className="mx-auto max-w-[1120px]">
        <p className="label-caps">What else it does</p>
        <h2 className="mt-3 max-w-[22ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[38px]">
          Three more things, and none of them ask you twice.
        </h2>

        <div className="mt-10 flex flex-col gap-5">
          {LAYERS.map((layer, i) => (
            <Card key={layer.eyebrow} layer={layer} index={i} progress={scrollYProgress} reduce={reduce} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Card({
  layer, index, progress, reduce,
}: {
  layer: Layer
  index: number
  progress: MotionValue<number>
  reduce: boolean | null
}) {
  const { Icon, eyebrow, title, body, demo } = layer
  const last = index === LAYERS.length - 1

  // A card recedes slightly once the next one has covered it, so the deck reads
  // as depth rather than as three cards that happen to overlap. The last one
  // never recedes: there is nothing on top of it to recede behind.
  const from = index / LAYERS.length
  const [range, values] = held([from + 0.12, from + 0.42], [1, last ? 1 : 0.965])
  const scale = useTransform(progress, range, values)

  return (
    <motion.article
      style={reduce ? undefined : { scale, top: TOP(index) }}
      className="sticky overflow-hidden rounded-2xl border border-border bg-surface shadow-md"
    >
      <div className="grid items-center gap-8 p-6 sm:p-9 lg:grid-cols-[0.9fr_1fr] lg:gap-12">
        <div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-border bg-brand-subtle px-3 py-1 text-[12px] font-medium text-brand">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {eyebrow}
          </span>
          <h3 className="mt-5 max-w-[16ch] font-display text-[26px] font-medium leading-[1.14] tracking-tight text-text sm:text-[32px]">
            {title}
          </h3>
          <p className="mt-4 max-w-[44ch] text-[14.5px] leading-relaxed text-text-muted sm:text-[15px]">
            {body}
          </p>
        </div>
        <div className="h-[280px] sm:h-[320px]" aria-hidden>
          <DemoPanel kind={demo} />
        </div>
      </div>
    </motion.article>
  )
}
