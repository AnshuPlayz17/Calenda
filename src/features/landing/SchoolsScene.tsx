import { useCallback, useEffect, useRef, useState } from 'react'
import {
  motion, useMotionTemplate, useMotionValue, useMotionValueEvent, useSpring, useTransform,
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
/**
 * Where the dock puts card `i`, as a fraction of the stage.
 *
 * `span` is how much of the stage the row of fifteen actually occupies. The
 * first version used all of it, which is why the dock read as fifteen boxes
 * that happened to be in a line rather than as one object: seventy pixels of
 * air between sixty-pixel tiles is not a dock, it is a scatter. The tiles now
 * sit a few pixels apart inside a bar, and the bar is drawn to exactly the
 * width they need.
 */
function dockSlot(i: number, span: number) {
  return { x: 0.5 + ((i + 0.5) / SCHOOLS.length - 0.5) * span, y: DOCK_Y }
}

const DOCK_Y = 0.82

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

/** The biggest a docked tile gets, and the air between two of them. */
const DOCK_TILE_MAX = 60
const DOCK_TILE_MIN = 16

/**
 * The dock's measurements, derived from the stage and the tile.
 *
 * One function so the bar and the tiles cannot disagree: the bar is drawn from
 * `width`, the tiles are placed from `span`, and both come from the same
 * arithmetic. Two independent numbers here is a dock whose ends do not line up
 * with its contents at some viewport nobody checked.
 */
export type DockMetrics = ReturnType<typeof dockMetrics>

function sameDock(a: DockMetrics, b: DockMetrics) {
  return a.dockTile === b.dockTile
    && a.width === b.width
    && a.pad === b.pad
    && Math.abs(a.span - b.span) < 0.001
    && Math.abs(a.scale - b.scale) < 0.001
}

function dockMetrics(stageWidth: number, tile: number) {
  const gap = stageWidth >= 720 ? 8 : 4
  const fits = Math.floor((stageWidth * 0.94) / SCHOOLS.length) - gap
  const dockTile = Math.max(DOCK_TILE_MIN, Math.min(DOCK_TILE_MAX, fits))
  const pitch = dockTile + gap
  const width = pitch * SCHOOLS.length
  return {
    dockTile,
    width,
    pad: Math.round(dockTile * 0.3),
    span: stageWidth > 0 ? width / stageWidth : 1,
    scale: dockTile / tile,
  }
}

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
  const [dock, setDock] = useState(() => dockMetrics(0, 1))
  // True once the cards have finished becoming a dock. Gates the things that
  // only make sense there -- the bar, the hover label, the lift -- with one
  // state change at the boundary rather than a re-render per frame.
  const [isDock, setIsDock] = useState(false)
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
    const nextSpread = r.width > 0 ? Math.min(1, natural / r.width) : 1
    setSpread((prev) => (Math.abs(prev - nextSpread) < 0.01 ? prev : nextSpread))

    const tile = tileSize(window.innerWidth)
    el.style.setProperty('--tile', `${tile}px`)
    const nextDock = dockMetrics(r.width, tile)
    // Every field, not just the two that look like the interesting ones. The
    // first cut compared dockTile and width alone, and at 375px those two
    // happen to come out identical to the pre-measurement placeholder -- so
    // the update was skipped and the cards kept a scale of sixteen, which is
    // a 704px tile in a 375px window. The harness caught it; a screenshot of
    // any other width would not have.
    setDock((prev) => (sameDock(prev, nextDock) ? prev : nextDock))
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

  useMotionValueEvent(docked, 'change', (v) => {
    const next = v > 0.92
    setIsDock((prev) => (prev === next ? prev : next))
  })

  const [lineRange, lineValues] = held([MOVE_FROM + 0.06, MOVE_TO], [0, 1])
  const lineIn = useTransform(progress, lineRange, lineValues)
  const lineY = useTransform(lineIn, [0, 1], [26, 0])
  const barScale = useTransform(docked, [0, 1], [0.92, 1])

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
          <p className="label-caps text-accent">The schools</p>
          <h2
            id="schools-heading"
            className="mx-auto mt-2.5 max-w-[24ch] font-display text-title font-medium leading-[1.06] tracking-tight sm:text-display-sm"
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
            className="pointer-events-none absolute inset-x-0 top-[44%] text-center font-display text-display font-medium leading-[1.0] tracking-[-0.02em] text-text lg:text-display-lg"
          >
            <span className="italic">Calenda</span> works with all of them.
          </motion.p>

          {/* The tray. Drawn from the same arithmetic that places the tiles,
              so its ends line up with them at every width. It arrives with
              them rather than before: an empty bar waiting to be filled is a
              loading state, and this is not one. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 -translate-x-1/2"
            style={{ top: `calc(var(--stage-h) * ${DOCK_Y})` }}
          >
            <motion.div
              style={{
                opacity: docked,
                scale: barScale,
                y: '-50%',
                width: dock.width + dock.pad * 2,
                height: dock.dockTile + dock.pad * 2,
                borderRadius: (dock.dockTile + dock.pad * 2) / 2.4,
              }}
              className="border border-border bg-surface-2/75 shadow-lg backdrop-blur-md"
            />
          </div>

          {SCHOOLS.map((school, i) => (
            <Card
              key={school.name}
              school={school}
              index={i}
              progress={progress}
              cols={cols}
              spread={spread}
              dock={dock}
              isDock={isDock}
              docked={docked}
              pointerX={pointerX}
              rect={rect}
            />
          ))}
        </div>

        <p className="mx-auto w-full max-w-[86ch] shrink-0 pt-2 text-center text-[11px] leading-relaxed text-text-subtle">
          Calenda reads the calendar each school publishes. It is not affiliated with,
          endorsed by, or a product of any of them, and no school here has any
          involvement in it. No school's crest is used — each tile is initials set in
          Calenda's own type — and every one links to that school's site.
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
  school, index, progress, cols, spread, dock, isDock, docked, pointerX, rect,
}: {
  school: School
  index: number
  progress: MotionValue<number>
  cols: number
  spread: number
  dock: DockMetrics
  isDock: boolean
  docked: MotionValue<number>
  pointerX: MotionValue<number>
  rect: React.RefObject<{ left: number; width: number }>
}) {
  const g = gridSlot(index, cols, spread)
  const d = dockSlot(index, dock.span)
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

  const shrink = useTransform(travel, [0, 1], [1, dock.scale])
  // The caption is gone before the card is small enough for it to be unreadable.
  const captionOut = useTransform(travel, [0, 0.45], [1, 0])
  const caption = useTransform([appear, captionOut], ([a, c]) => (a as number) * (c as number))

  // Pointer magnification, and only once docked. A card swelling while it is
  // still crossing the stage looks like a bug, because it is one.
  //
  // The falloff is measured in dock tiles rather than in a fixed number of
  // pixels, so the same three-or-so neighbours rise on a phone as on a laptop.
  const falloff = useTransform([pointerX, docked], ([px, dk]) => {
    const p = px as number
    if (!Number.isFinite(p) || (dk as number) < 0.6 || !rect.current) return 0
    const centre = rect.current.left + rect.current.width * d.x
    const reach = dock.dockTile * 2.4
    return Math.max(0, 1 - Math.abs(p - centre) / reach) * (dk as number)
  })
  const near = useSpring(falloff, { stiffness: 320, damping: 26, mass: 0.4 })

  const magnet = useTransform(near, (n) => 1 + n * 0.62)
  // Lifting as well as swelling is what makes it read as a dock rather than a
  // row that zooms. Divided by the card's own scale, because it is inside it.
  const lift = useTransform(near, (n) => -n * 14 / Math.max(dock.scale, 0.2))
  const cardY = useTransform([enterY, lift], ([e, l]) => (e as number) + (l as number))

  return (
    <motion.div style={{ x, y }} className="absolute left-0 top-0">
      <div className="-translate-x-1/2 -translate-y-1/2">
        <motion.div style={{ scale: shrink, opacity: appear }} className="origin-center">
          <motion.a
            href={school.site}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${school.name} — opens the school's website`}
            style={{ y: cardY, scale: magnet }}
            className="group relative block origin-bottom outline-none"
          >
            <span
              style={{ borderRadius: 'calc(var(--tile, 56px) * 0.26)' }}
              className="relative grid h-[var(--tile,56px)] w-[var(--tile,56px)] place-items-center border border-border bg-gradient-to-b from-surface to-bg transition-colors duration-200 group-hover:border-accent-border group-focus-visible:ring-2 group-focus-visible:ring-[var(--ring)]"
            >
              <Crest school={school} />
              <ArrowUpRight
                aria-hidden
                className="absolute right-1 top-1 h-3 w-3 text-text-subtle opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
            </span>

            {/* The name, once it is a dock and the pointer is on it. Scaled
                back up by the inverse of the tile's own shrink, or it would
                arrive at sixty per cent and be unreadable. */}
            <span
              className={
                'pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 block origin-bottom '
                + '-translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-bg px-2 py-1 '
                + 'text-[12px] font-medium leading-none text-text shadow-sm transition-opacity duration-150 '
                + (isDock ? 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100' : 'opacity-0')
              }
              style={{ scale: 1 / Math.max(dock.scale, 0.2) }}
            >
              {school.name}
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
 * The school's initials, drawn rather than fetched.
 *
 * A wall of fifteen real crests never looks like one row: they are drawn by
 * fifteen different studios at fifteen aspect ratios, half of them are a crest
 * welded to a wordmark, and each one is that school's trademark. Initials set
 * in the page's own typeface are one system, and they are ours to draw.
 *
 * The whole difficulty is that they are not the same length. A single C beside
 * SMCS at one type size gives you a lonely letter and a cramped acronym, so
 * the size is a function of how many letters there are -- a one-letter
 * monogram is an initial and can be large, a four-letter one is an acronym and
 * has to be small. Both are then a fraction of the tile rather than a number
 * of points, so they hold at every width and in the dock, where the tile is
 * the same element at sixty per cent.
 */

/** Of the tile's width, the type size each monogram length wants. */
function opticalSize(letters: number) {
  if (letters <= 1) return 0.44
  if (letters === 2) return 0.355
  if (letters === 3) return 0.275
  return 0.225
}

function Crest({ school }: { school: School }) {
  const letters = school.monogram.length
  // Uppercase serif needs air between the letters; a single initial does not,
  // and the trailing space of the last letter would push it off centre.
  const tracking = letters > 1 ? 0.055 : 0

  return (
    <span
      aria-hidden
      style={{
        fontSize: `calc(var(--tile, 56px) * ${opticalSize(letters)})`,
        letterSpacing: `${tracking}em`,
        // Letter-spacing is applied after every letter including the last, so
        // centred text sits half a space to the left of where it looks centred.
        // And caps in this face sit a little high in their own box.
        marginRight: `-${tracking}em`,
        transform: 'translateY(0.03em)',
      }}
      className="select-none font-display font-medium leading-none text-text transition-colors duration-200 group-hover:text-accent"
    >
      {school.monogram}
    </span>
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
        <p className="label-caps text-accent">The schools</p>
        <h2
          id="schools-heading"
          className="mt-2.5 max-w-[24ch] font-display text-title font-medium leading-[1.06] tracking-tight sm:text-display-sm"
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
                <span
                  style={{
                    ['--tile' as string]: 'clamp(52px, 7.5vw, 96px)',
                    borderRadius: 'calc(var(--tile) * 0.26)',
                  }}
                  className="grid h-[var(--tile)] w-[var(--tile)] place-items-center border border-border bg-gradient-to-b from-surface to-bg transition-colors duration-200 group-hover:border-accent-border group-focus-visible:ring-2 group-focus-visible:ring-[var(--ring)]"
                >
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

        <p className="mt-10 font-display text-display font-medium leading-[1.0] tracking-[-0.02em]">
          <span className="italic">Calenda</span> works with all of them.
        </p>

        <p className="mt-5 max-w-[70ch] text-[11.5px] leading-relaxed text-text-subtle">
          Calenda reads the calendar each school publishes. It is not affiliated with,
          endorsed by, or a product of any of them, and no school here has any
          involvement in it. No school's crest is used — each tile is initials set in
          Calenda's own type — and every one links to that school's site.
        </p>
      </div>
    </section>
  )
}
