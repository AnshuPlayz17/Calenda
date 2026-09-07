import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Reveal } from '@/components/Reveal'
import { Atmosphere } from '@/features/landing/Atmosphere'
import { NumbersScene } from '@/features/landing/NumbersScene'
import { QuestionScene } from '@/features/landing/QuestionScene'
import { Spotlight } from '@/components/motion/Spotlight'
import { PipelineScene } from '@/features/landing/PipelineScene'
import { WorldScene } from '@/features/landing/WorldScene'
import { ZoomScene } from '@/features/landing/ZoomScene'
import { FounderScene } from '@/features/landing/FounderScene'
import { HeroStack } from '@/features/landing/HeroStack'
import { ImportScene } from '@/features/landing/ImportScene'
import { StackScene } from '@/features/landing/StackScene'
import { ProofScene } from '@/features/landing/ProofScene'
import { SchoolsScene } from '@/features/landing/SchoolsScene'
import { ScrollCompanion } from '@/features/landing/ScrollCompanion'
import { Chapter } from '@/features/landing/Chapter'
import { useChapters } from '@/features/landing/useChapters'
import { LANDING_SECTIONS } from '@/features/landing/sections'
import { useAuth } from '@/lib/auth'
import { usePreview } from '@/lib/preview'

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
  const { hash } = useLocation()
  const chapters = useChapters()

  // Built once. `useChapters` sets state on every chapter boundary, and this
  // component renders the whole page -- so without this, crossing into a new
  // chapter re-rendered all twelve scenes, the import's fifty-one chips and
  // the world map's thirteen hundred dots included. The harness measured it
  // exactly: twelve chapter boundaries, nine to twelve frames over 100ms, on
  // every viewport and under reduced motion, where nothing else was moving.
  // Stable elements let React skip those subtrees entirely.
  const page = useMemo(() => (
    <>
      <Chapter id="top" accent={accentOf('top')}><Hero /></Chapter>
      <Chapter id="schools" accent={accentOf('schools')}><SchoolsScene /></Chapter>
      <Chapter id="glance" accent={accentOf('glance')}><ZoomScene /></Chapter>
      <Chapter id="pipeline" accent={accentOf('pipeline')}><PipelineScene /></Chapter>
      <Chapter id="import" accent={accentOf('import')}><ImportScene /></Chapter>
      <Chapter id="more" accent={accentOf('more')}><StackScene /></Chapter>
      <Chapter id="numbers" accent={accentOf('numbers')}><NumbersScene /></Chapter>
      <Chapter id="questions" accent={accentOf('questions')}><QuestionScene /></Chapter>
      <Chapter id="world" accent={accentOf('world')}><WorldScene /></Chapter>
      <Chapter id="privacy" accent={accentOf('privacy')}><ProofScene /></Chapter>
      <FounderScene />
      <Chapter id="start" accent={accentOf('start')}><Closing /></Chapter>
    </>
  ), [])

  // Hash routing means the browser never scrolls to a fragment itself -- the
  // whole path already lives in the hash. Anyone arriving from the app sidebar
  // has asked for one section specifically, so take them there.
  //
  // Not to its top, though. That section is a pinned scene whose panel is shut
  // at scroll progress zero, so landing on the boundary lands on a blank frame.
  // Aim past the point where it has finished opening.
  useEffect(() => {
    if (hash !== '#founder') return
    const id = window.setTimeout(() => {
      const el = document.getElementById('founder')
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      const track = Math.max(0, el.offsetHeight - window.innerHeight)
      window.scrollTo({ top: top + track * 0.55, behavior: 'auto' })
    }, 60)
    return () => window.clearTimeout(id)
  }, [hash])

  if (redirectSignedIn && !loading && (session || preview.active)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="relative min-h-dvh bg-bg">
      <Atmosphere />
      <Header accent={chapters.section.accent} chapter={chapters.active} />
      {/* The ids are the anchors the companion rail jumps to, and they live
          here rather than inside each scene so the order of the page and the
          order of the rail are the same list. FounderScene carries its own id
          already -- it is linked to from the app sidebar. */}
      {page}
      <Footer />
      <ScrollCompanion
        active={chapters.active}
        accent={chapters.section.accent}
        ready={chapters.ready}
        goTo={chapters.goTo}
      />
    </div>
  )
}

/** The chapter list is the single source for a section's colour. */
function accentOf(id: string) {
  return LANDING_SECTIONS.find((s) => s.id === id)?.accent ?? 'indigo'
}

