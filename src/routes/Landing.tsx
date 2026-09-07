import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Reveal } from '@/components/Reveal'
import { Atmosphere } from '@/features/landing/Atmosphere'
import { NumbersScene } from '@/features/landing/NumbersScene'
import { QuestionScene } from '@/features/landing/QuestionScene'
import { Spotlight } from '@/components/motion/Spotlight'
import { PipelineScene } from '@/features/landing/PipelineScene'
import { WorldScene } from '@/features/landing/WorldScene'
import { FounderScene } from '@/features/landing/FounderScene'
import { ImportScene } from '@/features/landing/ImportScene'
import { StackScene } from '@/features/landing/StackScene'
import { ProofScene } from '@/features/landing/ProofScene'
import { OpeningScene } from '@/features/landing/OpeningScene'
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
      <Chapter id="top" accent={accentOf('top')}><Opening /></Chapter>
      <Chapter id="schools" accent={accentOf('schools')}><SchoolsScene /></Chapter>
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

/** The opening chapter needs to know whether the reader is already a user. */
function Opening() {
  return <OpeningScene signedIn={useSignedIn()} />
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
