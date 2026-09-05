import { motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { schoolEvents2026_27 } from '@/data/schoolCalendar'
import { useScrollScene, useBeat, scatter, held } from './scrollScene'
import { cn } from '@/lib/cn'

/**
 * The import, told with the real calendar.
 *
 * This is the one genuinely hard problem the product solves, and the page has
 * never mentioned it. The school's PDF contains forty-nine dates, and sixteen
 * of them are the words "Late Start" -- byte for byte the same string, on
 * sixteen different days. Match on the title and you keep one and lose fifteen.
 * Match on the date and you break Winter Break, which is one holiday filed as
 * two entries with different dates.
 *
 * So the scene shows exactly that, with the actual data rather than a diagram:
 * the dates leave the document, land in a grid, and then the sixteen identical
 * ones light up while everything else recedes. The reader sees the collision
 * before the copy names it.
 *
 * Forty-nine happens to be seven sevens, so the grid is square. That is luck,
 * not design, and if the school publishes fifty next year the grid reflows.
 */

const EVENTS = schoolEvents2026_27
const COLS = 7
const ROWS = Math.ceil(EVENTS.length / COLS)

/** The collision the identity key exists to survive. */
const COLLIDING_TITLE = 'Late Start'
const COLLISIONS = EVENTS.filter((e) => e.title === COLLIDING_TITLE).length

const BEATS = [
  {
    eyebrow: 'One PDF',
    title: 'The school publishes a document.',
    body: `Forty-nine dates for the year — PD days, exams, breaks, assemblies, late starts —
           laid out for a human to read, not for a calendar to parse.`,
  },
  {
    eyebrow: 'Every date',
    title: 'Calenda reads all of it.',
    body: `Each one becomes a real event on a real calendar, categorised, with the
           multi-day ones kept as spans rather than flattened to a single day.`,
  },
  {
    eyebrow: 'The hard part',
    title: `Sixteen of them are the same words.`,
    body: `“Late Start” appears ${COLLISIONS} times, identical to the character, on
           ${COLLISIONS} different days. Match on the title and fifteen disappear. So the
           identity key is the title and the date together — and even then nothing is
           merged without showing you both.`,
  },
]

export function ImportScene() {
  const { ref, reduce, progress, height } = useScrollScene(4)

  if (reduce) return <StaticImport />

  return (
    <section ref={ref} className="relative bg-bg" style={{ height }} aria-labelledby="import-heading">
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden pb-8 pt-16">
        <div className="mx-auto grid w-full max-w-[1180px] items-center gap-8 px-6 lg:grid-cols-[0.85fr_1fr] lg:gap-14">
          <BeatText progress={progress} />
          <Stage progress={progress} />
        </div>
      </div>
    </section>
  )
}

/** The three beats, cross-fading in the same block so nothing jumps. */
function BeatText({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="relative min-h-[210px] sm:min-h-[240px] lg:min-h-[300px]">
      {BEATS.map((b, i) => (
        <BeatBlock key={b.eyebrow} beat={b} index={i} progress={progress} first={i === 0} />
      ))}
    </div>
  )
}

function BeatBlock({
  beat, index, progress, first,
}: {
  beat: (typeof BEATS)[number]
  index: number
  progress: MotionValue<number>
  first: boolean
}) {
  // Each beat owns a third of the scene and fades across a slice of it on either
  // side, so two are never fully lit at once. Ranges stay inside [0, 1]: the
  // first beat has no fade-in to speak of because it must be legible at rest,
  // before anyone has scrolled at all.
  const start = index / BEATS.length
  const end = start + 1 / BEATS.length
  const [oRange, oValues] = held(
    first ? [0, end - 0.05, end + 0.05] : [start - 0.05, start + 0.04, end - 0.05, end + 0.05],
    first ? [1, 1, 0] : [0, 1, 1, 0],
  )
  const [yRange, yValues] = held(
    first ? [0, 0.01] : [start - 0.05, start + 0.04],
    first ? [0, 0] : [16, 0],
  )
  const opacity = useTransform(progress, oRange, oValues)
  const y = useTransform(progress, yRange, yValues)

  return (
    <motion.div
      style={{ opacity, y }}
      className="absolute inset-0 flex flex-col justify-center"
      aria-hidden={!first}
    >
      <p className="label-caps">{beat.eyebrow}</p>
      <h2
        id={first ? 'import-heading' : undefined}
        className="mt-2.5 max-w-[15ch] font-display text-[28px] font-medium leading-[1.12] tracking-tight text-text sm:text-[34px] lg:text-[42px]"
      >
        {beat.title}
      </h2>
      <p className="mt-4 max-w-[42ch] text-[14.5px] leading-relaxed text-text-muted sm:text-[15.5px]">
        {beat.body}
      </p>
    </motion.div>
  )
}

function Stage({ progress }: { progress: MotionValue<number> }) {
  // The document recedes as its contents leave it.
  const [poR, poV] = held([0, 0.16, 0.34], [1, 1, 0])
  const [psR, psV] = held([0, 0.34], [1, 0.94])
  const [goR, goV] = held([0.3, 0.42], [0, 1])
  const paperOpacity = useTransform(progress, poR, poV)
  const paperScale = useTransform(progress, psR, psV)
  const gridOpacity = useTransform(progress, goR, goV)

  return (
    <div className="relative aspect-[7/6] w-full max-w-[620px] justify-self-center">
      <motion.div
        style={{ opacity: paperOpacity, scale: paperScale }}
        className="absolute inset-x-[14%] inset-y-[6%] rounded-lg border border-border bg-surface p-5 shadow-md"
        aria-hidden
      >
        <p className="label-caps">Important Dates 2026–27</p>
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className="block h-[6px] rounded-full bg-surface-3"
              style={{ width: `${52 + scatter(i) * 44}%` }}
            />
          ))}
        </div>
      </motion.div>

      {/* The grid rule appears under the chips as they arrive. */}
      <motion.div
        style={{ opacity: gridOpacity }}
        aria-hidden
        className="absolute inset-0 rounded-xl border border-border"
      />

      {EVENTS.map((e, i) => (
        <Chip key={`${e.title}-${e.startDate}`} event={e} index={i} progress={progress} />
      ))}
    </div>
  )
}

