import { useState } from 'react'
import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useTransform,
} from 'motion/react'
import type { MotionValue } from 'motion/react'
import { MoveRight } from 'lucide-react'
import { WheelCarousel } from '@/components/motion/WheelCarousel'
import type { WheelCarouselItem } from '@/components/motion/WheelCarousel'
import { sampleSchoolYear, sampleRepeatedCount } from '@/data/sampleSchoolYear'
import { PushThrough } from './Chapter'
import { useScrollScene, held, paced } from './scrollScene'
import { cn } from '@/lib/cn'

/**
 * The questions people actually ask -- answered sideways.
 *
 * This was a wheel you had to operate: drag it, click it, or press an arrow
 * key. Nobody did. A reader scrolling a page is not looking for a control, and
 * a control they do not touch is a section where five of the six answers are
 * never seen. The fix is not a bigger affordance, it is to stop asking: the
 * scroll they are already doing moves to the next question.
 *
 * It moves them *horizontally*, which is the second reason this scene exists.
 * Nine of the ten scenes above and below travel down the page, and by the sixth
 * one the reader has learned that scrolling means "the next thing appears from
 * underneath". Turning that ninety degrees costs nothing and makes this section
 * legible as a separate kind of thing -- a row of answers you are travelling
 * along, rather than another block you are falling past.
 *
 * The counts are read out of the sample calendar rather than typed, so an
 * answer here cannot quietly start disagreeing with the scene that shows the
 * import.
 */

const TOPICS: WheelCarouselItem[] = [
  {
    label: 'Does it cost anything?',
    detail: `No, and not in the way that means "not yet". Everything it runs on sits inside a
             free tier — hosting, the database, sign-in, notifications. Where something could
             not be free it was left off rather than faked.`,
  },
  {
    label: 'Is it the school’s?',
    detail: `No. It is a personal project by a student. It is not affiliated with, endorsed by,
             or run by any school. Your school's published dates are in it; your school is not
             behind it.`,
  },
  {
    label: 'What can my parents see?',
    detail: `Only what you share, one item at a time, and you can stop sharing at any point.
             Connecting a parent by itself shows them nothing — that rule is a database policy
             with a test that tries to break it.`,
  },
  {
    label: 'Does it touch Google?',
    detail: `No. Google Calendar is read only. Your events come in and sit alongside everything
             else, and nothing Calenda does writes back.`,
  },
  {
    label: 'Do I type the dates?',
    detail: `No. All ${sampleSchoolYear.length} are already there before you sign in, including
             the ${sampleRepeatedCount} that share a title and would defeat a simpler importer.`,
  },
  {
    label: 'What if I miss one?',
    detail: `You can set how far ahead each kind of thing warns you, and quiet hours you will not
             be woken inside. A reminder cannot arrive twice — the database refuses to store the
             second one.`,
  },
]

const N = TOPICS.length
/** Scroll spent before the first card is centred, and after the last. */
const LEAD = 0.08
const TAIL = 0.08
const SPAN = 1 - LEAD - TAIL
const STEP = SPAN / (N - 1)
/** How far an off-centre card fades. Not to nothing: the row has to read as a
 *  row, or the sideways travel is invisible. */
const DIM = 0.28

/**
 * The rail's geometry, as CSS rather than as measured pixels.
 *
 * The transform has to move the track by exactly one card each step. Measuring
 * the card in JavaScript would mean a layout read on mount and again on every
 * resize; a percentage would be a percentage of the track's own width, which is
 * six cards wide -- the trap that once piled forty-nine chips into a corner. So
 * the stride is a variable and the transform does arithmetic on it.
 *
 * The padding centres the first and last cards in the window at either end of
 * the travel, whatever the window is.
 */
const RAIL_VARS = {
  '--card': 'clamp(258px, 76vw, 520px)',
  '--stride': 'calc(var(--card) + 24px)',
  paddingLeft: 'max(1.25rem, calc(50% - var(--card) / 2))',
  paddingRight: 'max(1.25rem, calc(50% - var(--card) / 2))',
} as React.CSSProperties

