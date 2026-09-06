import { motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { Lock, ShieldCheck } from 'lucide-react'
import { useScrollScene, held } from './scrollScene'
import { ParticleText } from './ParticleText'

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
 */

const ATTEMPTS = [
  { attempt: 'Read a child’s notebook with a parent link', outcome: 'A parent link alone grants nothing' },
  { attempt: 'Read a user’s private events as an admin', outcome: 'Admin power reaches community content only' },
  { attempt: 'Approve your own community suggestion', outcome: 'Review is somebody else’s to do' },
  { attempt: 'Set your own role to admin', outcome: 'The role column cannot be self-elevated' },
  { attempt: 'Open a private notebook page by its id', outcome: 'Guessing the URL reaches nothing' },
  { attempt: 'Read another account’s Google token', outcome: 'Private even from an admin' },
]

export function ProofScene() {
  const { ref, reduce, progress, height } = useScrollScene(3)

  const copy = (
    <>
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-subtle text-brand">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </span>
      <div className="mt-5 max-w-[16ch]" id="proof-heading">
        <ParticleText
          as="h2"
          text="Six ways in."
          fontSize={40}
          className="font-display text-[28px] font-medium leading-[1.12] tracking-tight sm:text-[34px] lg:text-[40px]"
        />
        <ParticleText
          text="All six close."
          fontSize={40}
          className="font-display text-[28px] font-medium leading-[1.12] tracking-tight sm:text-[34px] lg:text-[40px]"
        />
      </div>
      <p className="mt-4 max-w-[44ch] text-[14.5px] leading-relaxed text-text-muted sm:text-[15.5px]">
        Permission is enforced by the database, not by hiding buttons — so it holds
        even for a request the app never meant to make. These are the six attempts
        the test suite makes on every change. Each one signs in as the wrong person,
        tries it, and has to be refused.
      </p>
      <p className="mt-3 max-w-[44ch] text-[13px] leading-relaxed text-text-subtle">
        Connecting a parent is not consent to share. Sharing is per item, reversible,
        and off until you turn it on.
      </p>
    </>
  )

  if (reduce) {
    return (
      <section className="border-y border-border bg-surface px-6 py-16" aria-labelledby="proof-heading">
        <div className="mx-auto grid max-w-[1120px] items-start gap-10 lg:grid-cols-2">
          <div>{copy}</div>
          <ul className="flex flex-col gap-2">
            {ATTEMPTS.map((a) => <Row key={a.attempt} {...a} />)}
          </ul>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={ref}
      className="relative border-y border-border bg-surface"
      style={{ height }}
      aria-labelledby="proof-heading"
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden pb-8 pt-16">
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-8 px-6 lg:grid-cols-2 lg:gap-14">
          <div>{copy}</div>
          <ul className="flex flex-col gap-2">
            {ATTEMPTS.map((a, i) => (
              <ScrollRow key={a.attempt} {...a} index={i} progress={progress} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/** One attempt, resolved. Static -- used under reduced motion. */
function Row({ attempt, outcome }: { attempt: string; outcome: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-bg px-3.5 py-3">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--success)' }} aria-hidden />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium leading-snug text-text">{attempt}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-text-muted">{outcome}</span>
      </span>
      <span
        className="label-caps ml-auto shrink-0 pt-0.5"
        style={{ color: 'var(--success)' }}
      >
        Refused
      </span>
    </li>
  )
}

/**
 * The same row, resolving as it is reached.
 *
 * Each attempt gets its own slice of the scene: it lifts, the lock closes, the
 * verdict arrives. Six of them in sequence read as a suite running, which is
 * what is actually being described.
 */
function ScrollRow({
  attempt, outcome, index, progress,
}: {
  attempt: string
  outcome: string
  index: number
  progress: MotionValue<number>
}) {
  const slot = 0.62 / ATTEMPTS.length
  const at = 0.12 + index * slot

  // held(), not clamp: on the native scroll-timeline path the value outside a
  // declared range is the browser's fill behaviour, not Motion's.
  const [rR, rV] = held([at, at + slot * 0.9], [0, 1])
  const resolved = useTransform(progress, rR, rV)

  const y = useTransform(resolved, [0, 1], [10, 0])
  const borderOpacity = useTransform(resolved, [0, 1], [0.35, 1])
  const verdict = useTransform(resolved, [0.55, 1], [0, 1])
  const lock = useTransform(resolved, [0.35, 0.8], [0.25, 1])

  return (
    <motion.li
      style={{ y, opacity: borderOpacity }}
      className="flex items-start gap-3 rounded-xl border border-border bg-bg px-3.5 py-3"
    >
      <motion.span style={{ opacity: lock }} className="mt-0.5 shrink-0">
        <Lock className="h-4 w-4" style={{ color: 'var(--success)' }} aria-hidden />
      </motion.span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium leading-snug text-text">{attempt}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-text-muted">{outcome}</span>
      </span>
      <motion.span
        style={{ opacity: verdict, color: 'var(--success)' }}
        className="label-caps ml-auto shrink-0 pt-0.5"
      >
        Refused
      </motion.span>
    </motion.li>
  )
}