/** Signed in, or exploring the preview -- either way, not a prospect. */
function useSignedIn() {
  const { session } = useAuth()
  const preview = usePreview()
  return Boolean(session || preview.active)
}

function Header({ accent, chapter }: { accent: string; chapter: number }) {
  const [scrolled, setScrolled] = useState(false)
  const signedIn = useSignedIn()
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll()
  // Sprung, so a flick of the wheel does not make the rail twitch. Not sprung
  // under reduced motion, where it becomes a plain readout rather than a moving
  // thing -- the position is still useful, the movement is what was objected to.
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 })
  const readProgress = reduce ? scrollYProgress : smooth

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    // The accent is set here rather than on the page wrapper. It was on the
    // wrapper first, so that the header and the companion could inherit the
    // colour of whatever chapter was being read -- and changing an inherited
    // custom property on an ancestor of the whole document forces a style
    // recalculation of every element under it. Twelve chapters, twelve full
    // recalcs, and the harness measured exactly that: nine to twelve frames
    // over 100ms per traversal on every viewport, reduced motion included.
    // Two small subtrees each carrying their own copy costs nothing.
    <header
      data-accent={accent}
      className={
        'sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300 '
        + (scrolled
          ? 'border-b border-border bg-bg/85 backdrop-blur-xl'
          : 'border-b border-transparent')
      }
    >
      {/* How far through, in the one bar of chrome that is always on screen.
          It takes the colour of the chapter being read, so it is a readout of
          where you are as well as how far -- the only element that can be,
          since it is the only one present in all twelve. */}
      <motion.span
        aria-hidden
        style={{ scaleX: readProgress }}
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-accent transition-colors duration-700"
      />
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Brand size="sm" to="/" />
          {/* Which chapter, beside the mark. Twelve names stacked in one slot
              so the width never moves, cross-fading as the reader crosses each
              boundary -- the header already knows where they are, and until now
              only said it with a colour. */}
          <span aria-hidden className="relative hidden h-4 items-center md:flex">
            <span className="block h-4 w-px bg-border" />
            <span className="relative ml-3 block">
              {LANDING_SECTIONS.map((section, i) => (
                <span
                  key={section.id}
                  className={
                    'label-caps whitespace-nowrap transition-opacity duration-500 '
                    + (i === 0 ? 'block ' : 'absolute inset-0 block ')
                    + (i === chapter ? 'opacity-100' : 'opacity-0')
                  }
                >
                  {section.label}
                </span>
              ))}
            </span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ThemeToggle />
          <Link
            to={signedIn ? '/dashboard' : '/sign-in'}
            className="inline-flex h-9 items-center rounded-lg bg-text px-4 text-[13.5px] font-medium text-bg no-underline transition-opacity duration-150 hover:opacity-85"
          >
            {signedIn ? 'Back to dashboard' : 'Sign in'}
          </Link>
        </div>
      </div>
    </header>
  )
}

/**
 * The first screen.
 *
 * Two changes from the version this replaces, and the second is the one that
 * matters. The type is now the page's own display scale rather than three
 * hand-picked pixel sizes, so it interpolates with the window instead of
 * jumping at a breakpoint. And the hero has an exit: it used to sit still
 * while the page scrolled away underneath it, which on a page built entirely
 * out of scroll-driven scenes is the one screen that says nothing happens when
 * you scroll. The headline now rises and clears, the stack tilts back and
 * parts, and the whole thing hands over rather than being left behind.
 */
const HEADLINE = ['Everything you', 'need for school,', 'in one place.']

