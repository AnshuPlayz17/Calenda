import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Reveal } from '@/components/Reveal'
import { WindowFrame } from '@/components/ui/WindowFrame'
import { ConvergeScene } from '@/features/landing/ConvergeScene'
import { Tilt } from '@/features/landing/Tilt'
import { ImportScene } from '@/features/landing/ImportScene'
import { StackScene } from '@/features/landing/StackScene'
import { ProofScene } from '@/features/landing/ProofScene'
import { useAuth } from '@/lib/auth'
import { usePreview } from '@/lib/preview'
import { sampleUpcoming } from '@/data/sampleEvents'
import { agendaLabel } from '@/lib/datetime'

/**
 * The same page serves two jobs, and the difference is one redirect.
 *
 * At `/` it is the front door, so someone already signed in is sent to their
 * dashboard rather than being shown a pitch for something they already have.
 * At `/about` it is a page they asked for from inside the app -- so it stays
 * put, and its calls to action point back to the dashboard instead of to a
 * sign-up form. Two routes rather than one route with a flag in history state,
 * because /about survives a refresh and can be sent to someone else.
 */
export function Landing({ redirectSignedIn = true }: { redirectSignedIn?: boolean }) {
  const { session, loading } = useAuth()
  const preview = usePreview()

  if (redirectSignedIn && !loading && (session || preview.active)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-dvh bg-bg">
      <Header />
      <Hero />
      <ConvergeScene />
      <ImportScene />
      <StackScene />
      <ProofScene />
      <Closing />
      <Footer />
    </div>
  )
}

/** Signed in, or exploring the preview -- either way, not a prospect. */
function useSignedIn() {
  const { session } = useAuth()
  const preview = usePreview()
  return Boolean(session || preview.active)
}