function Chip({
  event, index, progress,
}: {
  event: (typeof EVENTS)[number]
  index: number
  progress: MotionValue<number>
}) {
  const colliding = event.title === COLLIDING_TITLE

  // Positions are in multiples of the chip's OWN size, because that is what a
  // percentage translate means in CSS -- translateX(50%) moves an element half
  // its own width, not half its container's. Written as fractions of the stage
  // this first time round, every chip piled into the top-left corner in a block
  // one seventh of the stage wide.
  //
  // One column across is exactly 100%, so the grid slot is (col, row) * 100.
  const col = index % COLS
  const row = Math.floor(index / COLS)
  const toX = col * 100
  const toY = row * 100

  // Where it starts: scattered over the page it is leaving, given as a fraction
  // of the stage and converted the same way. Deterministic, so the composition
  // is identical in every screenshot and can be reviewed against an old one.
  const fromX = (18 + scatter(index) * 62) * (COLS / 100) * 100
  const fromY = (10 + scatter(index + 97) * 76) * (ROWS / 100) * 100

  // Staggered so the page empties over the beat rather than all at once. The
  // spread is deliberately wide -- forty-nine simultaneous arrivals reads as a
  // transition, forty-nine staggered ones reads as reading.
  const lift = 0.08 + (index / EVENTS.length) * 0.26
  const land = lift + 0.16

  const t = useBeat(progress, lift, land)
  const x = useTransform(t, [0, 1], [`${fromX}%`, `${toX}%`])
  const y = useTransform(t, [0, 1], [`${fromY}%`, `${toY}%`])
  const scale = useTransform(t, [0, 0.5, 1], [0.55, 1.06, 1])
  const opacity = useTransform(t, [0, 0.18, 1], [0, 1, 1])

  // The reveal: everything that is not a collision recedes, so the sixteen
  // identical chips are the only thing left to look at.
  const [dR, dV] = held([0.68, 0.78], [1, colliding ? 1 : 0.16])
  const [rR, rV] = held([0.68, 0.78], [0, colliding ? 1 : 0])
  const dim = useTransform(progress, dR, dV)
  const ring = useTransform(progress, rR, rV)
  const shown = useTransform([opacity, dim], ([o, d]) => (o as number) * (d as number))

  return (
    <motion.div
      aria-hidden
      style={{
        x, y, scale, opacity: shown,
        width: `${100 / COLS}%`,
        height: `${100 / ROWS}%`,
      }}
      className="absolute left-0 top-0 p-[3px] will-change-transform"
    >
      <div
        className={cn(
          'relative flex h-full w-full items-center overflow-hidden rounded-[5px] px-1.5',
          'text-[8.5px] font-medium leading-tight sm:text-[9.5px]',
        )}
        style={{
          background: `color-mix(in oklab, var(--cat-${event.category}) 12%, var(--surface))`,
          color: `var(--cat-${event.category})`,
        }}
      >
        <span className="line-clamp-2">{event.title}</span>
        <motion.span
          style={{ opacity: ring }}
          className="pointer-events-none absolute inset-0 rounded-[5px] ring-2 ring-inset"
          // The ring colour has to be the category's, not the brand's: these are
          // sixteen school events, and recolouring them would be a lie about
          // what the app shows.
        />
      </div>
    </motion.div>
  )
}

/**
 * Reduced motion: the same argument, made by a static composition.
 *
 * Not a faster version of the animation -- there is no flight at all. The grid
 * is already assembled and the collisions are already marked, because the point
 * was never the movement; it was that sixteen of these are identical.
 */
function StaticImport() {
  return (
    <section className="bg-bg px-6 py-20" aria-labelledby="import-heading">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 lg:grid-cols-[0.85fr_1fr]">
        <div>
          <p className="label-caps">{BEATS[2]!.eyebrow}</p>
          <h2
            id="import-heading"
            className="mt-2.5 max-w-[16ch] font-display text-[30px] font-medium leading-[1.12] tracking-tight text-text sm:text-[38px]"
          >
            {BEATS[2]!.title}
          </h2>
          {BEATS.map((b) => (
            <p key={b.eyebrow} className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-text-muted">
              {b.body}
            </p>
          ))}
        </div>
        <div
          className="grid gap-[3px] rounded-xl border border-border p-[3px]"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
          aria-hidden
        >
          {EVENTS.map((e) => (
            <div
              key={`${e.title}-${e.startDate}`}
              className="flex aspect-square items-center overflow-hidden rounded-[5px] px-1.5 text-[8.5px] font-medium leading-tight"
              style={{
                background: `color-mix(in oklab, var(--cat-${e.category}) 12%, var(--surface))`,
                color: `var(--cat-${e.category})`,
                boxShadow: e.title === COLLIDING_TITLE ? 'inset 0 0 0 2px currentColor' : undefined,
                opacity: e.title === COLLIDING_TITLE ? 1 : 0.4,
              }}
            >
              <span className="line-clamp-2">{e.title}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
