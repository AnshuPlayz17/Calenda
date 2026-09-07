import { motion, useTransform } from 'motion/react'
import { useCallback, useEffect, useRef } from 'react'
import type { MotionValue } from 'motion/react'
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
  const { scrollY } = useScroll()

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

        {/* The stages are indented far enough that the chip, centred on the line,
            clears the text column. */}
        <div className="relative mt-14 pl-8 sm:pl-16">
          <Spine scrollY={scrollY} reduce={reduce} />
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

/**
 * Where on the screen the reader is assumed to be looking.
 *
 * The line's head, and the chip riding it, are positioned from this rather
 * than from the section's scroll progress. Progress was the obvious choice and
 * it was wrong by a lot: the spine is nineteen hundred pixels of stages inside
 * a section that scrolls twenty-five hundred, so a head driven by progress
 * barely moves relative to the window -- it sat below the fold for the whole
 * scene and never appeared at all. Driven from the reading line it is level
 * with the stage being read by construction, which is also the only definition
 * of "not delayed" that holds at every viewport height.
 */
const READ_LINE = 0.46

/**
 * The line the stages hang from, drawn to wherever the reader has got to.
 *
 * One measurement of the spine, taken on mount and on resize, and then the
 * head is arithmetic on the window's scroll position -- no layout read per
 * frame, and no dependence on how tall the six stages happen to be.
 */
function Spine({ scrollY, reduce }: { scrollY: MotionValue<number>; reduce: boolean | null }) {
  const ref = useRef<HTMLSpanElement>(null)
  const geom = useRef({ top: 0, height: 1 })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    geom.current = { top: r.top + window.scrollY, height: Math.max(1, r.height) }
  }, [])

  useEffect(() => {
    measure()
    // The bundled fonts land after first paint and change every stage's height.
    const settle = window.setTimeout(measure, 400)
    window.addEventListener('resize', measure)
    return () => {
      window.clearTimeout(settle)
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  const head = useTransform(scrollY, (y) => {
    const line = y + window.innerHeight * READ_LINE
    return Math.min(1, Math.max(0, (line - geom.current.top) / geom.current.height))
  })
  const top = useTransform(head, (v) => `${v * 100}%`)

  return (
    <span ref={ref} aria-hidden className="absolute bottom-2 left-[9px] top-2 w-px bg-border sm:left-[13px]">
      <motion.span
        style={reduce ? { transformOrigin: 'top' } : { scaleY: head, transformOrigin: 'top' }}
        className="absolute inset-0 block bg-accent"
      />

      {/* Centred on the line rather than beside it. Off to one side it read as
          a label pointing at the line; sitting on it, it reads as the thing
          travelling down it -- which is what it is. The dot it used to carry
          went with the move: a dot inside a chip on a line is three marks
          saying one thing. */}
      {!reduce && (
        <motion.span
          style={{ top }}
          className="absolute left-0 hidden -translate-x-1/2 -translate-y-1/2 sm:block"
        >
          <span className="relative block whitespace-nowrap rounded-full border border-accent-border bg-bg px-3 py-1 text-2xs font-medium text-accent shadow-sm">
            {FORMS.map((form, i) => (
              <Form key={form} form={form} index={i} head={head} />
            ))}
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
function Form({ form, index, head }: { form: string; index: number; head: MotionValue<number> }) {
  // Named off the head's own position down the line, so the chip says what the
  // stage it is level with says.
  const step = 1 / FORMS.length
  const at = index * step
  const [r, v] = index === FORMS.length - 1
    ? held([at, at + step * 0.25], [0, 1])
    : held([at, at + step * 0.25, at + step * 0.85, at + step * 1.1], [0, 1, 1, 0])
  const opacity = useTransform(head, r, v)

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
  // The same span the line draws over, so the stage lighting up and the chip
  // arriving at it are the same moment rather than two that nearly coincide.
  const at = (index / STAGES.length) * 0.92
  const [r, v] = held([at, at + 0.14], [0, 1])
  const t = useTransform(progress, r, v)
  const opacity = useTransform(t, [0, 1], [0.28, 1])
  const x = useTransform(t, [0, 1], [10, 0])
  // The node fills in as its stage arrives, so the line reads as passing through.
  const dot = useTransform(t, [0.2, 0.8], [0.35, 1])
  const ring = useTransform(t, [0.15, 0.75], [0.6, 3.4])
  const ringFade = useTransform(t, [0.15, 0.4, 0.8], [0, 0.55, 0])

  return (
    <motion.li style={reduce ? undefined : { opacity, x }} className="relative">
      {/* A ring that opens out of the node as the line reaches it, then goes.
          Six of them down the page make the head's arrival at each stage an
          event rather than a dot quietly changing size. */}
      {!reduce && (
        <motion.span
          aria-hidden
          style={{ scale: ring, opacity: ringFade }}
          className="absolute -left-8 top-[5px] h-[11px] w-[11px] rounded-full border border-accent sm:-left-16"
        />
      )}
      <motion.span
        aria-hidden
        style={reduce ? undefined : { scale: dot }}
        className="absolute -left-8 top-[5px] h-[11px] w-[11px] rounded-full border-2 border-bg bg-accent sm:-left-16"
      />
      <p className="label-caps tabular">{stage.n}</p>
      <h3 className="mt-1.5 max-w-[34ch] text-[16.5px] font-medium leading-snug text-text sm:text-[18px]">
        {stage.term}
      </h3>
      <p className="mt-2 max-w-[58ch] text-[14px] leading-relaxed text-text-muted">{stage.detail}</p>
    </motion.li>
  )
}
