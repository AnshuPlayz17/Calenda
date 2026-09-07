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
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
  /** The disclaimer, below the footer link rather than above it. It is the
   *  only thing on the page nobody is here to read, so it goes last -- and on
   *  a short window that is the difference between "Already have an account?"
   *  being reachable without scrolling and not. */
  fineprint?: ReactNode
}) {
  const reduce = useReducedMotion()

  return (
    <div className="grid min-h-dvh lg:h-dvh lg:grid-cols-[1fr_minmax(430px,42%)] lg:overflow-hidden">
      {/* The panel. Hidden below lg, where it would only push the actual task
          below the fold -- which is the whole failure this layout is avoiding
          on the other side. */}
      <aside className="panel-dark relative hidden flex-col justify-between overflow-hidden p-10 xl:p-12 lg:flex bg-panel">
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

      <main className="relative flex flex-col px-5 py-8 sm:px-10 lg:overflow-y-auto">
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>

        {/* my-auto rather than justify-center: centred while the form fits, and
            scrolled from the top the moment it does not, instead of clipping
            equally at both ends. */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto my-auto w-full max-w-[380px] py-4"
        >
          <div className="lg:hidden">
            <Brand size="md" to="/" />
          </div>

          <h1 className="mt-6 font-display text-title-sm font-medium tracking-tight text-text lg:mt-0">
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
    </div>
  )
}
