import { motion, useMotionTemplate, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { Lock, ShieldCheck } from 'lucide-react'
import { useScrollScene, held } from './scrollScene'
import { ChapterHeading, Measure, PinnedFrame } from './Chapter'

/**
 * Privacy, argued with the tests instead of adjectives.
 *
 * The section this replaces said the rules were "enforced by the database
 * itself -- not by hiding buttons", which is true and completely unverifiable
 * from the outside. Every app says a version of it.
 *
 * These six are real. Each is a test in supabase/tests/rls_test.sql that signs
 * in as the wrong person, attempts the access, and requires it to fail; the
 * file exits non-zero if any of them succeeds. Naming the attempt is a stronger
 * claim than naming the protection, because an attempt is falsifiable: anyone
 * can open the file and read what was tried.
 *
 * The mechanic is the argument. The attempts used to appear in place and
 * resolve, which is six rows filling in -- the same shape as the schools
 * arriving, and it showed refusal as a label rather than as an event. They now
 * travel at a wall and stop dead against it. Nothing gets through, and you
 * watch nothing get through six times, which is what the six tests are.
 */

const ATTEMPTS = [
  { attempt: 'Read a child’s notebook with a parent link', outcome: 'A parent link alone grants nothing' },
  { attempt: 'Read a user’s private events as an admin', outcome: 'Admin power reaches community content only' },
  { attempt: 'Approve your own community suggestion', outcome: 'Review is somebody else’s to do' },
  { attempt: 'Set your own role to admin', outcome: 'The role column cannot be self-elevated' },
  { attempt: 'Open a private notebook page by its id', outcome: 'Guessing the URL reaches nothing' },
  { attempt: 'Read another account’s Google token', outcome: 'Private even from an admin' },
]

const LEAD = 0.08
const SPAN = 0.72
const STEP = SPAN / ATTEMPTS.length

export function ProofScene() {
  const { ref, reduce, progress, height } = useScrollScene(4)

  const heading = (
    <ChapterHeading
      Icon={ShieldCheck}
      eyebrow="Enforced, not hidden"
      title="Six ways in. All six close."
      lede={
        <>
          Permission is enforced by the database, not by hiding buttons — so it holds
          even for a request the app never meant to make. These are the six attempts
          the test suite makes on every change. Each one signs in as the wrong person,
          tries it, and has to be refused.
        </>
      }
      note={
        <>
          Connecting a parent is not consent to share. Sharing is per item, reversible,
          and off until you turn it on.
        </>
      }
    />
  )

  if (reduce) {
    return (
      <section className="relative z-10 border-y border-border bg-surface px-5 py-20 sm:px-8 sm:py-28">
        <Measure className="grid items-start gap-12 lg:grid-cols-2">
          <div>{heading}</div>
          <ul className="flex flex-col gap-2.5">
            {ATTEMPTS.map((a) => <StaticRow key={a.attempt} {...a} />)}
          </ul>
        </Measure>
      </section>
    )
  }

  return (
    <section ref={ref} className="relative z-10 border-y border-border bg-surface" style={{ height }}>
      <PinnedFrame>
        <Measure className="grid items-center gap-10 lg:grid-cols-[0.85fr_1fr] lg:gap-14">
          <div>{heading}</div>

          {/* The wall is one element, drawn once, and the attempts stop against
              it. Its notches are where each one hit -- which is the only part
              of this scene that accumulates, so the reader can see at the end
              that six things were stopped and not one. */}
          <div className="relative pl-3">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-px bg-accent-border"
            />
            <ul className="flex flex-col gap-2.5">
              {ATTEMPTS.map((a, i) => (
                <ScrollRow key={a.attempt} {...a} index={i} progress={progress} />
              ))}
            </ul>
          </div>
        </Measure>
      </PinnedFrame>
    </section>
  )
}

/** One attempt, resolved. Static -- used under reduced motion. */
function StaticRow({ attempt, outcome }: { attempt: string; outcome: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-bg px-3.5 py-3">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium leading-snug text-text">{attempt}</span>
        <span className="mt-0.5 block text-xs leading-snug text-text-muted">{outcome}</span>
      </span>
      <span className="label-caps ml-auto shrink-0 pt-0.5 text-accent">Refused</span>
    </li>
  )
}

/**
 * The same attempt, thrown at the wall.
 *
 * Everything is declared across the whole scene with its ends stated, because
 * outside a declared range a scroll-linked transform gets the browser's fill
 * behaviour rather than Motion's clamp -- a beat that faded out here was once
 * measured climbing back to 0.91 underneath a later one.
 */
function ScrollRow({
  attempt, outcome, index, progress,
}: {
  attempt: string
  outcome: string
  index: number
  progress: MotionValue<number>
}) {
  const at = LEAD + index * STEP

  // Fast in, dead stop. An attempt that eases gently into place looks like it
  // was allowed to arrive; this one is going somewhere until it is not.
  const [tR, tV] = held([at, at + STEP * 0.62, at + STEP * 0.72], [0, 1, 1])
  const travel = useTransform(progress, tR, tV)
  const approach = useTransform(travel, [0, 1], [-42, 0])
  const opacity = useTransform(travel, [0, 0.25, 1], [0, 1, 1])

  // The recoil: a few pixels back off the wall at the moment of contact.
  const [rR, rV] = held(
    [at + STEP * 0.55, at + STEP * 0.62, at + STEP * 0.78],
    [0, -7, 0],
  )
  const recoil = useTransform(progress, rR, rV)

  // One transform property, one value. Two motion values both writing
  // translateX means whichever Motion applies last silently wins, and the
  // approach is a percentage of the card while the recoil is pixels off a
  // wall -- so they are composed in calc() rather than fought over.
  const x = useMotionTemplate`calc(${approach}% + ${recoil}px)`

  const [vR, vV] = held([at + STEP * 0.6, at + STEP * 0.9], [0, 1])
  const verdict = useTransform(progress, vR, vV)
  const lockScale = useTransform(verdict, [0, 1], [0.7, 1])

  // The wall notches where this one landed, and stays notched.
  const [nR, nV] = held([at + STEP * 0.58, at + STEP * 0.72], [0, 1])
  const notch = useTransform(progress, nR, nV)

  return (
    <motion.li style={{ opacity }} className="relative">
      <motion.span
        aria-hidden
        style={{ scaleY: notch, opacity: notch }}
        className="absolute -left-3 top-1/2 block h-9 w-[3px] -translate-y-1/2 rounded-full bg-accent"
      />
      <motion.span
        style={{ x }}
        className="flex items-start gap-3 rounded-xl border border-border bg-bg px-3.5 py-3"
      >
        <motion.span style={{ scale: lockScale, opacity: verdict }} className="mt-0.5 shrink-0">
          <Lock className="h-4 w-4 text-accent" aria-hidden />
        </motion.span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-medium leading-snug text-text">{attempt}</span>
          <span className="mt-0.5 block text-xs leading-snug text-text-muted">{outcome}</span>
        </span>
        <motion.span style={{ opacity: verdict }} className="label-caps ml-auto shrink-0 pt-0.5 text-accent">
          Refused
        </motion.span>
      </motion.span>
    </motion.li>
  )
}
