import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { useRef } from 'react'
import { held } from './scrollScene'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * The parts every chapter has, so they stop each inventing their own.
 *
 * Before this, each of the twelve scenes carried its own heading markup with
 * its own three-breakpoint arbitrary type size -- text-[28px] sm:text-[34px]
 * lg:text-[40px] and eleven variations on it. That is how twelve chapters end
 * up at twelve slightly different sizes nobody chose, and it is most of why
 * the page read as assembled rather than designed.
 *
 * Everything here reads `--accent`, which the section sets, so a chapter's
 * colour is a property of where it sits in the page rather than something each
 * scene has to remember to pass down.
 */

/**
 * One chapter of the page: its id, its colour, and the wash that announces it.
 *
 * The wash is the whole reason the accents are worth having. Twelve hues that
 * only ever appear on an eyebrow and a rule are a detail nobody notices; a
 * band of the chapter's colour bleeding down from its top edge is the page
 * changing temperature as you travel it, which is the one thing a scroll-driven
 * page can do that a static one cannot. It is set at ten per cent of an already
 * pale mix, so it never competes with anything on top of it, and it is the
 * ground rather than a layer -- nothing has to be lifted above it.
 */
export function Chapter({
  id, accent, children,
}: {
  id: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div id={id} data-accent={accent} className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-gradient-to-b from-accent-subtle to-transparent"
      />
      {children}
    </div>
  )
}

export function ChapterHeading({
  eyebrow, title, lede, note, Icon, align = 'start', className,
}: {
  eyebrow: string
  title: React.ReactNode
  lede?: React.ReactNode
  note?: React.ReactNode
  Icon?: LucideIcon
  align?: 'start' | 'center'
  className?: string
}) {
  const reduce = useReducedMotion()
  const centred = align === 'center'

  return (
    <div className={cn(centred && 'text-center', className)}>
      <div className={cn('flex items-center gap-2.5', centred && 'justify-center')}>
        {Icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent ring-1 ring-accent-border ring-inset">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
        <p className="label-caps text-accent">{eyebrow}</p>
      </div>

      <h2
        className={cn(
          'mt-4 font-display text-title font-medium leading-[1.08] tracking-tight text-text',
          'sm:text-display-sm',
          centred ? 'mx-auto max-w-[22ch]' : 'max-w-[20ch]',
        )}
      >
        {title}
      </h2>

      {lede && (
        <p
          className={cn(
            'mt-4 text-[15px] leading-relaxed text-text-muted sm:text-lg',
            centred ? 'mx-auto max-w-[52ch]' : 'max-w-[46ch]',
          )}
        >
          {lede}
        </p>
      )}

      {note && (
        <p
          className={cn(
            'mt-3 text-sm leading-relaxed text-text-subtle',
            centred ? 'mx-auto max-w-[54ch]' : 'max-w-[46ch]',
          )}
        >
          {note}
        </p>
      )}

      {/* A rule in the chapter's own colour, drawn on arrival. It is the
          smallest possible thing that makes twelve headings read as twelve
          chapters of one document rather than twelve headings. */}
      <motion.span
        aria-hidden
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: '-15% 0px' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'mt-7 block h-px w-14 origin-left bg-accent',
          centred && 'mx-auto origin-center',
        )}
      />
    </div>
  )
}

/**
 * The frame a pinned scene holds still inside.
 *
 * Six of the twelve chapters are pinned and each had its own copy of these
 * classes, drifting by a few pixels of padding each time. The bottom padding
 * below xl is for the companion pill, which is fixed to the window there.
 */
export function PinnedFrame({ children, className, progress, depth }: {
  children: React.ReactNode
  className?: string
  /** The scene's own progress. Given it, the chapter is entered and left
   *  rather than arrived at and scrolled past -- see below. */
  progress?: MotionValue<number>
  /** How far back this chapter starts. See PushThrough. */
  depth?: number
}) {
  return (
    <div
      className={cn(
        'sticky top-0 flex h-svh flex-col justify-center overflow-hidden',
        'px-5 pb-16 pt-20 sm:px-8 xl:pb-10',
        className,
      )}
    >
      {progress ? <PushThrough progress={progress} depth={depth}>{children}</PushThrough> : children}
    </div>
  )
}

