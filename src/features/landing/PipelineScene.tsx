import { motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { useRef } from 'react'
import { useScroll, useReducedMotion } from 'motion/react'
import { held } from './scrollScene'
import { DataPath } from './DataPath'

/**
 * Where a date actually comes from, and where it ends up.
 *
 * This replaces three cards that converged. The convergence said "these become
 * one thing", which is true and is about as much as a gesture can carry. A
 * pipeline says the same thing and can also say what happens at each step,
 * which is the part a reader deciding whether to sign up actually wants.
 *
 * Every stage below is a real step in the code, not an illustration of one --
 * the staging table, the identity key, the linked assignment event and the
 * quiet-hours check all exist and are named in docs/SPEC.md.
 *
 * Not pinned. The line draws as the section passes, so it costs no extra scroll
 * distance, and the page already has three pinned scenes.
 */

const STAGES = [
  {
    n: '01',
    term: 'The school publishes a PDF',
    detail: `Forty-nine dates for the year, laid out for a person to read. Corrupt punctuation
             is repaired before parsing, and the import stops rather than guess if any of it
             survives into a date.`,
  },
  {
    n: '02',
    term: 'Every date is staged, not saved',
    detail: `The whole batch lands somewhere reviewable first. Nothing reaches your calendar
             until you have seen what is about to.`,
  },
  {
    n: '03',
    term: 'Collisions are surfaced, never resolved for you',
    detail: `Sixteen entries share a title. Matching is on title and date together, and where
             two might be the same thing you are shown both and asked.`,
  },
  {
    n: '04',
    term: 'Your own things join them',
    detail: `Google Calendar comes in read-only, so nothing Calenda does changes anything
             there. Classes, notes and assignments are yours and sit alongside.`,
  },
  {
    n: '05',
    term: 'A deadline writes its own event',
    detail: `An assignment with a due date is on the calendar because it is due, not because
             it was copied there. Edit either and both agree.`,
  },
  {
    n: '06',
    term: 'And it reaches you before it matters',
    detail: `Per category, as far ahead as you chose, outside the hours you asked to be left
             alone — and never twice, because the second copy is refused by the database.`,
  },
]

export function PipelineScene() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.65'] })

  return (
    <section ref={ref} className="relative z-10 px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-[1000px]">
        <p className="label-caps text-accent">From the school's PDF to your lock screen</p>
        <h2 className="mt-3 max-w-[22ch] font-display text-title font-medium leading-[1.06] tracking-tight sm:text-display-sm">
          Six steps, and you do one of them.
        </h2>
        <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-text-muted">
          The only step that is yours is the fourth — adding your classes. Everything
          before it has already happened, and everything after it follows.
        </p>

        <div className="mt-10 max-w-[620px]">
          <DataPath />
        </div>

        <div className="relative mt-14 pl-8 sm:pl-12">
          <Spine progress={scrollYProgress} reduce={reduce} />
          <ol className="flex flex-col gap-9 sm:gap-11">
            {STAGES.map((s, i) => (
              <Stage key={s.n} stage={s} index={i} progress={scrollYProgress} reduce={reduce} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

/**
 * What the date *is* at each point on the line.
 *
 * The spine used to draw itself and the stages used to fade in beside it,
 * which shows that there are six steps and nothing about what travels through
 * them. This is the thing travelling: one chip riding the line, renaming
 * itself at each stage, so the reader watches a line of text in a PDF turn
 * into a notification on a phone rather than reading that it does.
 */
const FORMS = ['a line of text', 'a staged row', 'a decision', 'one calendar', 'an event', 'a reminder']

/** The line the stages hang from, drawn as you read down it. */
function Spine({ progress, reduce }: { progress: MotionValue<number>; reduce: boolean | null }) {
  const scaleY = useTransform(progress, [0, 0.92], [0, 1])
  // `top` rather than a transform: a percentage translate would be a
  // percentage of the chip's own height, and the distance it has to cover is
  // the spine's. One absolutely-positioned element laying itself out costs
  // nothing measurable; measuring the spine on every resize would cost more.
  const top = useTransform(progress, [0, 0.92], ['0%', '100%'])

  return (
    <span aria-hidden className="absolute bottom-2 left-[9px] top-2 w-px bg-border sm:left-[13px]">
      <motion.span
        style={reduce ? { transformOrigin: 'top' } : { scaleY, transformOrigin: 'top' }}
        className="absolute inset-0 block bg-accent"
      />
      {!reduce && (
        <motion.span
          style={{ top }}
          className="absolute left-0 grid -translate-x-1/2 -translate-y-1/2 place-items-center"
        >
          <span className="relative grid place-items-center">
            <span className="absolute h-6 w-6 rounded-full bg-accent/15" />
            <span className="relative block h-2 w-2 rounded-full bg-accent" />
            <span className="absolute left-4 whitespace-nowrap rounded-md border border-accent-border bg-bg px-2 py-1 text-2xs font-medium text-accent shadow-sm">
              {FORMS.map((form, i) => (
                <Form key={form} form={form} index={i} progress={progress} />
              ))}
            </span>
          </span>
        </motion.span>
      )}
    </span>
  )
}

/**
 * One of the chip's names, on for its own stretch of the line.
 *
 * They are stacked rather than swapped, so the chip's width is the widest of
 * the six at all times and never reflows underneath the reader mid-travel.
 */
function Form({ form, index, progress }: { form: string; index: number; progress: MotionValue<number> }) {
  const step = 0.92 / FORMS.length
  const at = index * step
  const [r, v] = index === FORMS.length - 1
    ? held([at, at + step * 0.3], [0, 1])
    : held([at, at + step * 0.3, at + step * 0.9, at + step * 1.2], [0, 1, 1, 0])
  const opacity = useTransform(progress, r, v)

  return (
    <motion.span
      style={{ opacity }}
      className={index === 0 ? 'block' : 'absolute inset-0 grid place-items-center'}
    >
      {form}
    </motion.span>
  )
}

function Stage({
  stage, index, progress, reduce,
}: {
  stage: (typeof STAGES)[number]
  index: number
  progress: MotionValue<number>
  reduce: boolean | null
}) {
  const at = (index / STAGES.length) * 0.92
  const [r, v] = held([at, at + 0.14], [0, 1])
  const t = useTransform(progress, r, v)
  const opacity = useTransform(t, [0, 1], [0.28, 1])
  const x = useTransform(t, [0, 1], [10, 0])
  // The node fills in as its stage arrives, so the line reads as passing through.
  const dot = useTransform(t, [0.2, 0.8], [0.35, 1])

  return (
    <motion.li style={reduce ? undefined : { opacity, x }} className="relative">
      <motion.span
        aria-hidden
        style={reduce ? undefined : { scale: dot }}
        className="absolute -left-8 top-[5px] h-[11px] w-[11px] rounded-full border-2 border-bg bg-accent sm:-left-12"
      />
      <p className="label-caps tabular">{stage.n}</p>
      <h3 className="mt-1.5 max-w-[34ch] text-[16.5px] font-medium leading-snug text-text sm:text-[18px]">
        {stage.term}
      </h3>
      <p className="mt-2 max-w-[58ch] text-[14px] leading-relaxed text-text-muted">{stage.detail}</p>
    </motion.li>
  )
}
