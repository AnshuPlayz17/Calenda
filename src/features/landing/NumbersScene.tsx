import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Reveal } from '@/components/Reveal'
import { AnimatedNumber } from '@/components/motion/AnimatedNumber'
import { schoolEvents2026_27 } from '@/data/schoolCalendar'
import { cn } from '@/lib/cn'

/**
 * The year, counted.
 *
 * Everything here is computed from src/data/schoolCalendar.ts at render, so the
 * page cannot drift from the file it describes -- if next year's calendar has
 * fifty-one dates, the headline says fifty-one without anyone editing it.
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

const EVENTS = schoolEvents2026_27
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
}

export function NumbersScene() {
  const months = byMonth()
  const cats = byCategory()
  const peak = Math.max(...months.map((m) => m.count))
  const busiest = months.find((m) => m.count === peak)
  const repeated = EVENTS.filter((e) => e.title === 'Late Start').length

  return (
    <section className="relative z-10 border-y border-border bg-surface px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-[1120px]">
        <Reveal>
          <p className="label-caps">The year, counted</p>
          <h2 className="mt-3 max-w-[22ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[40px]">
            This is the shape of a school year.
          </h2>
          <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-text-muted">
            Every figure below is counted from the school's own calendar when this page
            renders — not typed in. If next year's document has a different shape, so does
            this.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <Stat value={EVENTS.length} label="dates in the year" detail="Imported once, before you sign in." />
          <Stat value={repeated} label="share one title" detail="“Late Start”, on that many different days." />
          <Stat
            value={peak}
            label={`in ${busiest?.label ?? 'one month'}`}
            detail="The busiest month, and the one worth knowing about early."
          />
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-2">
          <MonthChart months={months} />
          <CategoryChart cats={cats} total={EVENTS.length} />
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label, detail }: { value: number; label: string; detail: string }) {
  return (
    <Reveal>
      <p className="font-display text-[52px] font-medium leading-none tracking-tight text-text sm:text-[64px]">
        <AnimatedNumber value={value} />
      </p>
      <p className="mt-2 text-[14px] font-medium text-text">{label}</p>
      <p className="mt-1 max-w-[30ch] text-[12.5px] leading-relaxed text-text-muted">{detail}</p>
    </Reveal>
  )
}

/** One measure over time: one hue, and the axis carries the labels. */
function MonthChart({ months }: { months: ReturnType<typeof byMonth> }) {
  const reduce = useReducedMotion()
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(...months.map((m) => m.count))

  return (
    <Reveal>
      <figure>
        <figcaption className="text-[15px] font-medium text-text">Dates by month</figcaption>
        <p className="mt-1 text-[12.5px] text-text-muted">
          September and June carry the most, which is when a calendar is least use to you.
        </p>

        <div className="mt-6 flex h-[180px] items-end gap-2" role="img" aria-label="School dates per month, September through June">
          {months.map((m, i) => (
            <div
              key={m.key}
              className="group relative flex h-full flex-1 flex-col justify-end"
              onPointerEnter={() => setHover(m.key)}
              onPointerLeave={() => setHover(null)}
            >
              {hover === m.key && (
                <span className="tabular absolute -top-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] font-medium text-text shadow-sm">
                  {m.count} in {m.label}
                </span>
              )}
              <motion.span
                initial={reduce ? false : { scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                transition={{ duration: 0.7, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  height: `${(m.count / max) * 100}%`,
                  transformOrigin: 'bottom',
                  // One hue; strength tracks magnitude rather than identity.
                  background: `color-mix(in oklab, var(--brand) ${45 + (m.count / max) * 55}%, var(--surface-3))`,
                }}
                className="block w-full rounded-t-[4px]"
              />
            </div>
          ))}
        </div>

        <div className="mt-2 flex gap-2 border-t border-border pt-2">
          {months.map((m) => (
            <span key={m.key} className="flex-1 text-center text-[11px] text-text-subtle">
              {m.label}
            </span>
          ))}
        </div>
      </figure>
    </Reveal>
  )
}

/** Identity lives in the words; the bar only carries how many. */
function CategoryChart({ cats, total }: { cats: ReturnType<typeof byCategory>; total: number }) {
  const reduce = useReducedMotion()
  const max = Math.max(...cats.map((c) => c.count))

  return (
    <Reveal delay={0.1}>
      <figure>
        <figcaption className="text-[15px] font-medium text-text">What those dates are</figcaption>
        <p className="mt-1 text-[12.5px] text-text-muted">
          Categorised on import, and editable — the guess is a starting point, not a verdict.
        </p>

        <ul className="mt-6 flex flex-col gap-3.5">
          {cats.map((c, i) => (
            <li key={c.category}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] text-text">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: `var(--cat-${c.category})` }}
                  />
                  {NAMES[c.category] ?? c.category}
                </span>
                <span className="tabular shrink-0 text-[12.5px] font-medium text-text-muted">
                  {c.count}
                  <span className="text-text-subtle"> / {total}</span>
                </span>
              </div>
              <div className={cn('mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2')}>
                <motion.span
                  initial={reduce ? false : { scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                  transition={{ duration: 0.8, delay: 0.05 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    width: `${(c.count / max) * 100}%`,
                    transformOrigin: 'left',
                    background: `color-mix(in oklab, var(--brand) ${40 + (c.count / max) * 60}%, var(--surface-3))`,
                  }}
                  className="block h-full rounded-full"
                />
              </div>
            </li>
          ))}
        </ul>
      </figure>
    </Reveal>
  )
}