function Hero() {
  const reduce = useReducedMotion()
  const signedIn = useSignedIn()
  const { scrollY } = useScroll()
  // Read once on mount, deliberately: a window resized across the breakpoint
  // mid-scroll would otherwise swap the hero's exit underneath the reader.
  const [roomy] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)

  // The hero does not scroll away, it is scrolled *into*. The copy falls back
  // and dims while the card stack comes forward and grows past the edges of the
  // window, so leaving the first screen reads as a camera push rather than as
  // a page moving up. It hands over to the schools chapter mid-move.
  const exit = useTransform(scrollY, [0, 760], [0, 1], { clamp: true })
  const copyY = useTransform(exit, [0, 1], [0, reduce ? 0 : -130])
  const copyScale = useTransform(exit, [0, 1], [1, reduce ? 1 : 0.93])
  const copyFade = useTransform(exit, [0, 0.7], [1, reduce ? 1 : 0])
  const stackY = useTransform(exit, [0, 1], [0, reduce ? 0 : -150])
  // Only where there is room for it. Below lg the stack already fills its
  // column, so any push-in at all puts it wider than the window -- clipped by
  // the section, but still a 490px element inside a 375px screen, which is the
  // sort of thing that stops being merely untidy the moment something inside it
  // wants to be scrolled or read.
  const stackScale = useTransform(exit, [0, 1], [1, reduce || !roomy ? 1.02 : 1.42])
  const stackTilt = useTransform(exit, [0, 1], [0, reduce ? 0 : 7])
  const stackFade = useTransform(exit, [0.55, 1], [1, reduce ? 1 : 0])


  return (
    <section className="relative z-10 overflow-hidden px-5 pb-20 pt-14 sm:px-8 sm:pb-28 sm:pt-20">
      {/* An accent-coloured light behind the headline: the first thing that
          says this page has a colour at all, in the same colour the header
          rail is carrying at that moment.

          Deliberately static. The first cut scaled it as the hero left, which
          measured at nine frames over 100ms on a phone -- a 990px element
          under a 110px blur has to be re-blurred on every frame it changes,
          and scaling it changes it on all of them. It is painted once and
          composited now, and it is capped to the viewport so it is not a
          thousand pixels wide inside a 390px window. */}


      <div
        aria-hidden
        className="pointer-events-none absolute -top-[18%] left-1/2 h-[min(30rem,90vw)] w-[min(30rem,90vw)] -translate-x-1/2 rounded-full bg-accent opacity-[0.13] blur-[90px] sm:-top-[26%] sm:h-[42rem] sm:w-[42rem]"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          maskImage: 'radial-gradient(70% 55% at 50% 30%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(70% 55% at 50% 30%, black, transparent)',
        }}
      >
        <svg width="100%" height="100%">
          <defs>
            <pattern id="hero-grid" width="72" height="72" patternUnits="userSpaceOnUse">
              <path d="M72 0H0V72" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>

      <div className="relative mx-auto w-full max-w-[1240px]">
        <motion.div style={{ y: copyY, scale: copyScale, opacity: copyFade }} className="origin-top">
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="label-caps text-accent"
          >
            For students and parents
          </motion.p>

          {/* The headline gets the full width rather than half of a split.
              At this size a two-column hero breaks "Everything you need" over
              four arbitrary lines; given the page it breaks over three chosen
              ones, and the sentence is the loudest thing on the screen, which
              on a first screen is correct. */}
          {/* The label is built from the same array as the lines. Three block
              spans with no whitespace between them concatenate into
              "Everything youneed for school," for anything reading the
              accessible name -- a screen reader, and the test that guards this
              page's identity. */}
          <h1
            aria-label={HEADLINE.join(' ')}
            className="mt-6 font-display text-display font-medium leading-[0.98] tracking-[-0.025em] lg:text-display-lg"
          >
            {HEADLINE.map((line, i) => (
              <span key={line} className="block overflow-hidden pb-[0.09em]">
                <motion.span
                  className="block"
                  initial={reduce ? false : { y: '110%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.95, delay: 0.05 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
        </motion.div>

        <div className="mt-12 grid items-start gap-12 lg:mt-16 lg:grid-cols-[0.92fr_1fr] lg:gap-16">
          <motion.div style={{ y: copyY, scale: copyScale, opacity: copyFade }} className="origin-top">
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-[46ch] text-lg leading-relaxed text-text-muted sm:text-xl"
            >
              PA days, exams and assemblies. Your own calendar. Google Calendar. Class notes,
              assignments and deadlines. Calenda holds all of it, and tells you what actually
              matters today.
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              {/* Someone reading this from inside the app has already done both
                  of these; the only useful button is the way back. */}
              <Link
                to={signedIn ? '/dashboard' : '/sign-up'}
                className="group inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-[15px] font-medium text-accent-contrast no-underline shadow-md transition-transform duration-200 hover:-translate-y-0.5"
              >
                {signedIn ? 'Back to dashboard' : 'Create an account'}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
              {!signedIn && (
                <Link
                  to="/sign-in"
                  className="inline-flex h-12 items-center rounded-xl border border-border px-5 text-[15px] font-medium text-text no-underline transition-colors duration-150 hover:border-accent-border hover:bg-accent-subtle"
                >
                  Sign in
                </Link>
              )}
            </motion.div>

            {/* Concrete and checkable, rather than adjectives. */}
            <motion.ul
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
              className="mt-8 flex flex-col gap-2.5"
            >
              {[
                'Free, with nothing to install',
                'Works on your phone and laptop',
                'Your notes stay private',
              ].map((line, i) => (
                <li key={line} className="flex items-center gap-2 text-[15px] text-text-muted">
                  {/* Each tick arrives after its line, so the three read as
                      being checked off rather than as having always been true. */}
                  <motion.span
                    initial={reduce ? false : { scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.5 + i * 0.12, ease: [0.34, 1.56, 0.64, 1] }}
                    className="grid shrink-0 place-items-center"
                  >
                    <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden />
                  </motion.span>
                  {line}
                </li>
              ))}
            </motion.ul>
          </motion.div>

          <motion.div
            style={{
              y: stackY,
              scale: stackScale,
              opacity: stackFade,
              rotateX: stackTilt,
              transformPerspective: 1400,
            }}
            className="relative origin-top"
          >
            <HeroStack />
            <motion.p
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-4 text-center text-sm text-text-subtle"
            >
              A sample of what a term looks like once your classes are in. The
              school's own dates arrive already imported.
            </motion.p>
          </motion.div>
        </div>
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
      className="pointer-events-none mx-auto mt-16 hidden w-full max-w-[1240px] items-center gap-3 px-5 sm:px-8 lg:flex"
    >
      <span className="label-caps text-accent">Keep going</span>
      <motion.span
        className="h-px w-20 origin-left bg-accent-border"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </motion.div>
  )
}

function Closing() {
  const signedIn = useSignedIn()

  return (
    // The last thing on a page that has spent nine thousand pixels showing
    // rather than telling, so it does the opposite: no demo, no motion beyond
    // the reveal, one sentence and a door.
    <section className="relative z-10 overflow-hidden border-t border-border bg-surface px-5 py-28 sm:px-8 sm:py-36">
      <Spotlight className="bg-accent/[0.10] blur-[90px]" size={460} />
      <Reveal className="mx-auto max-w-[1240px]">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-end">
          <div>
            <p className="label-caps text-accent">Ready when you are</p>
            <h2 className="mt-4 max-w-[16ch] font-display text-display font-medium leading-[1.02] tracking-[-0.02em] lg:text-display-lg">
              Start the year knowing what's coming.
            </h2>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-text-muted">
              {signedIn
                ? 'All three are already done on your account. This page is here so you can show someone what Calenda is.'
                : 'Sign up and the school calendar is already there. Add your classes and everything else follows from them.'}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                to={signedIn ? '/dashboard' : '/sign-up'}
                className="group inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-7 text-[15px] font-medium text-accent-contrast no-underline shadow-md transition-transform duration-200 hover:-translate-y-0.5"
              >
                {signedIn ? 'Back to dashboard' : 'Create an account'}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
              {!signedIn && (
                <Link
                  to="/sign-in"
                  className="text-[15px] text-text-muted underline-offset-4 hover:text-text hover:underline"
                >
                  or sign in
                </Link>
              )}
            </div>
          </div>

          {/* What actually happens, in order, so the first minute holds no
              surprises. */}
          <ol className="flex flex-col divide-y divide-border border-y border-border">
            {[
              'Sign in with Google, GitHub or Discord',
              'The school calendar is already imported',
              'Add your classes, and deadlines follow',
            ].map((step, i) => (
              <li
                key={step}
                className="group relative flex items-baseline gap-5 py-4 transition-[padding] duration-200 hover:pl-2"
              >
                {/* A rule that draws in from the left edge under the pointer.
                    Three steps, and this is the only thing on the last screen
                    that answers a hover at all. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-px origin-top scale-y-0 bg-accent transition-transform duration-300 group-hover:scale-y-100"
                />
                <span className="label-caps tabular shrink-0 text-accent">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[15px] leading-snug text-text">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  // The extra bottom padding is for the companion pill, which is fixed to the
  // bottom of the window on anything narrower than xl. Without it the last line
  // of the disclaimer ends up underneath the control.
  return (
    <footer className="relative z-10 border-t border-border px-5 pb-24 pt-12 sm:px-8 xl:pb-12">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Brand size="sm" showMark={false} />
        <div className="flex flex-col gap-3 sm:items-end">
          {/* The header is for getting into the product. This belongs at the
              end, where somebody who has read the whole page is the one asking. */}
          <a
            href="#founder"
            className="text-sm font-medium text-text-muted no-underline underline-offset-4 transition-colors duration-150 hover:text-text hover:underline"
          >
            About the founder
          </a>
          <p className="max-w-[60ch] text-xs leading-relaxed text-text-subtle">
            A personal project by Anshu Arunav. Not affiliated with, endorsed by, or an
            official product of any school.
          </p>
        </div>
      </div>
    </footer>
  )
}
