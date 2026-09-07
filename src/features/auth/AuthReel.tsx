import { useCallback, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Bell, CalendarDays, GraduationCap, Import } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { sampleSchoolYear } from '@/data/sampleSchoolYear'
import { sampleUpcoming } from '@/data/sampleEvents'
import { agendaLabel, dayNumber, monthGrid, monthLabel, plain, WEEKDAY_LABELS } from '@/lib/datetime'

/**
 * What Calenda does, on a loop, while somebody is deciding whether to sign up.
 *
 * The panel beside the form used to be one fixed diagram of four labelled
 * nodes. It said "these things connect", which the landing page's path chapter
 * now says properly and at length, and it said it once -- so a reader who spent
 * two minutes finding their password looked at the same picture for two
 * minutes. This shows four different things instead, each a real piece of the
 * product drawn from the same invented sample year the landing page counts
 * from, and moves between them on its own.
 *
 * It is not a video. A video file cannot take the theme, cannot be read out by
 * a screen reader, cannot be corrected without re-rendering it, and would be
 * comfortably the largest thing in the repository. This is the same four scenes
 * as markup: a few kilobytes, themeable, selectable, and translatable.
 *
 * Under prefers-reduced-motion it does not rotate at all. It renders all four
 * scenes stacked and readable, which is the test that matters -- the still
 * version has to still make the argument, and four small panels of real
 * content make it better than one animated one does.
 */

/** How long each scene holds. Long enough to read the whole thing twice. */
const DWELL = 6000

type Scene = {
  id: string
  accent: string
  Icon: LucideIcon
  title: string
  /** One line. The panel is not where the case gets made at length. */
  line: string
  Figure: () => React.ReactElement
}

const SCENES: Scene[] = [
  {
    id: 'import',
    accent: 'azure',
    Icon: Import,
    title: 'The school year, already in it',
    line: `All ${sampleSchoolYear.length} dates read out of the calendar the school
           publishes, so the first thing you see is a year that is already full.`,
    Figure: MonthFigure,
  },
  {
    id: 'classes',
    accent: 'violet',
    Icon: GraduationCap,
    title: 'A workspace for every class',
    line: `Notes, assignments and deadlines filed under the class they belong to
           rather than in one pile.`,
    Figure: ClassesFigure,
  },
  {
    id: 'together',
    accent: 'teal',
    Icon: CalendarDays,
    title: 'Your own calendar beside it',
    line: `Google Calendar comes in read-only, so nothing here can change
           anything there. Everything sits on one page.`,
    Figure: AgendaFigure,
  },
  {
    id: 'reminder',
    accent: 'amber',
    Icon: Bell,
    title: 'And it reaches you first',
    line: `As far ahead as you asked, outside the hours you asked to be left
           alone, and never the same thing twice.`,
    Figure: ReminderFigure,
  },
]