/**
 * A chapter is travelled into and travelled past.
 *
 * This was a scale, and a scale is not a camera. Growing an element from 0.9 to
 * 1 is the same picture at two sizes: nothing about it says the viewer moved,
 * because a real approach also changes what the perspective does to the shape.
 * This translates the chapter along Z under a perspective instead, which is an
 * actual dolly -- the chapter arrives out of depth, passes the camera, and the
 * geometry does the work rather than a number being interpolated.
 *
 * `depth` is how far back a chapter starts, in the same units as the
 * perspective, and it is set per chapter rather than once. A chapter that is
 * mostly one object takes more of it, because there is a single thing to
 * arrive and the arrival is the point: the schools grid, the import's fifty-one
 * chips and the world map are all at 520. A chapter that is a column of text
 * takes less -- the questions rail and the panels at 320, the founder's panel
 * at 300 -- because text swinging through perspective is text that is briefly
 * hard to read, and the numbers sit between at 340 since the figures are read
 * but the bars are watched.
 *
 * The two chapters that do not pin are not pushed past at all; see `Approach`.
 *
 * The numbers are chosen against the harness rather than by eye: at
 * perspective 1200, leaving at z = 250 magnifies by 1200 / 950, or 1.26 -- just
 * inside the 1.3 the width check allows for a deliberate push-through, and well
 * outside anything a layout bug produces.
 *
 * It goes on the content inside the sticky frame, never on the chapter wrapper.
 * A transform on the wrapper moves the sticky element with it, which is the one
 * thing that unpins a pinned scene.
 */
export const PERSPECTIVE = 1200
export const EXIT_Z = 250

export function PushThrough({ progress, children, depth = 420, className }: {
  progress: MotionValue<number>
  children: React.ReactNode
  /** How far back the chapter starts. Larger is a longer approach. */
  depth?: number
  className?: string
}) {
  const reduce = useReducedMotion()

  const [zR, zV] = held([0, 0.08, 0.92, 1], [-depth, 0, 0, EXIT_Z])
  const [oR, oV] = held([0, 0.06, 0.94, 1], [0, 1, 1, 0])
  const z = useTransform(progress, zR, zV)
  const opacity = useTransform(progress, oR, oV)

  if (reduce) return <>{children}</>

  return (
    <motion.div
      style={{ z, opacity, transformPerspective: PERSPECTIVE }}
      className={cn('flex flex-1 flex-col justify-center', className)}
    >
      {children}
    </motion.div>
  )
}

/**
 * The same arrival, for a chapter that does not pin.
 *
 * A pinned chapter owns the window for its whole scroll, so it can be entered
 * and left again -- PushThrough does both. A tall section that simply scrolls
 * cannot: pushing it past the camera would take its opening lines out of the
 * frame while its closing ones were still being read. So this is the first half
 * only. The section comes out of depth as its top clears the fold, reaches the
 * camera by the time a reader is level with it, and then stays there and
 * behaves like a page.
 *
 * The window is deliberately short -- from just below the fold to a little
 * above the middle. Spread wider it becomes a section that is never quite at
 * rest, which is the failure mode of scroll-linked entrances.
 */
export function Approach({ children, depth = 260, className }: {
  children: React.ReactNode
  /** How far back the section starts, in the same units as the perspective. */
  depth?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.98', 'start 0.42'] })

  const [zR, zV] = held([0, 1], [-depth, 0])
  const [oR, oV] = held([0, 0.55], [0, 1])
  const z = useTransform(scrollYProgress, zR, zV)
  const opacity = useTransform(scrollYProgress, oR, oV)

  // The ref is on the outer element and the transform on the inner one, and
  // that split is not cosmetic. useScroll measures its target with
  // getBoundingClientRect, which is the *projected* box -- so a target that
  // moves itself in Z feeds its own output back into its own input. Measured
  // element still, moved element inside it.
  if (reduce) return <div className={className}>{children}</div>

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ z, opacity, transformPerspective: PERSPECTIVE }}>
        {children}
      </motion.div>
    </div>
  )
}

/** The same measurements, for a chapter that does not pin. */
export function StaticFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-5 py-20 sm:px-8 sm:py-28', className)}>{children}</div>
  )
}

/** The page's one content width, so nothing has to remember the number. */
export function Measure({ children, className, wide }: {
  children: React.ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <div className={cn('mx-auto w-full', wide ? 'max-w-[1240px]' : 'max-w-[1120px]', className)}>
      {children}
    </div>
  )
}
