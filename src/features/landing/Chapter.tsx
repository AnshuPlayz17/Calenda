import { motion, useReducedMotion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
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
export function PinnedFrame({ children, className, progress }: {
  children: React.ReactNode
  className?: string
  /** The scene's own progress. Given it, the chapter is entered and left
   *  rather than arrived at and scrolled past -- see below. */
  progress?: MotionValue<number>
}) {
  return (
    <div
      className={cn(
        'sticky top-0 flex h-svh flex-col justify-center overflow-hidden',
        'px-5 pb-16 pt-20 sm:px-8 xl:pb-10',
        className,
      )}
    >
      {progress ? <PushThrough progress={progress}>{children}</PushThrough> : children}
    </div>
  )
}

/**
 * A chapter grows in as you enter it and pushes past the camera as you leave.
 *
 * This is the difference between a page of sections and a page you travel
 * through. A section that slides up from below is a new thing arriving; a
 * chapter that grows out of the middle of the screen while the last one
 * expands past the edges is the same journey continuing forward. The opening
 * chapter makes that literal -- you scroll into the card in the hero and it
 * opens -- and this carries the same reading to the other ten.
 *
 * Six per cent of the scene at each end, which at these scene lengths is about
 * a fifth of a screen: long enough to read as a move, short enough that no
 * chapter spends real scroll being invisible.
 *
 * It goes on the content inside the sticky frame, never on the chapter wrapper.
 * A transform on the wrapper would move the sticky element with it, which is
 * the one thing that unpins a pinned scene.
 *
 * Not used by the schools chapter. That one measures its own stage with
 * getBoundingClientRect to place fifteen cards and to find the pointer's
 * distance from each dock tile, and a scaled ancestor makes those measurements
 * the scaled numbers rather than the real ones -- at mount, when the scale is
 * 0.9, every card would be placed against a stage nine tenths of its actual
 * width. It enters by having fifteen cards arrive one at a time and leaves by
 * becoming a dock, which is enough of an entrance without this.
 */
export function PushThrough({ progress, children }: {
  progress: MotionValue<number>
  children: React.ReactNode
}) {
  const [sR, sV] = held([0, 0.06, 0.94, 1], [0.9, 1, 1, 1.14])
  const [oR, oV] = held([0, 0.05, 0.95, 1], [0, 1, 1, 0])
  const scale = useTransform(progress, sR, sV)
  const opacity = useTransform(progress, oR, oV)

  return (
    <motion.div style={{ scale, opacity }} className="flex flex-1 flex-col justify-center">
      {children}
    </motion.div>
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
