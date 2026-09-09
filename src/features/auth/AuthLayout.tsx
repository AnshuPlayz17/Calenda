import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AuthReel } from './AuthReel'

/**
 * The shell sign-in, sign-up and password reset sit in.
 *
 * They were one page with a boolean, which made "create an account" a
 * second-class state of signing in -- the heading changed and nothing else
 * did. Splitting them means each can say the right thing, and a link to a
 * sign-up page is something you can send someone.
 *
 * Two things about the right-hand column are deliberate and were both bugs
 * before. It scrolls independently of the panel, so a form that is taller than
 * the window never pushes the panel's figures out of the frame. And it is a
 * column with the form pinned to the middle of it rather than a block of
 * content that starts at the top: at 1440x900 the sign-up page's own
 * "Create account" button used to sit below the fold, which is the one thing
 * on an auth page that has to be visible without being looked for.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  fineprint,
  stepKey,
  announce,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
  /** Which screen of a multi-step page this is, for pages that have them.
   *  Changing it re-keys the column so the new step arrives the way the page
   *  itself did instead of being swapped in between two frames. A sign-up form
   *  that replaces four fields with three others in one frame reads as the same
   *  screen having glitched; the same change over 300ms reads as a step. */
  stepKey?: string
  /** What to say out loud when the step changes, e.g. "Step 2 of 3".
   *
   *  It lives here rather than in the page because it has to sit *outside* the
   *  part `stepKey` re-keys. A live region that is unmounted and mounted again
   *  carrying its new text is generally not announced at all -- screen readers
   *  watch an existing region for changes -- so the one element that exists to
   *  narrate the change would be the one element the change destroys. */
  announce?: string
  /** The disclaimer, below the footer link rather than above it. It is the
   *  only thing on the page nobody is here to read, so it goes last -- and on
   *  a short window that is the difference between "Already have an account?"
   *  being reachable without scrolling and not. */
  fineprint?: ReactNode
}) {
  const reduce = useReducedMotion()

  // The form comes first in the DOM and the panel second, and they are placed
  // back into their columns by hand. That is a tab-order fix, not a layout
  // preference: a keyboard follows the DOM, so with the panel written first
  // somebody reaching this page by Tab crossed the brand and the reel's five
  // tick buttons -- six decorative stops -- before the first field. Grid
  // placement puts the panel back on the left without putting it back in front.
  return (
    <div className="grid min-h-dvh lg:h-dvh lg:grid-cols-[1fr_minmax(430px,42%)] lg:overflow-hidden">
      <main className="relative flex flex-col px-5 py-8 sm:px-10 lg:col-start-2 lg:row-start-1 lg:overflow-y-auto">
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>

        {/* Always rendered, empty or not. See `announce`. */}
        <p className="sr-only" role="status" aria-live="polite">{announce ?? ''}</p>

        {/* my-auto rather than justify-center: centred while the form fits, and
            scrolled from the top the moment it does not, instead of clipping
            equally at both ends.

            No AnimatePresence around the step change, deliberately.
            `mode="wait"` would hold the next step off the screen for the length
            of the old one's exit, which on a form is a press that appears to do
            nothing; anything else overlaps two forms in one column. The new
            step simply arrives. */}
        <motion.div
          key={stepKey}
          initial={reduce ? false : { opacity: 0, y: stepKey ? 8 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: stepKey ? 0.3 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto my-auto w-full max-w-[380px] py-3"
        >
          <div className="lg:hidden">
            <Brand size="md" to="/" />
          </div>

          <h1 className="mt-5 font-display text-title-sm font-medium tracking-tight text-text lg:mt-0">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{subtitle}</p>

          {children}

          {footer && <div className="mt-6 text-[13px] text-text-muted">{footer}</div>}

          {fineprint && (
            <p className="mt-5 text-[12px] leading-relaxed text-text-subtle">{fineprint}</p>
          )}
        </motion.div>
      </main>
      {/* The panel. Hidden below lg, where it would only push the actual task
          below the fold -- which is the whole failure this layout is avoiding
          on the other side. */}
      <aside className="panel-dark relative hidden flex-col justify-between overflow-hidden p-10 xl:p-12 lg:col-start-1 lg:row-start-1 lg:flex bg-panel">
        <div className="relative z-10 flex items-start justify-between gap-4">
          <Brand size="md" showMark={false} to="/" className="[&_span]:text-white" />
        </div>

        <AuthReel />

        <p className="relative z-10 mt-10 text-2xs text-panel-subtle">
          A personal project. Not affiliated with, endorsed by, or an official product
          of any school.
        </p>

        {/* Ambient calendar grid, drawn rather than fetched. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="auth-grid" width="72" height="72" patternUnits="userSpaceOnUse">
                <path d="M72 0H0V72" fill="none" stroke="#fff" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#auth-grid)" />
          </svg>
        </div>
      </aside>

    </div>
  )
}
