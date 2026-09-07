import { motion, useMotionTemplate, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { CalendarClock, GraduationCap, NotebookPen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DemoPanel } from '@/features/welcome/DemoPanel'
import type { DemoKind } from '@/features/welcome/DemoPanel'
import { useScrollScene, held, paced } from './scrollScene'
import { ChapterHeading, Measure, PinnedFrame } from './Chapter'

/**
 * What else it does, panned across rather than stacked up.
 *
 * This was a CSS-sticky deck: three cards that gathered on top of each other
 * as you passed. The deck was chosen because it cost no extra scroll and
 * because the chapter before it is pinned -- two full-viewport pins in a row
 * is where a reader stops reading the argument and starts recognising the
 * device.
 *
 * It travels sideways now. The page had exactly one sideways move in twelve
 * chapters and it was asked for more, and this is the right chapter to spend
 * it on: three peers, no order between them, which is what a row is for and
 * what a stack quietly denies by putting one on top.
 *
 * Deliberately not the same sideways move as the questions chapter. That one
 * is a rail of discrete stops -- one card centred, step, next card. This is a
 * continuous pan across three full-width panels, so the reader is travelling
 * along one surface rather than clicking through a set.
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

const LEAD = 0.12
const SPAN = 0.74

export function StackScene() {
  const { ref, reduce, progress, height } = useScrollScene(paced(3))

  const heading = (
    <ChapterHeading
      eyebrow="What else it does"
      title="Three more things, and none of them ask you twice."
    />
  )

  // One value moves the whole surface. Panels are placed in panel-widths, not
  // in stage fractions -- a percentage translate is a percentage of the track,
  // which is three panels wide, and that is the trap that once piled
  // forty-nine chips into a corner.
  const [slideR, slideV] = held([LEAD, LEAD + SPAN], [0, LAYERS.length - 1])
  const slide = useTransform(progress, slideR, slideV)
  const back = useTransform(slide, (v) => -v)
  const x = useMotionTemplate`calc(var(--panel-stride) * ${back})`

  if (reduce) {
    return (
      <section className="relative z-10 px-5 py-20 sm:px-8 sm:py-28">
        <Measure>
          {heading}
          <div className="mt-12 flex flex-col gap-8">
            {LAYERS.map((layer) => <Panel key={layer.eyebrow} layer={layer} />)}
          </div>
        </Measure>
      </section>
    )
  }

  return (
    <section ref={ref} className="relative z-10" style={{ height }}>
      <PinnedFrame progress={progress} depth={320}>
        <Measure className="shrink-0">{heading}</Measure>

        {/* The track runs to both edges of the window: a panel arriving from
            off-screen is the whole signal that there are more of them. */}
        <div className="mt-10 overflow-hidden">
          <motion.ul style={{ x, ...TRACK }} className="flex items-stretch gap-8 will-change-transform">
            {LAYERS.map((layer, i) => (
              <Slide key={layer.eyebrow} layer={layer} index={i} progress={progress} />
            ))}
          </motion.ul>
        </div>
      </PinnedFrame>
    </section>
  )
}

/**
 * The track's geometry, as CSS rather than measured pixels.
 *
 * The padding centres the first and last panel in the window at either end of
 * the travel, whatever the window is.
 */
const TRACK = {
  '--panel': 'clamp(280px, 84vw, 940px)',
  '--panel-stride': 'calc(var(--panel) + 2rem)',
  paddingLeft: 'max(1.25rem, calc(50% - var(--panel) / 2))',
  paddingRight: 'max(1.25rem, calc(50% - var(--panel) / 2))',
} as React.CSSProperties

/** One panel, coming forward as it reaches the centre of the window. */
function Slide({ layer, index, progress }: {
  layer: Layer
  index: number
  progress: MotionValue<number>
}) {
  const step = SPAN / (LAYERS.length - 1)
  const at = LEAD + index * step

  const range: number[] = []
  const values: number[] = []
  if (index > 0) { range.push(at - step * 0.7); values.push(0.3) }
  range.push(at); values.push(1)
  if (index < LAYERS.length - 1) { range.push(at + step * 0.7); values.push(0.3) }
  const [fr, fv] = held(range, values)

  const focus = useTransform(progress, fr, fv)
  const scale = useTransform(focus, [0.3, 1], [0.93, 1])
  // The demo drifts against the pan. Three panels moving as one flat sheet is
  // a filmstrip; a foreground that lags its own card is a surface with depth,
  // and it costs one more transform per panel.
  const [pR, pV] = held([at - step, at + step], [26, -26])
  const drift = useTransform(progress, pR, pV)

  return (
    <motion.li style={{ opacity: focus, scale }} className="w-[var(--panel)] shrink-0">
      <Panel layer={layer} drift={drift} />
    </motion.li>
  )
}

function Panel({ layer, drift }: { layer: Layer; drift?: MotionValue<number> }) {
  const { Icon, eyebrow, title, body, demo } = layer

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface shadow-md">
      <div className="grid items-center gap-8 p-6 sm:p-9 lg:grid-cols-[0.9fr_1fr] lg:gap-12">
        <div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent-border bg-accent-subtle px-3 py-1 text-[12px] font-medium text-accent">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {eyebrow}
          </span>
          <h3 className="mt-5 max-w-[16ch] font-display text-title-sm font-medium leading-[1.1] tracking-tight text-text sm:text-title">
            {title}
          </h3>
          <p className="mt-4 max-w-[44ch] text-[14.5px] leading-relaxed text-text-muted sm:text-[15px]">
            {body}
          </p>
        </div>
        <motion.div style={drift ? { x: drift } : undefined} className="h-[240px] sm:h-[300px]" aria-hidden>
          <DemoPanel kind={demo} />
        </motion.div>
      </div>
    </article>
  )
}
