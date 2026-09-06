import { motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { useRef } from 'react'
import { useScroll, useReducedMotion } from 'motion/react'
import { held } from './scrollScene'

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
    <section ref={ref} className="bg-bg px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-[1000px]">
        <p className="label-caps">From the school's PDF to your lock screen</p>
        <h2 className="mt-3 max-w-[22ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[40px]">
          Six steps, and you do one of them.
        </h2>
        <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-text-muted">
          The only step that is yours is the fourth — adding your classes. Everything
          before it has already happened, and everything after it follows.
        </p>

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

/** The line the stages hang from, drawn as you read down it. */
function Spine({ progress, reduce }: { progress: MotionValue<number>; reduce: boolean | null }) {
  const scaleY = useTransform(progress, [0, 0.92], [0, 1])
  return (
    <span aria-hidden className="absolute bottom-2 left-[9px] top-2 w-px bg-border sm:left-[13px]">
      <motion.span
        style={reduce ? { transformOrigin: 'top' } : { scaleY, transformOrigin: 'top' }}
        className="absolute inset-0 block bg-brand"
      />
    </span>
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
        className="absolute -left-8 top-[5px] h-[11px] w-[11px] rounded-full border-2 border-bg bg-brand sm:-left-12"
      />
      <p className="label-caps tabular">{stage.n}</p>
      <h3 className="mt-1.5 max-w-[34ch] text-[16.5px] font-medium leading-snug text-text sm:text-[18px]">
        {stage.term}
      </h3>
      <p className="mt-2 max-w-[58ch] text-[14px] leading-relaxed text-text-muted">{stage.detail}</p>
    </motion.li>
  )
}