export function QuestionScene() {
  const { ref, reduce, progress, height } = useScrollScene(paced(4))
  const [active, setActive] = useState(0)

  // One value drives the whole rail. Declared across the full scene with its
  // ends stated, because outside a declared range a scroll-linked transform
  // gets the browser's fill behaviour rather than Motion's clamp.
  const [slideRange, slideValues] = held([LEAD, 1 - TAIL], [0, N - 1])
  const slide = useTransform(progress, slideRange, slideValues)
  const back = useTransform(slide, (v) => -v)
  const x = useMotionTemplate`calc(var(--stride) * ${back})`

  useMotionValueEvent(slide, 'change', (v) => {
    const next = Math.min(N - 1, Math.max(0, Math.round(v)))
    setActive((prev) => (prev === next ? prev : next))
  })

  const heading = (
    <>
      <p className="label-caps text-accent">Before you sign up</p>
      <h2
        id="questions-heading"
        className="mt-3 max-w-[20ch] font-display text-title font-medium leading-[1.06] tracking-tight sm:text-display-sm"
      >
        The six questions everyone asks.
      </h2>
    </>
  )

  // A rotation cannot be shown to somebody who asked not to be shown one, and
  // neither can a sideways ride. Both become the same thing: the six questions
  // and their six answers, all of them present, in order.
  if (reduce) {
    return (
      <section className="relative z-10 px-5 py-16 sm:px-8 sm:py-24" aria-labelledby="questions-heading">
        <div className="mx-auto max-w-[1120px]">
          {heading}
          <div className="mt-8">
            <WheelCarousel items={TOPICS} />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={ref}
      className="relative z-10 bg-bg"
      style={{ height }}
      aria-labelledby="questions-heading"
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden pb-20 pt-16">
        <PushThrough progress={progress}>
        <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
          {heading}

          <div className="mt-6 flex items-center gap-4">
            <span className="label-caps tabular shrink-0">
              {String(active + 1).padStart(2, '0')} / {String(N).padStart(2, '0')}
            </span>
            {/* Six segments rather than one bar: this scene has six discrete
                stops, and a continuous fill would imply it does not. */}
            <span aria-hidden className="flex flex-1 gap-1.5">
              {TOPICS.map((t, i) => (
                <span
                  key={t.label}
                  className={cn(
                    'h-px flex-1 transition-colors duration-300',
                    i <= active ? 'bg-accent' : 'bg-border',
                  )}
                />
              ))}
            </span>
            <span className="hidden shrink-0 items-center gap-1.5 text-[12px] text-text-subtle sm:flex">
              Scroll
              <MoveRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </div>

        {/* The rail runs to both edges of the window on purpose: cards arriving
            from off-screen is the whole signal that there are more of them. */}
        <div className="mt-8 overflow-hidden">
          <motion.ul
            style={{ x, ...RAIL_VARS }}
            className="flex items-stretch gap-6 will-change-transform"
          >
            {TOPICS.map((t, i) => (
              <Card key={t.label} item={t} index={i} progress={progress} />
            ))}
          </motion.ul>
        </div>
      </PushThrough>
      </div>
    </section>
  )
}

/**
 * One question, dimming as it leaves the centre.
 *
 * The focus value is derived from the scene's progress rather than from the
 * rail's position, so every card's range is declared across the whole scene and
 * the ends are stated. Deriving it from `slide` would work today and would be
 * one chained transform away from the fill-behaviour bug the whole file is
 * arranged to avoid.
 */
function Card({
  item, index, progress,
}: {
  item: WheelCarouselItem
  index: number
  progress: MotionValue<number>
}) {
  const at = LEAD + index * STEP
  const range: number[] = []
  const values: number[] = []
  if (index > 0) { range.push(at - STEP * 0.7); values.push(DIM) }
  range.push(at); values.push(1)
  if (index < N - 1) { range.push(at + STEP * 0.7); values.push(DIM) }
  const [fr, fv] = held(range, values)

  const focus = useTransform(progress, fr, fv)
  const scale = useTransform(focus, [DIM, 1], [0.94, 1])

  return (
    <motion.li
      style={{ opacity: focus, scale }}
      className="group flex w-[var(--card)] shrink-0 flex-col rounded-2xl border border-border bg-surface p-6 transition-[border-color,transform] duration-200 hover:-translate-y-1 hover:border-accent-border sm:p-8"
    >
      <span className="label-caps tabular">
        {String(index + 1).padStart(2, '0')}
      </span>
      <h3 className="mt-4 font-display text-title-sm font-medium leading-[1.12] tracking-tight text-text sm:text-title">
        {item.label}
      </h3>
      <p className="mt-4 text-[14.5px] leading-relaxed text-text-muted sm:text-[15.5px]">
        {item.detail}
      </p>
    </motion.li>
  )
}
