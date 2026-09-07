import { useCallback, useEffect, useRef, useState } from 'react'
import {
  motion, useMotionTemplate, useMotionValue, useSpring, useTransform,
} from 'motion/react'
import type { MotionValue } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import { SCHOOLS } from '@/data/schools'
import type { School } from '@/data/schools'
import { useScrollScene, held } from './scrollScene'

/**
 * Fifteen schools, arriving one at a time and then settling into a dock.
 *
 * Two layouts and one set of elements. The cards appear in a three-by-five
 * grid as you scroll, one per hundred pixels or so, and then travel down into
 * a single row of fifteen while a line rises behind them. They are the same
 * fifteen links throughout, so the row is not a decoration of the grid -- it
 * is the grid, still clickable, out of the way.
 *
 * The wording is the careful part. None of these schools has agreed to
 * anything, so "partnered with" is not available: it is an endorsement claim
 * under fifteen trademarks, and the easiest claim on the page for anyone to
 * check. "Works with" is a statement about software reading a published
 * document, which is what this actually is, and the caption says the rest.
 */

/**
 * Where each card sits, as fractions of the stage.
 *
 * The grid and the dock want opposite widths: three columns look abandoned
 * spread across eleven hundred pixels, and fifteen tiles in a row need every
 * one of them. So the stage is as wide as the dock needs and the grid is
 * squeezed toward its centre by `spread` -- one number, recomputed when the
 * stage is resized, rather than two containers that have to be kept in step.
 */
function gridSlot(i: number, cols: number, spread: number) {
  const rows = Math.ceil(SCHOOLS.length / cols)
  const col = ((i % cols) + 0.5) / cols
  return {
    x: 0.5 + (col - 0.5) * spread,
    // The grid gets the whole stage height. It never shares it with the
    // dock -- by the time the dock exists the grid has become it.
    y: ((Math.floor(i / cols) + 0.5) / rows) * 0.94 + 0.01,
  }
}

/**
 * Five across on anything with the room, three across on a phone.
 *
 * Fifteen divides both ways, which is the only reason this is a choice rather
 * than a compromise: five columns by three rows on a laptop and three by five
 * on a phone are the same fifteen cards, each shaped to the window it is in.
 * Five columns on a 390px screen would be 78px per card, which is narrower
 * than the names.
 */
function columnsFor(stageWidth: number) {
  return stageWidth >= 720 ? 5 : 3
}
function dockSlot(i: number) {
  return { x: (i + 0.5) / SCHOOLS.length, y: 0.86 }
}

/**
 * How wide the grid wants to be, by column count. Beyond this the columns are
 * pulled back toward the centre rather than drifting further apart -- three
 * columns spread across eleven hundred pixels stop reading as a group.
 */
const GRID_NATURAL_WIDTH: Record<number, number> = { 3: 560, 5: 960 }

/**
 * The tile, sized here rather than in a Tailwind clamp.
 *
 * The dock's scale has to be derived from it -- fifteen tiles have to fit
 * across the stage without touching -- and a size that lives only in a CSS
 * clamp is a size this cannot read. So it is computed once and published as a
 * variable that the class then uses, which keeps one number in one place.
 */
function tileSize(viewportWidth: number) {
  return Math.round(Math.min(96, Math.max(44, viewportWidth * 0.075)))
}

/** Of the space each dock tile is allotted, how much the tile itself takes. */
const DOCK_FILL = 0.84
const DOCK_SCALE_MAX = 0.85
const DOCK_SCALE_MIN = 0.4