export function AuthReel() {
  const reduce = useReducedMotion()
  const [index, setIndex] = useState(0)
  // Paused while a pointer is over the panel or something in it has focus --
  // a scene that advances out from under someone reading it is worse than one
  // that never advances at all.
  const [held, setHeld] = useState(false)
  const [hidden, setHidden] = useState(false)

  const go = useCallback((next: number) => {
    setIndex(((next % SCENES.length) + SCENES.length) % SCENES.length)
  }, [])

  // A background tab still fires timers, so without this the reel spends the
  // whole time somebody is reading their password manager cycling at full
  // speed and arrives back showing a scene they never saw start.
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const running = !reduce && !held && !hidden

  useEffect(() => {
    if (!running) return
    const id = window.setTimeout(() => go(index + 1), DWELL)
    return () => window.clearTimeout(id)
  }, [running, index, go])

  if (reduce) return <StillReel />

  const scene = SCENES[index]!

  return (
    <div
      data-accent={scene.accent}
      className="relative z-10 flex flex-1 flex-col justify-end"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      {/* One wash in the current scene's colour, so the panel changes
          temperature as the reel turns -- the same move the landing page's
          chapters make, and the only thing tying this page to that one. It
          lives in here rather than in the layout because `data-accent` is on
          this element, and a sibling of it would inherit nothing.

          Painted once at a fixed size and only its colour transitions.
          Animating the scale of a 26rem element under a 110px blur is
          re-blurring it every frame, which is the trap the landing page's hero
          glow already fell into. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 -z-10 h-[26rem] w-[26rem] rounded-full bg-accent opacity-[0.17] blur-[110px] transition-colors duration-700"
      />

      {/* The figure and the words are one layer, so a scene arrives as a scene
          rather than as a picture that changes and a caption that follows it. */}
      <div className="relative min-h-[19rem]">
        {SCENES.map((s, i) => (
          <motion.div
            key={s.id}
            aria-hidden={i !== index}
            initial={false}
            // Opacity and transform only. A blur between scenes was tried and
            // is a filter animation: it repaints the whole layer every frame,
            // which is the trap the hero glow already cost this project once.
            animate={i === index ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className={i === index
              ? 'relative'
              : 'pointer-events-none absolute inset-0'}
          >
            <SceneBody scene={s} />
          </motion.div>
        ))}
      </div>

      <Ticks index={index} running={running} onPick={go} />
    </div>
  )
}

function SceneBody({ scene }: { scene: Scene }) {
  const { Icon, Figure } = scene
  return (
    <div>
      <Figure />
      <div className="mt-7 flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-accent">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <h2 className="text-title-sm font-medium leading-tight text-white">{scene.title}</h2>
      </div>
      <p className="mt-2.5 max-w-[42ch] text-sm leading-relaxed text-panel-muted">
        {scene.line}
      </p>
    </div>
  )
}

/**
 * Which scene, and how long it has left.
 *
 * Four bars rather than dots, because a bar can also be a clock: the current
 * one fills over the scene's dwell, so the panel says how long you have before
 * it moves without anybody having to guess. They are buttons -- somebody who
 * wants a second look at the class workspace should not have to wait three
 * scenes for it to come round again.
 */
function Ticks({ index, running, onPick }: {
  index: number
  running: boolean
  onPick: (i: number) => void
}) {
  return (
    <div className="mt-9 flex items-center gap-2">
      {SCENES.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onPick(i)}
          aria-label={s.title}
          aria-current={i === index}
          className="group h-5 flex-1 cursor-pointer border-0 bg-transparent p-0"
        >
          {/* The track is brighter on the current scene, and that is not
              decoration. The fill is paused whenever a pointer is over the
              panel -- so picking a tick leaves its fill at zero width, and
              without this the scene you just chose is the one tick that looks
              like nothing is happening to it. */}
          <span
            className={
              'block h-[3px] w-full overflow-hidden rounded-full transition-colors duration-200 group-hover:bg-white/30 '
              + (i === index ? 'bg-white/30' : 'bg-white/15')
            }
          >
            {i === index && (
              <span
                // A CSS animation rather than a Motion one, for the pause. A
                // tweened fill restarted whenever the reel is held snaps to
                // full the moment a pointer lands on the panel, which reads as
                // "about to advance" at precisely the moment it has stopped.
                // animation-play-state freezes it where it actually is.
                // Keyed on the index so each scene's fill starts from zero.
                key={index}
                style={{
                  animation: `reel-fill ${DWELL}ms linear forwards`,
                  animationPlayState: running ? 'running' : 'paused',
                }}
                className="block h-full w-full origin-left rounded-full bg-accent"
              />
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * The same four scenes with nothing moving.
 *
 * Not a faster rotation and not the first scene alone: all four, small, in a
 * column. A reader who has asked for no motion gets more information than the
 * animated version shows at any one moment, not less.
 */
function StillReel() {
  return (
    <div className="relative z-10 flex flex-1 flex-col justify-end gap-5">
      {SCENES.map((s) => (
        <div key={s.id} data-accent={s.accent} className="flex items-start gap-3">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-accent">
            <s.Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div>
            <h2 className="text-[15px] font-medium leading-snug text-white">{s.title}</h2>
            <p className="mt-1 max-w-[46ch] text-[13px] leading-relaxed text-panel-muted">
              {s.line}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  The figures. Every one is real sample data rather than a drawing of some.  */
/* -------------------------------------------------------------------------- */

/** A month with the sample year's dates in it, counted rather than decided. */
function MonthFigure() {
  const anchor = plain(2026, 10, 15)
  const days = monthGrid(anchor)
  const marked = new Set(
    sampleSchoolYear
      .filter((e) => e.startDate.startsWith('2026-10'))
      .map((e) => e.startDate),
  )

  return (
    <Card>
      <p className="text-[12px] font-medium text-white">{monthLabel(anchor)}</p>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d} className="pb-1 text-center text-[9px] uppercase tracking-wider text-panel-subtle">
            {d[0]}
          </span>
        ))}
        {days.map((d, i) => {
          const outside = !d.startsWith('2026-10')
          const hit = marked.has(d)
          return (
            <motion.span
              key={d}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: Math.min(i, 34) * 0.012 }}
              className={
                'grid h-[22px] place-items-center rounded text-[10px] tabular '
                + (hit
                  ? 'bg-accent font-semibold text-panel-ink'
                  : outside
                    ? 'text-white/20'
                    : 'text-white/55')
              }
            >
              {dayNumber(d)}
            </motion.span>
          )
        })}
      </div>
    </Card>
  )
}

/** Three classes, each with what is actually filed under it. */
const CLASSES = [
  { name: 'Physics', code: 'SPH4U', notes: 12, due: 'Lab report, Thursday' },
  { name: 'English', code: 'ENG4U', notes: 8, due: 'Essay draft, Monday' },
  { name: 'Computer Science', code: 'ICS4U', notes: 15, due: 'Unit 3 problem set' },
]

function ClassesFigure() {
  return (
    <div className="flex flex-col gap-2">
      {CLASSES.map((c, i) => (
        <motion.div
          key={c.code}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="flex items-center gap-3 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/25 text-[10px] font-semibold text-accent">
              {c.code.slice(0, 3)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-white">{c.name}</span>
              <span className="block truncate text-[11px] text-panel-subtle">{c.due}</span>
            </span>
            <span className="shrink-0 text-[10px] tabular text-panel-subtle">{c.notes} notes</span>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

/** What is actually coming up, offset from today so it always is. */
function AgendaFigure() {
  const events = sampleUpcoming().slice(0, 4)
  return (
    <Card className="py-3">
      <ul className="flex flex-col">
        {events.map((e, i) => (
          <motion.li
            key={e.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-baseline gap-3 border-b border-panel-line py-2 last:border-0 last:pb-0 first:pt-0"
          >
            <span className="w-[4.5rem] shrink-0 text-[10px] uppercase tracking-wide tabular text-panel-subtle">
              {agendaLabel(e.startDate)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-white">{e.title}</span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          </motion.li>
        ))}
      </ul>
    </Card>
  )
}

/** One reminder, as it arrives. */
function ReminderFigure() {
  const first = sampleUpcoming()[0]!
  return (
    <div className="grid min-h-[9.5rem] place-items-center">
      <motion.div
        initial={{ opacity: 0, y: -18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[22rem]"
      >
        <Card className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-panel-ink">
            <Bell className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium text-white">{first.title}</span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-panel-subtle">
              {agendaLabel(first.startDate)} — {first.description ?? 'On your calendar'}
            </span>
          </span>
        </Card>
      </motion.div>
    </div>
  )
}

/** The one surface every figure is drawn on. */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={
        'rounded-xl border border-panel-line bg-panel-raised p-3.5 shadow-lg shadow-black/20 '
        + (className ?? '')
      }
    >
      {children}
    </div>
  )
}
