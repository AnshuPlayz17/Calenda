import { useRef } from 'react'
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { CalendarDays, FileText, NotebookPen } from 'lucide-react'
import { held } from './scrollScene'

/**
 * The problem, shown converging rather than listed.
 *
 * Three sources of school information sit apart and askew, and pull into one
 * aligned stack as the section passes. That is the product's whole claim in one
 * gesture, and it is cheaper to understand than the sentence describing it.
 *
 * Deliberately NOT pinned. The page already holds two pinned scenes and a
 * pinned tour, and a fourth would be the point at which "scroll story" becomes
 * the only idea the page has. This one is driven by the section's own passage
 * through the viewport, so it costs no extra scroll distance and gives the page
 * a second rhythm to sit against the first.
 */

const SOURCES = [
  {
    Icon: FileText,
    before: 'A PDF of important dates',
    after: 'Imported once, on your calendar all year — with duplicates caught before they land.',
  },
  {
    Icon: CalendarDays,
    before: 'Google Calendar for classes',
    after: 'Brought in alongside everything else, read-only, so nothing in Google changes.',
  },
  {
    Icon: NotebookPen,
    before: 'Notes and deadlines scattered',
    after: 'A workspace per class. Add an assignment and it appears on your calendar automatically.',
  },
]

/** Where each card starts: apart, and slightly off true. */
const SCATTER = [
  { x: -34, y: 26, rotate: -3.5 },
  { x: 0, y: -18, rotate: 2 },
  { x: 34, y: 30, rotate: 3.5 },
]

export function ConvergeScene() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  // Runs while the section crosses the viewport: nothing is pinned, so the
  // gesture completes exactly as the reader arrives at it.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center'],
  })

  return (
    <section ref={ref} className="border-y border-border bg-surface px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-[1120px]">
        <h2 className="max-w-[20ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[38px]">
          School information lives in too many places.
        </h2>
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-text-muted">
          A document, a calendar, and whatever you wrote down. Nothing that knows about
          the others, and nothing that tells you what today actually needs.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {SOURCES.map((s, i) => (
            <Card key={s.before} source={s} index={i} progress={scrollYProgress} reduce={reduce} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Card({
  source, index, progress, reduce,
}: {
  source: (typeof SOURCES)[number]
  index: number
  progress: MotionValue<number>
  reduce: boolean | null
}) {
  const { Icon, before, after } = source
  const from = SCATTER[index]!

  // held(), not clamp: on the native scroll-timeline path a value outside the
  // declared range follows the browser's fill behaviour rather than Motion's.
  const [range, unit] = held([0.05, 0.72], [0, 1])
  const t = useTransform(progress, range, unit)

  const x = useTransform(t, [0, 1], [from.x, 0])
  const y = useTransform(t, [0, 1], [from.y, 0])
  const rotate = useTransform(t, [0, 1], [from.rotate, 0])
  const opacity = useTransform(t, [0, 0.35], [0, 1])

  const style = reduce ? undefined : { x, y, rotate, opacity }

  return (
    <motion.div
      style={style}
      className="rounded-xl border border-border bg-bg p-5"
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-text-subtle">
        <Icon className="h-[15px] w-[15px]" aria-hidden />
      </span>
      <p className="mt-4 text-[13px] text-text-subtle line-through decoration-text-subtle/40">
        {before}
      </p>
      <p className="mt-2 text-[14.5px] leading-relaxed text-text">{after}</p>
    </motion.div>
  )
}