const APPEAR_FROM = 0.03
const APPEAR_TO = 0.55
const STEP = (APPEAR_TO - APPEAR_FROM) / SCHOOLS.length
const MOVE_FROM = 0.62
const MOVE_TO = 0.86
export function SchoolsScene() {
  const { ref, reduce, progress, height } = useScrollScene(4)

  const stageRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(3)
  const [spread, setSpread] = useState(1)
  const [dockScale, setDockScale] = useState(0.5)
  // The stage's own pixel size, published as CSS variables. Measured once and
  // on resize rather than per frame: every card's travel is expressed as
  // calc() against these, so the transforms stay compositor work and no card
  // needs its own layout read.
  const rect = useRef({ left: 0, width: 0 })

  const measure = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    rect.current = { left: r.left, width: r.width }
    el.style.setProperty('--stage-w', `${r.width}px`)
    el.style.setProperty('--stage-h', `${r.height}px`)
    const nextCols = columnsFor(r.width)
    setCols((prev) => (prev === nextCols ? prev : nextCols))
    const natural = GRID_NATURAL_WIDTH[nextCols] ?? r.width
    const next = r.width > 0 ? Math.min(1, natural / r.width) : 1
    setSpread((prev) => (Math.abs(prev - next) < 0.01 ? prev : next))

    const tile = tileSize(window.innerWidth)
    el.style.setProperty('--tile', `${tile}px`)
    const pitch = r.width / SCHOOLS.length
    const dock = Math.min(
      DOCK_SCALE_MAX,
      Math.max(DOCK_SCALE_MIN, (pitch * DOCK_FILL) / tile),
    )
    setDockScale((prev) => (Math.abs(prev - dock) < 0.01 ? prev : dock))
  }, [])

  useEffect(() => {
    measure()
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    // No scroll listener. The stage lives inside a sticky frame, so while the
    // scene is pinned its position in the viewport does not change -- and
    // measuring on every scroll frame would be a forced layout per frame, for
    // a number that has not moved.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  // The pointer's position along the dock, read by every card. Infinity parks
  // them all at rest, which is the honest way to say "nobody is hovering".
  const pointerX = useMotionValue(Number.POSITIVE_INFINITY)

  // 0 while the cards are a grid, 1 once they are a dock. Gates the pointer
  // magnification, which would otherwise swell cards mid-flight.
  const [dockRange, dockValues] = held([MOVE_FROM, MOVE_TO], [0, 1])
  const docked = useTransform(progress, dockRange, dockValues)

  const [lineRange, lineValues] = held([MOVE_FROM + 0.06, MOVE_TO], [0, 1])
  const lineIn = useTransform(progress, lineRange, lineValues)
  const lineY = useTransform(lineIn, [0, 1], [26, 0])

  if (reduce) return <StaticSchools />

  return (
    <section
      ref={ref}
      className="relative z-10 border-t border-border bg-surface"
      style={{ height }}
      aria-labelledby="schools-heading"
    >
      {/* The extra bottom padding below xl is for the companion pill, which is
          fixed to the bottom of the window there. */}
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden px-5 pb-16 pt-20 sm:px-8 xl:pb-6">
        <div className="mx-auto w-full max-w-[1120px] shrink-0 text-center">
          <p className="label-caps">The schools</p>
          <h2
            id="schools-heading"
            className="mx-auto mt-2.5 max-w-[24ch] font-display text-[24px] font-medium leading-tight tracking-tight sm:text-[30px]"
          >
            Fifteen independent schools across the GTA.
          </h2>
        </div>

        <div
          ref={stageRef}
          onPointerMove={(e) => { if (e.pointerType === 'mouse') pointerX.set(e.clientX) }}
          onPointerLeave={() => pointerX.set(Number.POSITIVE_INFINITY)}
          className="relative mx-auto mt-5 w-full max-w-[1120px] flex-1"
        >
          {/* Rises behind the dock as the grid clears out of its way. */}
          <motion.p
            aria-hidden
            style={{ opacity: lineIn, y: lineY }}
            className="pointer-events-none absolute inset-x-0 top-[46%] text-center font-display text-[34px] font-medium leading-[1.1] tracking-tight text-text sm:text-[54px] lg:text-[68px]"
          >
            <span className="italic">Calenda</span> works with all of them.
          </motion.p>

          {SCHOOLS.map((school, i) => (
            <Card
              key={school.name}
              school={school}
              index={i}
              progress={progress}
              cols={cols}
              spread={spread}
              dockScale={dockScale}
              docked={docked}
              pointerX={pointerX}
              rect={rect}
            />
          ))}
        </div>

        <p className="mx-auto w-full max-w-[86ch] shrink-0 pt-2 text-center text-[11px] leading-relaxed text-text-subtle">
          Calenda reads the calendar each school publishes. It is not affiliated with,
          endorsed by, or a product of any of them, and no school here has any
          involvement in it. Crests are each school's own, shown from the school's own
          site, and link there.
        </p>
      </div>
    </section>
  )
}

/**
 * One school. Travels from its grid slot to its dock slot.
 *
 * Three nested elements because three separate things want the transform
 * property: the travel, the centring, and the scale. Putting any two on the
 * same element means one silently overwrites the other, and the one that wins
 * depends on which library wrote it last.
 */
function Card({
  school, index, progress, cols, spread, dockScale, docked, pointerX, rect,
}: {
  school: School
  index: number
  progress: MotionValue<number>
  cols: number
  spread: number
  dockScale: number
  docked: MotionValue<number>
  pointerX: MotionValue<number>
  rect: React.RefObject<{ left: number; width: number }>
}) {
  const g = gridSlot(index, cols, spread)
  const d = dockSlot(index)
  const at = APPEAR_FROM + index * STEP

  // Arrival: a card rises the last few pixels into its slot rather than
  // simply switching on, so fifteen of them read as a list filling in.
  const [aR, aV] = held([at, at + STEP * 1.6], [0, 1])
  const appear = useTransform(progress, aR, aV)
  const enterY = useTransform(appear, [0, 1], [14, 0])

  const [tR, tV] = held([MOVE_FROM, MOVE_TO], [0, 1])
  const travel = useTransform(progress, tR, tV)

  const fx = useTransform(travel, [0, 1], [g.x, d.x])
  const fy = useTransform(travel, [0, 1], [g.y, d.y])
  const x = useMotionTemplate`calc(var(--stage-w) * ${fx})`
  const y = useMotionTemplate`calc(var(--stage-h) * ${fy})`

  const shrink = useTransform(travel, [0, 1], [1, dockScale])
  // The caption is gone before the card is small enough for it to be unreadable.
  const captionOut = useTransform(travel, [0, 0.45], [1, 0])
  const caption = useTransform([appear, captionOut], ([a, c]) => (a as number) * (c as number))

  // Pointer magnification, and only once docked. A card swelling while it is
  // still crossing the stage looks like a bug, because it is one.
  const magnet = useTransform([pointerX, docked], ([px, dk]) => {
    const p = px as number
    if (!Number.isFinite(p) || (dk as number) < 0.6 || !rect.current) return 1
    const centre = rect.current.left + rect.current.width * d.x
    const distance = Math.abs(p - centre)
    const falloff = Math.max(0, 1 - distance / 130)
    return 1 + falloff * 0.55 * (dk as number)
  })
  const magnetSpring = useSpring(magnet, { stiffness: 320, damping: 24, mass: 0.4 })
  const scale = useTransform([shrink, magnetSpring], ([s, m]) => (s as number) * (m as number))

  return (
    <motion.div style={{ x, y }} className="absolute left-0 top-0">
      <div className="-translate-x-1/2 -translate-y-1/2">
        <motion.div style={{ scale, opacity: appear }} className="origin-center">
          <motion.a
            href={school.site}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${school.name} — opens the school's website`}
            style={{ y: enterY }}
            className="group relative block outline-none"
          >
            <span className="relative grid h-[var(--tile,56px)] w-[var(--tile,56px)] place-items-center overflow-hidden rounded-2xl border border-border bg-bg transition-colors duration-200 group-hover:border-brand-border group-focus-visible:ring-2 group-focus-visible:ring-[var(--ring)]">
              <Crest school={school} />
              <ArrowUpRight
                aria-hidden
                className="absolute right-1 top-1 h-3 w-3 text-text-subtle opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
            </span>

            <motion.span
              style={{ opacity: caption }}
              className="pointer-events-none absolute left-1/2 top-[calc(100%+7px)] block w-[clamp(96px,13vw,190px)] -translate-x-1/2 text-center"
            >
              <span className="block text-[11px] font-medium leading-[1.2] text-text sm:text-[13px]">
                {school.name}
              </span>
              {school.acronym && (
                <span className="label-caps mt-0.5 block">{school.acronym}</span>
              )}
            </motion.span>
          </motion.a>
        </motion.div>
      </div>
    </motion.div>
  )
}

/**
 * The school's crest, from the school's own server -- or its initials.
 *
 * The fallback is not a spinner or a broken-image icon. A hotlinked file is
 * out of our control by definition: it can move, be renamed in a redesign, or
 * be blocked by whoever is reading. So the monogram is drawn to look like a
 * choice, and a grid that is half crests and half monograms still looks
 * deliberate.
 */
function Crest({ school }: { school: School }) {
  const [failed, setFailed] = useState(false)

  if (!school.logo || failed) {
    return (
      <span
        aria-hidden
        className="font-display text-[13px] font-medium tracking-tight text-text-muted sm:text-[15px]"
      >
        {school.monogram}
      </span>
    )
  }

  return (
    <img
      src={school.logo}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-[62%] w-[62%] object-contain"
    />
  )
}

/**
 * Reduced motion gets the grid, the line and the links -- everything the scene
 * says, with none of the travel.
 *
 * Applying the test in CLAUDE.md: render the still version first and ask
 * whether it still makes the argument. It does, and more directly. The travel
 * from grid to dock is a way of getting fifteen cards out of the way once
 * they have been read; somebody who is not being shown the animation has read
 * them already.
 */
function StaticSchools() {
  return (
    <section
      className="relative z-10 border-t border-border bg-surface px-5 py-16 sm:px-8"
      aria-labelledby="schools-heading"
    >
      <div className="mx-auto w-full max-w-[1120px]">
        <p className="label-caps">The schools</p>
        <h2
          id="schools-heading"
          className="mt-2.5 max-w-[24ch] font-display text-[26px] font-medium leading-tight tracking-tight sm:text-[32px]"
        >
          Fifteen independent schools across the GTA.
        </h2>

        <ul className="mt-8 grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-5">
          {SCHOOLS.map((school) => (
            <li key={school.name}>
              <a
                href={school.site}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col items-center gap-2.5 no-underline outline-none"
              >
                <span className="grid h-[clamp(48px,7.5vw,96px)] w-[clamp(48px,7.5vw,96px)] place-items-center overflow-hidden rounded-2xl border border-border bg-bg transition-colors duration-200 group-hover:border-brand-border group-focus-visible:ring-2 group-focus-visible:ring-[var(--ring)]">
                  <Crest school={school} />
                </span>
                <span className="text-center">
                  <span className="block text-[11px] font-medium leading-tight text-text sm:text-[12.5px]">
                    {school.name}
                  </span>
                  {school.acronym && (
                    <span className="label-caps mt-0.5 block">{school.acronym}</span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-10 font-display text-[30px] font-medium leading-[1.1] tracking-tight sm:text-[44px]">
          <span className="italic">Calenda</span> works with all of them.
        </p>

        <p className="mt-5 max-w-[70ch] text-[11.5px] leading-relaxed text-text-subtle">
          Calenda reads the calendar each school publishes. It is not affiliated with,
          endorsed by, or a product of any of them, and no school here has any
          involvement in it. Crests are each school's own, shown from the school's own
          site, and link there.
        </p>
      </div>
    </section>
  )
}