function Header() {
  const [scrolled, setScrolled] = useState(false)
  const signedIn = useSignedIn()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={
        'sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300 '
        + (scrolled
          ? 'border-b border-border bg-bg/95 backdrop-blur-md'
          : 'border-b border-transparent')
      }
    >
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Brand size="sm" to="/" />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            to={signedIn ? '/dashboard' : '/sign-in'}
            className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13.5px] font-medium text-brand-contrast no-underline transition-colors duration-150 hover:bg-brand-hover"
          >
            {signedIn ? 'Back to dashboard' : 'Sign in'}
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  const reduce = useReducedMotion()
  const signedIn = useSignedIn()
  const { scrollY } = useScroll()
  // A small parallax on the card stack. Disabled entirely for reduced motion.
  const cardY = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -40])

  return (
    <section className="relative overflow-hidden px-5 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
      {/* Ambient calendar grid, drawn rather than an image. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
        }}
      >
        <svg width="100%" height="100%">
          <defs>
            <pattern id="hero-grid" width="76" height="76" patternUnits="userSpaceOnUse">
              <path d="M76 0H0V76" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>

      <div className="relative mx-auto grid w-full max-w-[1120px] items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div>
          {/* Rendered at rest, not waiting on a scroll observer -- this is the
              first thing anyone sees. */}
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="label-caps"
          >
            For students at University of Toronto Schools
          </motion.p>

          {/* Each line rises out from behind its own edge rather than fading
              in as a block. It is the one place on the page where the type
              itself is the moving thing, which is worth spending here: it is
              the first sentence anybody reads. */}
          <h1 className="mt-4 font-display text-[40px] font-medium leading-[1.05] tracking-tight sm:text-[56px]">
            {['Everything you need', 'for school, in one place.'].map((line, i) => (
              <span key={line} className="block overflow-hidden pb-[0.06em]">
                <motion.span
                  className="block"
                  initial={reduce ? false : { y: '108%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.85, delay: 0.05 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-[52ch] text-[16.5px] leading-relaxed text-text-muted"
          >
            PA days, exams and assemblies. Your own calendar. Google Calendar. Class notes,
            assignments and deadlines. Calenda holds all of it, and tells you what actually
            matters today.
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            {/* Someone reading this from inside the app has already done both
                of these; the only useful button is the way back. */}
            <Link
              to={signedIn ? '/dashboard' : '/sign-up'}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[14.5px] font-medium text-brand-contrast no-underline transition-colors duration-150 hover:bg-brand-hover"
            >
              {signedIn ? 'Back to dashboard' : 'Create an account'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            {!signedIn && (
              <Link
                to="/sign-in"
                className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-[14.5px] font-medium text-text no-underline transition-colors duration-150 hover:bg-surface-2"
              >
                Sign in
              </Link>
            )}
          </motion.div>

          {/* Concrete and checkable, rather than adjectives. */}
          <motion.ul
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 flex flex-wrap gap-x-6 gap-y-2"
          >
            {[
              'Free, with nothing to install',
              'Works on your phone and laptop',
              'Your notes stay private',
            ].map((line) => (
              <li key={line} className="flex items-center gap-1.5 text-[13px] text-text-muted">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
                {line}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div style={{ y: cardY }} className="relative">
          <Tilt>
            <UpcomingPreview />
          </Tilt>
          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-3 text-center text-[12.5px] text-text-subtle"
          >
            A sample of what a term looks like once your classes are in. The
            school's own dates arrive already imported.
          </motion.p>
        </motion.div>
      </div>

      <ScrollCue />
    </section>
  )
}

/**
 * Says there is more, and gets out of the way.
 *
 * The hero is a full screen with a card in it, and on a laptop nothing below
 * it is visible -- so the page can read as finished before it has started.
 * This fades out over the first fifth of a screen: it has done its job by the
 * time anyone has scrolled enough to need it gone.
 */
function ScrollCue() {
  const reduce = useReducedMotion()
  const { scrollY } = useScroll()
  const opacity = useTransform(scrollY, [0, 160], [1, 0])

  if (reduce) return null

  return (
    <motion.div
      style={{ opacity }}
      aria-hidden
      className="pointer-events-none mx-auto mt-14 hidden w-full max-w-[1120px] items-center gap-3 px-5 sm:px-8 lg:flex"
    >
      <span className="label-caps">Keep going</span>
      <motion.span
        className="h-px w-16 origin-left bg-border-strong"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </motion.div>
  )
}

/**
 * A picture of the app, made of invented events.
 *
 * This showed the real 2026-27 school calendar until it was pointed out that
 * the first thing on the page should look like a screenshot of the product.
 * Real dates read as a feed you were already subscribed to; a mockup reads as
 * what your own term would look like once you had one.
 */
function UpcomingPreview() {
  const reduce = useReducedMotion()
  const next = sampleUpcoming()

  return (
    <WindowFrame title="Coming up" aside="Sample">
      <ul className="flex flex-col">
        {next.map((e, i) => (
          <motion.li
            key={`${e.title}-${e.startDate}`}
            initial={reduce ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
          >
            <span
              aria-hidden
              className="h-7 w-[3px] shrink-0 rounded-full"
              style={{ background: `var(--cat-${e.category})` }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-text">
                {e.title}
              </span>
              {e.description && (
                <span className="mt-0.5 block truncate text-[12px] text-text-muted">
                  {e.description}
                </span>
              )}
            </span>
            <span className="shrink-0 text-[11.5px] tabular text-text-subtle">
              {agendaLabel(e.startDate)}
            </span>
          </motion.li>
        ))}
      </ul>
    </WindowFrame>
  )
}
function Closing() {
  const signedIn = useSignedIn()

  return (
    <section className="px-5 py-20 sm:px-8 sm:py-24">
      <Reveal className="mx-auto max-w-[1120px]">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <h2 className="max-w-[18ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[40px]">
                Start the year knowing what's coming.
              </h2>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-text-muted">
                {signedIn
                  ? 'All three are already done on your account. This page is here so you can show someone what Calenda is.'
                  : 'Sign up and the school calendar is already there. Add your classes and everything else follows from them.'}
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to={signedIn ? '/dashboard' : '/sign-up'}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-6 text-[14.5px] font-medium text-brand-contrast no-underline transition-colors duration-150 hover:bg-brand-hover"
                >
                  {signedIn ? 'Back to dashboard' : 'Create an account'}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                {!signedIn && (
                  <Link
                    to="/sign-in"
                    className="text-[14px] text-text-muted underline-offset-2 hover:text-text hover:underline"
                  >
                    or sign in
                  </Link>
                )}
              </div>
            </div>

            {/* What actually happens, in order, so the first minute holds no
                surprises. */}
            <ol className="flex flex-col gap-3">
              {[
                'Sign in with Google, GitHub or Discord',
                'The school calendar is already imported',
                'Add your classes, and deadlines follow',
              ].map((step, i) => (
                <li
                  key={step}
                  className="flex items-start gap-3 rounded-xl border border-border px-4 py-3"
                >
                  <span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-subtle text-[12px] font-medium text-brand">
                    {i + 1}
                  </span>
                  <span className="text-[13.5px] leading-snug text-text">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Brand size="sm" showSchool={false} />
        <p className="max-w-[60ch] text-[12px] leading-relaxed text-text-subtle">
          A personal project. Not affiliated with, endorsed by, or an official product of
          University of Toronto Schools.
        </p>
      </div>
    </footer>
  )
}
