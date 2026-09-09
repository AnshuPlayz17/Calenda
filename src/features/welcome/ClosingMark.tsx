import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Brand } from '@/components/Brand'
import { markSize, schoolMark } from './schoolMark'

/**
 * The last thing the walkthrough shows, and then it gets out of the way.
 *
 * The student's own school set above the Calenda wordmark, a beat, and a fade
 * into the app.
 *
 * WHY THERE IS NO "x" BETWEEN THEM
 *
 * The shape originally asked for was "<school> x Calenda", and that is the
 * exact visual grammar of a partnership lockup -- an endorsement claim under a
 * live trademark, made by a project none of these schools has agreed to
 * anything with. It is also the rule this project states first: never imply
 * Calenda is any school's official product. The owner settled on this version
 * deliberately, after the conflict was put to him.
 *
 * What is left says something true instead. The school is named because it is
 * THEIRS -- it came out of their own profile, at runtime, from an answer they
 * typed -- and the line under it belongs to them too. Calenda's own wordmark
 * sits below, small, as the thing that got out of the way.
 */
export function ClosingMark({
  school, onDone,
}: {
  school: string | null | undefined
  /** Called once the fade is finished, or immediately if it is skipped. */
  onDone: () => void
}) {
  const reduce = useReducedMotion()
  const [leaving, setLeaving] = useState(false)
  const skipRef = useRef<HTMLButtonElement>(null)
  const mark = schoolMark(school)

  // Long enough to read, short enough that it is over before it is in the way.
  // Under reduced motion the whole thing is composed at once and held for the
  // same beat, so the point is made rather than rushed -- a faster version of
  // an animation is not an alternative to it.
  useEffect(() => {
    const hold = setTimeout(() => setLeaving(true), reduce ? 2200 : 3400)
    return () => clearTimeout(hold)
  }, [reduce])

  /**
   * This covers the whole window, so leaving focus where it was leaves it on a
   * button nobody can see -- the "Start using Calenda" press that opened this.
   * Focus moves to Skip, which also makes Escape discoverable rather than a
   * thing you have to guess at.
   */
  useEffect(() => {
    skipRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLeaving(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!leaving) return
    const gone = setTimeout(onDone, reduce ? 200 : 700)
    return () => clearTimeout(gone)
  }, [leaving, onDone, reduce])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Walkthrough finished"
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: reduce ? 0.2 : 0.7, ease: 'easeInOut' }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-bg px-6"
    >
      {mark && (
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-full max-w-[420px] flex-col items-center"
        >
          <span
            className="block text-center font-display font-medium leading-none tracking-tight text-text"
            style={{
              // A fraction of the box rather than a number of points, so it
              // holds at every width -- the same reasoning as the landing
              // tiles, and the same curve.
              fontSize: `${markSize(mark) * 420}px`,
              // Uppercase serif needs air between the letters; a name set in
              // mixed case does not, and the extra space reads as a gap.
              letterSpacing: mark.kind === 'monogram' ? '0.04em' : '-0.01em',
            }}
          >
            {mark.text}
          </span>

          <motion.span
            aria-hidden
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.9, delay: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 block h-px w-24 origin-center bg-border-strong"
          />
        </motion.div>
      )}

      <motion.p
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="text-center text-[15px] text-text-muted"
      >
        Your year is ready.
      </motion.p>

      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: reduce ? 0 : 1.3 }}
      >
        <Brand size="md" showMark={false} />
      </motion.div>

      {/* Always reachable, by press or by Escape. An animation somebody cannot
          leave is a modal with no close button, and three and a half seconds is
          long when you have already read it. */}
      <button
        ref={skipRef}
        onClick={() => setLeaving(true)}
        className="absolute bottom-8 text-[12.5px] text-text-subtle underline-offset-2 transition-colors duration-150 hover:text-text hover:underline"
      >
        Skip
      </button>
    </motion.div>
  )
}
