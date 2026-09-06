import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react'
import { CalendarDays } from 'lucide-react'
import { useRef } from 'react'
import { sampleUpcoming } from '@/data/sampleEvents'
import { agendaLabel } from '@/lib/datetime'
import { held } from './scrollScene'
import { Tilt } from './Tilt'

/**
 * Three app surfaces, layered.
 *
 * The hero showed one card, which made it the only part of the page arguing
 * from a single screenshot -- everything below it shows the product doing
 * something. A stack says the same thing the page spends nine thousand pixels
 * saying: there is more than one surface here, and they belong to each other.
 *
 * The depth is real rather than decorative: the three layers part as you leave
 * the hero, each at its own rate, so scrolling away from it is itself the
 * moment the stack resolves into separate things. That is the only exit
 * animation on the page, and the hero is the right place for it -- it is the
 * one section every reader passes through.
 */

const UPCOMING = sampleUpcoming().slice(0, 4)

export function HeroStack() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  // Runs only across the hero's own exit, so nothing here is live for the rest
  // of the page.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })

  // Each layer leaves at its own rate. The back two also fade, so the stack
  // thins rather than sliding off as a block.
  const [r, v] = held([0, 1], [0, 1])
  const t = useTransform(scrollYProgress, r, v)
  const backY = useTransform(t, [0, 1], [0, -110])
  const midY = useTransform(t, [0, 1], [0, -64])
  const frontY = useTransform(t, [0, 1], [0, -18])
  const backFade = useTransform(t, [0, 0.6], [1, 0])
  const midFade = useTransform(t, [0, 0.75], [1, 0])

  const still = reduce ? undefined : true

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[520px] lg:max-w-none">
      {/* Two layers behind, read as edges rather than as content.
          They carried a row of text each to begin with, and the front card
          sliced both of them mid-word -- a stack whose depth you can read is
          worth more than two labels you cannot. */}
      <motion.div
        style={still ? { y: backY, opacity: backFade } : undefined}
        className="absolute -top-7 left-[9%] right-[9%] h-10 rounded-xl border border-border bg-surface-2 shadow-sm"
        aria-hidden
      />
      <motion.div
        style={still ? { y: midY, opacity: midFade } : undefined}
        className="absolute -top-3.5 left-[4.5%] right-[4.5%] h-10 rounded-xl border border-border bg-surface shadow-sm"
        aria-hidden
      />

      {/* Front: the real card, and the only one a screen reader is given. */}
      <motion.div style={still ? { y: frontY } : undefined} className="relative">
        <Tilt>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-md">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden>
                <i className="h-2 w-2 rounded-full bg-surface-3" />
                <i className="h-2 w-2 rounded-full bg-surface-3" />
                <i className="h-2 w-2 rounded-full bg-surface-3" />
              </span>
              <span className="ml-1 flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Coming up
              </span>
              <span className="label-caps ml-auto">Sample</span>
            </div>
            <ul className="flex flex-col">
              {UPCOMING.map((e) => (
                <li
                  key={e.title}
                  className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <span
                    aria-hidden
                    className="h-7 w-[3px] shrink-0 rounded-full"
                    style={{ background: `var(--cat-${e.category})` }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-text">{e.title}</span>
                    {e.description && (
                      <span className="mt-0.5 block truncate text-[12px] text-text-muted">
                        {e.description}
                      </span>
                    )}
                  </span>
                  <span className="tabular shrink-0 text-[11.5px] text-text-subtle">
                    {agendaLabel(e.startDate)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Tilt>
      </motion.div>
    </div>
  )
}
