import { useEffect, useState } from 'react'
import { motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { Globe } from 'lucide-react'
import {
  WORLD_COLS, WORLD_ROWS, WORLD_LAT_MAX, WORLD_LAT_MIN, WORLD_DOTS,
} from '@/data/worldMap'
import { PushThrough } from './Chapter'
import { useScrollScene, held, prefersLightMotion, paced, useRoomy } from './scrollScene'

/**
 * Where Calenda works, told as a map that lights up.
 *
 * This is deliberately NOT a map of users. Calenda has one user and a handful
 * of testers, and a scattering of dots captioned "our community" would be the
 * only invented claim on a page whose entire argument is that its contents are
 * checkable. docs/FACTS.md exists to stop exactly that.
 *
 * What is true is more useful anyway, and it is the thing a family spread
 * across timezones actually needs to know. An all-day school date is stored
 * date-only and timezone-free, so a PA Day on the 18th is the 18th from
 * anywhere -- store it as a timestamp instead and it renders on the 17th for
 * everybody west of London. Reminders are scheduled at nine in *your* morning
 * (`(e.start_date + time '09:00') at time zone pr.timezone`), and quiet hours
 * are evaluated in your zone. Those are lines of SQL somebody can go and read.
 *
 * So the light spreads outward from where the project was written, and the
 * times on the markers are the real current time in each place, formatted by
 * the browser's own timezone database at render. Nothing here is a number
 * anybody typed.
 */

type Place = { city: string; zone: string; lat: number; lon: number }

/** Ordered by distance from where the sweep starts, so markers land in the
 *  order the light reaches them. */
const PLACES: Place[] = [
  { city: 'Toronto', zone: 'America/Toronto', lat: 43.65, lon: -79.38 },
  { city: 'Vancouver', zone: 'America/Vancouver', lat: 49.28, lon: -123.12 },
  { city: 'São Paulo', zone: 'America/Sao_Paulo', lat: -23.55, lon: -46.63 },
  { city: 'London', zone: 'Europe/London', lat: 51.51, lon: -0.13 },
  { city: 'Lagos', zone: 'Africa/Lagos', lat: 6.52, lon: 3.38 },
  { city: 'Dubai', zone: 'Asia/Dubai', lat: 25.2, lon: 55.27 },
  { city: 'Mumbai', zone: 'Asia/Kolkata', lat: 19.08, lon: 72.88 },
  { city: 'Singapore', zone: 'Asia/Singapore', lat: 1.35, lon: 103.82 },
  { city: 'Tokyo', zone: 'Asia/Tokyo', lat: 35.68, lon: 139.65 },
  { city: 'Sydney', zone: 'Australia/Sydney', lat: -33.87, lon: 151.21 },
]

/** Equirectangular, in the grid's own units, so dots and markers share a space. */
const px = (lon: number) => ((lon + 180) / 360) * WORLD_COLS
const py = (lat: number) => ((WORLD_LAT_MAX - lat) / (WORLD_LAT_MAX - WORLD_LAT_MIN)) * WORLD_ROWS

const ORIGIN = { x: px(PLACES[0]!.lon), y: py(PLACES[0]!.lat) }
/** Reaches every corner of the grid from the origin, with room to spare. */
const REACH = 120

/**
 * The scene's pacing, as fractions of its own scroll.
 *
 * SPAN is wide on purpose. An earlier cut had the last label expiring at 79%
 * of the scene, which left a fifth of a screen and a half of scrolling where
 * nothing at all happened -- the map just sat there, lit, while the reader
 * kept pushing. A dead tail on a pinned section reads as the page having
 * frozen, not as a pause.
 */
const LEAD = 0.08
const SPAN = 0.74
const STEP = SPAN / PLACES.length

export function WorldScene() {
  const { ref, reduce, progress, height } = useScrollScene(paced(3.5))
  // Two and a half thousand circles is fine on a laptop and is exactly the
  // kind of thing that costs a mid-range Android its first paint. A
  // checkerboard halves the node count and still reads as a dotted map.
  const [light] = useState(prefersLightMotion)
  const dots = light ? WORLD_DOTS.filter(([c, r]) => (c + r) % 2 === 0) : WORLD_DOTS

  // Declared before the reduced-motion branch, so the hook count is the same
  // on every render of this component. It is simply never read below.
  const [revealRange, revealValues] = held([LEAD * 0.4, LEAD + SPAN + 0.14], [0, REACH])
  const revealR = useTransform(progress, revealRange, revealValues)

  // The camera pushes in as the cities land, and drifts east with them. The
  // markers arrive in order of distance from Toronto, so the interesting half
  // of the map moves right across the scene -- holding the frame still would
  // leave the last five arrivals in a corner.
  //
  // Not below lg. The map already bleeds to both edges of a phone, so it is
  // exactly the width of the window there and any scale at all makes it wider
  // than the screen it is drawn on.
  const roomy = useRoomy()
  const [zR, zV] = held([LEAD, LEAD + SPAN], [1, roomy ? 1.3 : 1])
  const mapZoom = useTransform(progress, zR, zV)
  const [panR, panV] = held([LEAD, LEAD + SPAN], ['0%', roomy ? '-11%' : '0%'])
  const mapPan = useTransform(progress, panR, panV)

  if (reduce) return <StaticWorld dots={dots} />

  return (
    <section
      ref={ref}
      className="relative z-10 border-t border-border bg-bg"
      style={{ height }}
      aria-labelledby="world-heading"
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden px-5 pb-20 pt-16 sm:px-8">
        <PushThrough progress={progress} depth={520}>
        <div className="mx-auto grid w-full max-w-[1240px] items-center gap-8 lg:grid-cols-[0.62fr_1fr] lg:gap-12">
          <div><Copy /></div>

          <motion.div
            style={{ scale: mapZoom, x: mapPan }}
            className="relative -mx-5 origin-center sm:mx-0"
          >
            <Map dots={dots} revealR={revealR} />
            {/* Markers are HTML over the map rather than SVG text: at this
                viewBox a glyph would be a third of a grid cell tall, and it
                would scale with the map instead of staying readable. */}
            <div className="pointer-events-none absolute inset-0">
              {PLACES.map((place, i) => (
                <Marker key={place.city} place={place} index={i} progress={progress} />
              ))}
            </div>
          </motion.div>
        </div>

        <p className="mx-auto mt-6 w-full max-w-[1240px] text-[11.5px] leading-relaxed text-text-subtle">
          Ten timezones, each showing its local time right now — read from your browser's
          own timezone database rather than typed in. It is a map of where Calenda works,
          not a map of who uses it.
        </p>
      </PushThrough>
      </div>
    </section>
  )
}

function Copy() {
  return (
    <>
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent-subtle text-accent">
        <Globe className="h-5 w-5" aria-hidden />
      </span>
      <h2
        id="world-heading"
        className="mt-5 max-w-[16ch] font-display text-title font-medium leading-[1.06] tracking-tight sm:text-display-sm"
      >
        One date. Every timezone.
      </h2>
      <p className="mt-4 max-w-[46ch] text-[14.5px] leading-relaxed text-text-muted sm:text-[15.5px]">
        A PA Day on the 18th is the 18th from anywhere. School dates are stored
        date-only and timezone-free, because storing them as timestamps renders them
        a day early for everybody west of London.
      </p>
      <p className="mt-3 max-w-[46ch] text-[13px] leading-relaxed text-text-subtle">
        Reminders are scheduled at nine in <em>your</em> morning, and quiet hours are read
        in your own zone rather than the server's. Nothing to install and nothing to
        configure: a browser is the whole requirement.
      </p>
    </>
  )
}

/**
 * The map. Two layers of the same dots: the world as it always is, and the
 * world with the light on, clipped to a circle that grows as you read.
 */
function Map({
  dots, revealR,
}: {
  dots: Array<[number, number]>
  /** Absent under reduced motion, where the whole map is simply lit. */
  revealR?: MotionValue<number>
}) {
  return (
    <svg
      viewBox={`0 0 ${WORLD_COLS} ${WORLD_ROWS}`}
      className="w-full"
      role="img"
      aria-label="A world map, lighting up. Calenda works in any timezone."
    >
      {revealR && (
        <defs>
          <clipPath id="world-reveal" clipPathUnits="userSpaceOnUse">
            <motion.circle cx={ORIGIN.x} cy={ORIGIN.y} r={revealR} />
          </clipPath>
        </defs>
      )}

      {/* Always faintly there. Somewhere the light has not reached yet is
          still somewhere Calenda works. */}
      <g fill="currentColor" className="text-text-subtle opacity-30">
        {dots.map(([c, row]) => (
          <circle key={`${c}-${row}`} cx={c + 0.5} cy={row + 0.5} r={0.3} />
        ))}
      </g>

      <g
        fill="currentColor"
        className="text-accent"
        clipPath={revealR ? 'url(#world-reveal)' : undefined}
      >
        {dots.map(([c, row]) => (
          <circle key={`${c}-${row}`} cx={c + 0.5} cy={row + 0.5} r={0.34} />
        ))}
      </g>
    </svg>
  )
}

/** A place, landing as the light reaches it. */
function Marker({
  place, index, progress,
}: {
  place: Place
  index: number
  progress: MotionValue<number>
}) {
  const at = LEAD + index * STEP

  const [dr, dv] = held([at, at + STEP * 0.75, at + STEP * 1.1], [0, 1.35, 1])
  const [or_, ov] = held([at, at + STEP * 0.35], [0, 1])
  // The label is the one thing that leaves again. Ten at once is a cluttered
  // map, and the point is made one place at a time.
  const last = index === PLACES.length - 1
  const [lr, lv] = last
    // The final label stays. Without it the scene ends on a lit map and no
    // reason to still be looking at it, which is where a pinned section starts
    // feeling stuck rather than finished.
    ? held([at + STEP * 0.3, at + STEP * 0.7], [0, 1])
    : held([at + STEP * 0.3, at + STEP * 0.7, at + STEP * 1.6, at + STEP * 2.1], [0, 1, 1, 0])
  const [rr, rv] = held([at, at + STEP * 1.3], [0.4, 3.2])
  const [pr, pv] = held([at, at + STEP * 1.3], [0.5, 0])

  const dotScale = useTransform(progress, dr, dv)
  const dotOpacity = useTransform(progress, or_, ov)
  const labelOpacity = useTransform(progress, lr, lv)
  const ringScale = useTransform(progress, rr, rv)
  const ringOpacity = useTransform(progress, pr, pv)

  const left = (px(place.lon) / WORLD_COLS) * 100
  const top = (py(place.lat) / WORLD_ROWS) * 100
  // A label near the right edge would run off the map, so it flips sides. And
  // they alternate above and below the dot: Mumbai and Dubai are close enough
  // together on an equirectangular map that two chips on the same line collide.
  const flip = left > 62
  const below = index % 2 === 1

  return (
    <div className="absolute" style={{ left: `${left}%`, top: `${top}%` }}>
      {/* The arrival ring, which happens once. */}
      <motion.span
        aria-hidden
        style={{ scale: ringScale, opacity: ringOpacity }}
        className="absolute left-0 top-0 block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent"
      />
      {/* And a slow one that keeps going, so a landed city still reads as a
          place where something is running rather than as a dot that was
          drawn. Ten of them, staggered, because ten in step is a metronome. */}
      <motion.span
        aria-hidden
        style={{ opacity: dotOpacity, animationDelay: `${index * 0.42}s` }}
        className="landing-ping absolute left-0 top-0 block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent"
      />
      <motion.span
        aria-hidden
        style={{ scale: dotScale, opacity: dotOpacity }}
        className="absolute left-0 top-0 block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
      />
      <motion.span
        style={{ opacity: labelOpacity }}
        className={
          'absolute whitespace-nowrap rounded-md border border-border bg-bg/90 px-1.5 py-1 '
          + 'text-[10.5px] leading-none backdrop-blur-[2px] sm:text-[11.5px] '
          + (flip ? 'right-2.5 ' : 'left-2.5 ')
          + (below ? 'top-1.5' : 'bottom-1.5')
        }
      >
        <span className="font-medium text-text">{place.city}</span>
        <span className="tabular ml-1.5 text-text-muted"><LocalTime zone={place.zone} /></span>
      </motion.span>
    </div>
  )
}

/**
 * Reduced motion gets the argument, not a faster version of the animation.
 *
 * The claim is "ten timezones, one date", and a list of the ten places beside
 * their current local times makes it more plainly than the sweep does -- you
 * can read all ten at once and see that the times differ while the date does
 * not. The map stays, fully lit, because it is the picture of the claim.
 */
function StaticWorld({ dots }: { dots: Array<[number, number]> }) {
  return (
    <section
      className="relative z-10 border-t border-border bg-bg px-5 py-16 sm:px-8"
      aria-labelledby="world-heading"
    >
      <div className="mx-auto grid w-full max-w-[1240px] items-start gap-10 lg:grid-cols-[0.62fr_1fr]">
        <div><Copy /></div>
        <div>
          <Map dots={dots} />
          <ul className="mt-6 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
            {PLACES.map((place) => (
              <li
                key={place.city}
                className="flex items-baseline justify-between gap-2 border-b border-border py-1.5 text-[12.5px]"
              >
                <span className="text-text">{place.city}</span>
                <span className="tabular text-text-muted"><LocalTime zone={place.zone} /></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/**
 * The real current time somewhere else.
 *
 * Empty until after mount, because the string depends on the clock: rendering
 * one during the build would ship a timestamp that is wrong by however long
 * ago the build ran.
 */
function LocalTime({ zone }: { zone: string }) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  if (!now) return null

  try {
    return (
      <>
        {new Intl.DateTimeFormat('en-CA', {
          timeZone: zone,
          hour: 'numeric',
          minute: '2-digit',
        }).format(now)}
      </>
    )
  } catch {
    // A browser without that zone in its database gets the city on its own,
    // rather than a confidently wrong time.
    return null
  }
}
