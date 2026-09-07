import { useState } from 'react'
import { motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { sampleSchoolYear, SAMPLE_REPEATED_TITLE } from '@/data/sampleSchoolYear'
import { useScrollScene, held, paced } from './scrollScene'
import { ChapterHeading, Measure, PinnedFrame } from './Chapter'

/**
 * A year, counted -- and counted by the scroll itself.
 *
 * This was the one chapter with no scroll mechanic at all. Everything in it
 * faded up on view and then sat there, which on a page where eleven other
 * chapters respond continuously to the wheel made it read as the place where
 * the page stopped working. The figures now count as you scroll and the bars
 * grow as you reach them: the number under your eye is a function of where the
 * page is, not of a timer that fired once when the section came into view.
 *
 * That is worth more here than anywhere else on the page, because the claim
 * this chapter makes is that these figures are counted rather than typed. A
 * number that visibly counts is the claim, performed.
 *
 * Everything is computed from src/data/sampleSchoolYear.ts at render, so the
 * page cannot drift from the file it describes -- change the sample and every
 * figure, bar and caption follows without anyone editing prose.
 *
 * The dates are invented. They were one real school's until it became clear
 * that a marketing page showing a genuine calendar reads as somebody else's
 * feed, and that the numbers would be the wrong school's the moment there is a
 * second one. The shape is true of school calendars generally; the dates are
 * nobody's.
 *
 * On colour, deliberately: the app's thirteen category colours are NOT used to
 * encode these bars. They were built to sit as small dots beside text labels,
 * and running them through a palette validator as chart marks fails hard --
 * family and academic separate by only 6.6 Delta E for normal vision, well under
 * the floor of 15, and pa-day against holiday is 3.1 for protanopia. Colour that
 * cannot be told apart is not encoding anything.
 *
 * So magnitude is carried by one hue at varying strength, which is what a single
 * measure should use, and identity is carried by the words next to each bar.
 * The category dot stays as a tie back to the app's own colour coding -- beside
 * a label, which is the job it was designed for.
 */

const EVENTS = sampleSchoolYear
const MONTH_LABELS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

/** Counted at render rather than written down, so this cannot go stale. */
function byMonth() {
  const counts = new Map<string, number>()
  for (const e of EVENTS) counts.set(e.startDate.slice(0, 7), (counts.get(e.startDate.slice(0, 7)) ?? 0) + 1)
  const keys = [...counts.keys()].sort()
  return keys.map((k, i) => ({ key: k, label: MONTH_LABELS[i] ?? k.slice(5), count: counts.get(k) ?? 0 }))
}

function byCategory() {
  const counts = new Map<string, number>()
  for (const e of EVENTS) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}

const NAMES: Record<string, string> = {
  school: 'School days and assemblies',
  'pa-day': 'PA and PD days',
  holiday: 'Holidays and breaks',
  academic: 'Academic milestones',
  family: 'Family events',
  exam: 'Exams',
  performance: 'Concerts and plays',
  sports: 'Sports fixtures',
  trips: 'Trips',
  clubs: 'Clubs',
  personal: 'Personal',
  other: 'Everything else',
}

/** The three beats, as fractions of the scene. */
const FIGURES = [0.06, 0.34]
const MONTHS = [0.30, 0.66]
const CATS = [0.58, 0.92]

const months = byMonth()
const cats = byCategory()
const peak = Math.max(...months.map((m) => m.count))
const busiest = months.find((m) => m.count === peak)
const repeated = EVENTS.filter((e) => e.title === SAMPLE_REPEATED_TITLE).length

export function NumbersScene() {
  const { ref, reduce, progress, height } = useScrollScene(paced(3))

  const heading = (
    <ChapterHeading
      eyebrow="A sample year, counted"
      title="This is the shape of a school year."
      lede={
        <>
          An example year, not any school's — but the shape is real, and every figure
          here is counted from it when this page renders rather than typed in. Your
          school's document has its own shape, and Calenda reads that one.
        </>
      }
    />
  )

  if (reduce) {
    return (
      <section className="relative z-10 border-y border-border bg-surface px-5 py-20 sm:px-8 sm:py-28">
        <Measure>
          {heading}
          <Figures progress={null} />
          <div className="mt-14 grid gap-12 lg:grid-cols-2">
            <MonthChart progress={null} />
            <CategoryChart progress={null} />
          </div>
        </Measure>
      </section>
    )
  }

  return (
    <section ref={ref} className="relative z-10 border-y border-border bg-surface" style={{ height }}>
      <PinnedFrame progress={progress}>
        <Measure className="grid items-center gap-10 lg:grid-cols-[0.78fr_1fr] lg:gap-16">
          <div>
            {heading}
            <Figures progress={progress} />
          </div>
          <div className="grid gap-10">
            <MonthChart progress={progress} />
            <CategoryChart progress={progress} />
          </div>
        </Measure>
      </PinnedFrame>
    </section>
  )
}

/**
 * A figure that counts with the scroll.
 *
 * Rendered as a motion value rather than as React state. A number that ticks
 * fifty-one times is fifty-one renders of this whole chapter if it goes
 * through useState, and this chapter contains two charts; as a motion value it
 * is fifty-one text mutations and no reconciliation at all.
 */
function Counter({ to, progress, from, span }: {
  to: number
  progress: MotionValue<number> | null
  from: number
  span: number
}) {
  const [range, values] = held([from, from + span], [0, to])
  const raw = useTransform(progress ?? ZERO, range, values)
  const shown = useTransform(raw, (v) => Math.round(v).toString())

  if (!progress) return <>{to}</>
  return <motion.span>{shown}</motion.span>
}

/** A stand-in for the reduced-motion path, where no scroll value is read. */
const ZERO = { get: () => 0, on: () => () => {}, destroy: () => {} } as unknown as MotionValue<number>

function Figures({ progress }: { progress: MotionValue<number> | null }) {
  const items = [
    { value: EVENTS.length, label: 'dates in the year', detail: 'Read from one document, in one pass.' },
    {
      value: repeated,
      label: 'share one title',
      detail: `“${SAMPLE_REPEATED_TITLE}”, on that many different days — the case that breaks naive matching.`,
    },
    {
      value: peak,
      label: `in ${busiest?.label ?? 'one month'}`,
      detail: 'The busiest month, and the one worth knowing about early.',
    },
  ]

  return (
    <dl className="mt-10 grid gap-7 sm:grid-cols-3">
      {items.map((item, i) => (
        <div key={item.label}>
          <dt className="tabular font-display text-display font-medium leading-none tracking-[-0.02em] text-accent">
            <Counter
              to={item.value}
              progress={progress}
              from={FIGURES[0]! + i * 0.06}
              span={FIGURES[1]! - FIGURES[0]!}
            />
          </dt>
          <dd className="mt-2.5 text-sm font-medium text-text">{item.label}</dd>
          <dd className="mt-1 max-w-[30ch] text-xs leading-relaxed text-text-muted">{item.detail}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One measure over time: one hue, and the axis carries the labels. */
function MonthChart({ progress }: { progress: MotionValue<number> | null }) {
  const max = Math.max(...months.map((m) => m.count))
  const step = (MONTHS[1]! - MONTHS[0]!) / months.length

  return (
    <figure>
      <figcaption className="text-sm font-medium text-text">Dates by month</figcaption>
      <p className="mt-1 text-xs text-text-muted">
        The ends of terms carry the most, which is when a calendar is least use to you.
      </p>

      <div
        className="mt-5 flex h-[150px] items-end gap-2"
        role="img"
        aria-label="School dates per month, September through June"
      >
        {months.map((m, i) => (
          <Bar
            key={m.key}
            progress={progress}
            at={MONTHS[0]! + i * step}
            span={step * 2.2}
            height={`${(m.count / max) * 100}%`}
            strength={45 + (m.count / max) * 55}
            label={`${m.count} in ${m.label}`}
            count={m.count}
          />
        ))}
      </div>

      <div className="mt-2 flex gap-2 border-t border-border pt-2">
        {months.map((m) => (
          <span key={m.key} className="flex-1 text-center text-2xs text-text-subtle">
            {m.label}
          </span>
        ))}
      </div>
    </figure>
  )
}

/**
 * One month, with its count on it.
 *
 * The number sits above the bar and rises into place with it, rather than
 * waiting for a hover -- a chart whose values are only available to a mouse is
 * a chart with no values on a phone. The hover readout is still there on top of
 * that, because the bar's own label is small and the month it belongs to is at
 * the other end of it.
 */
function Bar({ progress, at, span, height, strength, label, count }: {
  progress: MotionValue<number> | null
  at: number
  span: number
  height: string
  strength: number
  label: string
  count: number
}) {
  const [hover, setHover] = useState(false)
  const [range, values] = held([at, at + span], [0, 1])
  const scaleY = useTransform(progress ?? ZERO, range, values)
  const [nR, nV] = held([at + span * 0.5, at + span], [0, 1])
  const numberIn = useTransform(progress ?? ZERO, nR, nV)
  const numberY = useTransform(numberIn, [0, 1], [6, 0])

  const style = {
    height,
    transformOrigin: 'bottom',
    // One hue; strength tracks magnitude rather than identity.
    background: `color-mix(in oklab, var(--accent) ${strength}%, var(--surface-3))`,
  }

  return (
    <div
      className="group relative flex h-full flex-1 flex-col justify-end"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {hover && (
        <span className="tabular pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-2xs font-medium text-text shadow-sm">
          {label}
        </span>
      )}

      <div className="relative" style={{ height }}>
        {progress ? (
          <>
            <motion.span
              style={{ ...style, height: '100%', scaleY }}
              className="block w-full rounded-t-[4px] transition-[filter] duration-150 group-hover:brightness-110"
            />
            <motion.span
              style={{ opacity: numberIn, y: numberY }}
              className="tabular absolute inset-x-0 -top-4 block text-center text-2xs font-medium text-text-muted"
            >
              {count}
            </motion.span>
          </>
        ) : (
          <>
            <span style={{ ...style, height: '100%' }} className="block w-full rounded-t-[4px]" />
            <span className="tabular absolute inset-x-0 -top-4 block text-center text-2xs font-medium text-text-muted">
              {count}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/** Identity lives in the words; the bar only carries how many. */
function CategoryChart({ progress }: { progress: MotionValue<number> | null }) {
  const max = Math.max(...cats.map((c) => c.count))
  const step = (CATS[1]! - CATS[0]!) / cats.length

  return (
    <figure>
      <figcaption className="text-sm font-medium text-text">What those dates are</figcaption>
      <p className="mt-1 text-xs text-text-muted">
        Categorised on import, and editable — the guess is a starting point, not a verdict.
      </p>

      <ul className="mt-5 flex flex-col gap-3">
        {cats.map((c, i) => (
          <li key={c.category} className="group">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 text-[13px] text-text">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: `var(--cat-${c.category})` }}
                />
                {NAMES[c.category] ?? c.category}
              </span>
              <span className="tabular shrink-0 text-xs font-medium text-text-muted">
                {c.count}
                <span className="text-text-subtle"> / {EVENTS.length}</span>
                {/* The share, revealed on hover. Two numbers side by side at
                    rest is one number too many; the one people actually want
                    from a category chart is the proportion. */}
                <span className="ml-1.5 text-accent opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  {Math.round((c.count / EVENTS.length) * 100)}%
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2 transition-colors duration-150 group-hover:bg-surface-3">
              <Fill
                progress={progress}
                at={CATS[0]! + i * step}
                span={step * 2}
                width={`${(c.count / max) * 100}%`}
                strength={40 + (c.count / max) * 60}
              />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  )
}

function Fill({ progress, at, span, width, strength }: {
  progress: MotionValue<number> | null
  at: number
  span: number
  width: string
  strength: number
}) {
  const [range, values] = held([at, at + span], [0, 1])
  const scaleX = useTransform(progress ?? ZERO, range, values)
  const style = {
    width,
    transformOrigin: 'left',
    background: `color-mix(in oklab, var(--accent) ${strength}%, var(--surface-3))`,
  }

  return progress
    ? <motion.span style={{ ...style, scaleX }} className="block h-full rounded-full" />
    : <span style={style} className="block h-full rounded-full" />
}
