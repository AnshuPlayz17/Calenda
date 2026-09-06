import { motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { useScrollScene, held } from './scrollScene'
import { CountUp } from './CountUp'

/**
 * Who made this, as a panel that opens.
 *
 * It was a separate page, which meant the one thing on the site that is about a
 * person sat behind a link most readers never followed. Here it is the last
 * thing on the page, in the position where somebody who has read all of it is
 * the one still asking.
 *
 * The mechanism is deliberately unlike anything above it. Five sections already
 * fade, converge, fly, stack and resolve; a sixth doing any of those would read
 * as the page running out of ideas. This one hinges open from its bottom edge
 * as you arrive at it -- a lid lifting -- which is a rotation on the compositor
 * and costs nothing.
 */

const NUMBERS = [
  { value: 27, label: 'tables' },
  { value: 54, label: 'security policies' },
  { value: 117, label: 'tests' },
  { value: 13421, label: 'lines of TypeScript' },
]

export function FounderScene() {
  const { ref, reduce, progress, height } = useScrollScene(2)

  if (reduce) {
    return (
      <section id="founder" className="border-t border-border bg-bg px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-[1000px]">
          <Panel />
        </div>
      </section>
    )
  }

  return (
    <section id="founder" ref={ref} className="relative border-t border-border bg-bg" style={{ height }}>
      <div className="sticky top-0 flex h-svh items-center overflow-hidden px-5 pb-8 pt-16 sm:px-8">
        <div className="mx-auto w-full max-w-[1000px]" style={{ perspective: 1400 }}>
          <Lid progress={progress} />
        </div>
      </div>
    </section>
  )
}

function Lid({ progress }: { progress: MotionValue<number> }) {
  // Open across the first half of the scene, so it is fully readable well
  // before the section lets go of the viewport.
  const [oR, oV] = held([0.06, 0.46], [0, 1])
  const t = useTransform(progress, oR, oV)

  // Hinged at the bottom edge: the top swings up toward the reader.
  const rotateX = useTransform(t, [0, 1], [-74, 0])
  const opacity = useTransform(t, [0, 0.28], [0, 1])
  // Content arrives after the panel is most of the way open, so it is never
  // read at an angle steep enough to distort it.
  const inner = useTransform(t, [0.55, 1], [0, 1])

  return (
    <motion.div
      style={{ rotateX, opacity, transformOrigin: 'bottom center', transformStyle: 'preserve-3d' }}
      className="rounded-2xl border border-border bg-surface p-8 shadow-lg sm:p-12"
    >
      <motion.div style={{ opacity: inner }}>
        <Panel />
      </motion.div>
    </motion.div>
  )
}

/**
 * The content itself, identical whether it arrived by hinge or by scrolling.
 *
 * Deliberately short. It began as a paragraph of six lines and a row of four
 * figures, which is a lot of reading to arrive at after nine thousand pixels --
 * and the figures were doing the persuading anyway. Two sentences, then the
 * numbers, then the disclaimer that has to be here.
 */
function Panel() {
  return (
    <>
      <p className="label-caps">Created by</p>
      <h2 className="mt-4 font-display text-[42px] font-medium leading-[1.02] tracking-tight sm:text-[64px]">
        Anshu Arunav
      </h2>
      <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-text sm:text-[19px]">
        A student at University of Toronto Schools who wanted the school year to stop
        living in four places at once, and built the thing that fixes it.
      </p>
      <p className="mt-3 max-w-[46ch] text-[14.5px] leading-relaxed text-text-muted">
        Alone, end to end — database, authentication, notifications that reach a phone,
        and a test suite that tries to break in on every change.
      </p>

      <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-6 border-t border-border pt-8">
        {NUMBERS.map((n) => (
          <div key={n.label}>
            <dt className="font-display text-[32px] font-medium leading-none tracking-tight text-text sm:text-[38px]">
              <CountUp to={n.value} />
            </dt>
            <dd className="mt-2 text-[12px] leading-snug text-text-subtle">{n.label}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-9 max-w-[60ch] border-t border-border pt-6 text-[12px] leading-relaxed text-text-subtle">
        A personal project. Not affiliated with, endorsed by, or an official product of
        University of Toronto Schools.
      </p>
    </>
  )
}
