import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { LANDING_SECTIONS } from './sections'
import { cn } from '@/lib/cn'

/**
 * The one control that is on screen for the whole page.
 *
 * It no longer works out where the reader is -- the route does, because the
 * page wrapper needs the same answer to carry the chapter's accent into the
 * header. One scroll listener, two consumers.
 *
 * Until now the only thing present in every scene was a hairline in the header
 * filling left to right. It answers "how far through am I" and nothing else,
 * which on a page this long is the smaller half of the question. Four of the
 * ten scenes are pinned, so a reader can push the wheel for two full screens
 * without the page appearing to move -- and with no way to tell whether that is
 * the third section or the ninth, or how much is left.
 *
 * So: a rail that names the chapters, marks the one being read, and moves in
 * both directions. The last part is the point. A page built entirely out of
 * scroll-driven scenes quietly assumes everybody travels through it once,
 * forwards; anyone who wants a second look at the import has to hunt for it by
 * dragging. Two buttons make going back as cheap as going on.
 *
 * It is a real <nav> of real buttons, so it is reachable by tab and readable by
 * a screen reader -- a navigation control that only responds to a mouse is not
 * a navigation control.
 */


export function ScrollCompanion({
  active, accent, ready, goTo,
}: {
  active: number
  /** The chapter being read, carried here rather than inherited from the page:
   *  changing a custom property on an ancestor of the whole document restyles
   *  the whole document. */
  accent: string
  ready: boolean
  goTo: (index: number) => void
}) {
  const reduce = useReducedMotion()

  const { scrollYProgress } = useScroll()
  // Sprung on the fill only, and only when motion is wanted: the readout is
  // useful either way, the easing is what somebody asked not to be shown.
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 })
  const fill = reduce ? scrollYProgress : smooth

  if (!ready) return null

  const current = LANDING_SECTIONS[active]!
  const atStart = active === 0
  const atEnd = active === LANDING_SECTIONS.length - 1

  return (
    <>
      {/* Desktop: a vertical rail down the right margin, out of the text's way.
          Below lg the margins are gone, so it becomes the bar below instead. */}
      <nav
        aria-label="Page sections"
        data-accent={accent}
        className="pointer-events-none fixed right-3 top-1/2 z-40 hidden -translate-y-1/2 xl:block"
      >
        {/* No panel around it. A bordered card floating in the right margin
            competes with the scene it is sitting next to, and on a 1440 window
            it lands on top of one -- the import grid runs wider than the text
            column by design. Ticks and a label read as marginalia instead, and
            only the label carries a background, because that is the only part
            that has to stay legible over whatever is behind it. */}
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <RailButton
            label="Previous section"
            disabled={atStart}
            onClick={() => goTo(active - 1)}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          </RailButton>

          {LANDING_SECTIONS.map((section, i) => (
            <button
              key={section.id}
              type="button"
              onClick={() => goTo(i)}
              aria-current={i === active ? 'true' : undefined}
              title={section.blurb}
              className="group flex h-6 items-center gap-2 rounded-md pl-2 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <span
                className={cn(
                  'whitespace-nowrap rounded px-1.5 py-0.5 text-[11.5px] leading-none',
                  'bg-bg/75 backdrop-blur-[2px] transition-opacity duration-200',
                  i === active
                    ? 'text-text opacity-100'
                    : 'text-text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                )}
              >
                {section.label}
              </span>
              {/* Each tick carries its own chapter's colour, so the rail is a
                  legend for the page as well as a position in it. */}
              <span
                aria-hidden
                data-accent={section.accent}
                className={cn(
                  'block h-px shrink-0 transition-all duration-300',
                  i === active
                    ? 'w-7 bg-accent'
                    : 'w-3 bg-border-strong group-hover:w-5 group-hover:bg-accent',
                )}
              />
            </button>
          ))}

          <RailButton
            label="Next section"
            disabled={atEnd}
            onClick={() => goTo(active + 1)}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </RailButton>
        </div>
      </nav>

      {/* Everywhere else: a pill at the bottom. It says the same three things --
          where you are, how far through, and both ways out -- in the width
          available. Backdrop blur rather than a solid fill, because it sits on
          top of scenes whose whole job is to be looked at. */}
      <nav
        aria-label="Page sections"
        data-accent={accent}
        className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4 xl:hidden"
      >
        <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-border bg-bg/85 py-1 pl-1 pr-1 shadow-sm backdrop-blur-md">
          <RailButton label="Previous section" disabled={atStart} onClick={() => goTo(active - 1)} round>
            <ChevronUp className="h-4 w-4" aria-hidden />
          </RailButton>

          <span className="flex min-w-0 flex-col gap-1 px-2">
            <span className="truncate text-[12px] font-medium leading-none text-text">
              {current.label}
            </span>
            <span aria-hidden className="block h-px w-full min-w-[84px] overflow-hidden bg-border">
              <motion.span style={{ scaleX: fill }} className="block h-px w-full origin-left bg-accent" />
            </span>
          </span>

          <RailButton label="Next section" disabled={atEnd} onClick={() => goTo(active + 1)} round>
            <ChevronDown className="h-4 w-4" aria-hidden />
          </RailButton>
        </div>
      </nav>
    </>
  )
}

function RailButton({
  label, disabled, onClick, round, children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  round?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'grid place-items-center text-text-muted outline-none transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
        'disabled:cursor-default disabled:opacity-30',
        round ? 'h-8 w-8 rounded-full' : 'h-6 w-6 rounded-md',
        !disabled && 'hover:bg-surface-2 hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
