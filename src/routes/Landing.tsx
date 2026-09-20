import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { Stage, Stills } from '@/features/landing/scrub/Stage'
import type { Palette } from '@/features/landing/scrub/draw'
import { PANELS, panelAt } from '@/features/landing/scrub/panels'
import { useAuth } from '@/lib/auth'
import { usePreview } from '@/lib/preview'

/**
 * The front door: one drawing, scrubbed by the scroll, and three panels over it.
 *
 * Nothing on this page scrolls in the ordinary sense. The header, the footer,
 * the drawing and all three panels are fixed; the only thing with height is an
 * empty track, and moving down it advances a single number. That number opens a
 * book, turns its spine into a hinge, and cross-fades the three things Calenda
 * actually claims to do.
 *
 * It replaces an eleven-chapter page, and the reason is not that the old one
 * was bad. It was that it argued eleven times. This argues three, and each of
 * the three is a sentence already checked into docs/FACTS.md.
 *
 * The same page still serves two jobs. At `/` it is the front door, so somebody
 * already signed in is sent to their dashboard rather than shown a pitch for
 * what they already have. At `/about` it stays put and points back to the
 * dashboard instead of at a sign-up form.
 */
export function Landing({ redirectSignedIn = true }: { redirectSignedIn?: boolean }) {
  const { session, loading } = useAuth()
  const preview = usePreview()
  const { hash } = useLocation()
  const still = useReducedMotion()
  const signedIn = Boolean(session || preview.active)

  const root = useRef<HTMLDivElement | null>(null)
  const panels = useRef<Array<HTMLElement | null>>([])
  const meter = useRef<HTMLSpanElement | null>(null)
  const ticks = useRef<Array<HTMLElement | null>>([])

  const [mono, setMono] = useState(() => {
    // Per-viewer convenience, so it is browser storage rather than the
    // database -- and every read is wrapped, because a private window can
    // throw on the way in rather than returning nothing.
    try { return window.localStorage.getItem('calenda.landing.mono') === '1' } catch { return false }
  })

  useEffect(() => {
    try { window.localStorage.setItem('calenda.landing.mono', mono ? '1' : '0') } catch { /* no-op */ }
  }, [mono])

  /**
   * The ink the drawing uses, read from the page rather than hard-coded.
   *
   * It has to come from computed style: the app has three themes and this page
   * adds a mono switch on top of them, and a canvas cannot inherit a custom
   * property. Read on demand rather than cached, so a theme change is picked up
   * by the next frame without anything having to know a change happened.
   */
  const paletteOf = useCallback((): Palette => {
    const el = root.current
    if (!el) return { ink: 'rgb(30, 55, 101)', paper: 'rgb(255, 255, 255)', tint: 1 }
    const cs = getComputedStyle(el)
    return {
      ink: cs.getPropertyValue('--scrub-ink').trim() || 'rgb(30, 55, 101)',
      paper: cs.getPropertyValue('--scrub-paper').trim() || 'rgb(255, 255, 255)',
      tint: mono ? 0 : 1,
    }
  }, [mono])

  /**
   * Written straight onto style properties out of the rAF callback.
   *
   * Not React state: this runs sixty times a second and there is nothing to
   * reconcile -- three opacities, three transforms and one scale. Routing that
   * through a re-render is how a scroll page starts dropping frames.
   */
  const onFrame = useCallback((p: number) => {
    if (meter.current) meter.current.style.transform = `scaleX(${p})`
    PANELS.forEach((panel, i) => {
      const el = panels.current[i]
      if (!el) return
      const { o, y } = panelAt(panel.cue, p)
      el.style.opacity = String(o)
      el.style.transform = `translate3d(0, ${y}px, 0)`
      el.style.pointerEvents = o > 0.6 ? 'auto' : 'none'
      const tick = ticks.current[i]
      // The rail is written from the same loop for the same reason the panels
      // are: it is three opacities, and routing them through React state would
      // re-render the page sixty times a second to change a number.
      if (tick) tick.style.opacity = String(0.34 + o * 0.66)
    })
  }, [])

  // The founder panel is not on this page any more; it is its own route. An
  // old link that lands here still has somewhere to go, because a link that
  // used to work and now silently does nothing is worse than a missing page.
  if (hash === '#founder') return <Navigate to="/created-by" replace />

  if (redirectSignedIn && !loading && signedIn) {
    return <Navigate to="/dashboard" replace />
  }

  const action = signedIn
    ? { to: '/dashboard', label: 'Back to dashboard' }
    : { to: '/sign-up', label: 'Create an account' }

  return (
    <div
      ref={root}
      data-mono={mono ? 'on' : 'off'}
      className="landing-scrub relative min-h-dvh bg-bg text-text"
    >
      <Chrome mono={mono} onMono={() => setMono((v) => !v)} action={action} />

      {still ? (
        <StillPage paletteOf={paletteOf} action={action} />
      ) : (
        <>
          {/* The drawing. Fixed, behind everything, and the only thing the
              scroll actually moves. */}
          <div className="pointer-events-none fixed inset-0 z-0">
            <Stage onFrame={onFrame} paletteOf={paletteOf} />
            {/* The wash. Line art is all edges, and an edge crossing a
                letterform is worse than a photograph behind one -- the first
                build ran the ruled lines of an agenda page straight through
                'Everything you need for school'. Heavier in the middle, where
                the headline is, and clearing at the sides so the object is
                still visibly an object. */}
            <div className="landing-veil absolute inset-0" />
          </div>

          <span
            ref={meter}
            aria-hidden
            className="fixed left-0 top-0 z-50 h-0.5 w-full origin-left scale-x-0 bg-text/55"
          />

          {/* The rail, in the left margin the 1240px container leaves over.
              It answers "through what" rather than "how far" -- the hairline
              above already does the second -- and it is the only thing on the
              page that shows all three claims at once.

              2xl, not xl. A 1240px container inside a 1280px window leaves
              twenty pixels a side, and the first version put a labelled rail
              in them: the words landed directly on top of the paragraph. The
              rail only exists where there is genuinely a margin to put it in,
              which starts at 1536. */}
          <nav
            aria-label="Sections"
            className="pointer-events-none fixed left-0 top-1/2 z-30 hidden -translate-y-1/2
                       flex-col gap-6 pl-8 2xl:flex 2xl:pl-12"
          >
            {PANELS.map((panel, i) => (
              <a
                key={panel.id}
                href={`#${panel.id}`}
                ref={(el) => { ticks.current[i] = el }}
                style={{ opacity: 0.34 }}
                className="pointer-events-auto flex items-center gap-3 no-underline"
              >
                <span className="h-px w-6 bg-text" aria-hidden />
                <span className="label-caps whitespace-nowrap text-[11px] text-text">
                  {panel.label}
                </span>
              </a>
            ))}
          </nav>

          <main className="pointer-events-none fixed inset-0 z-20">
            {PANELS.map((panel, i) => (
              <section
                key={panel.id}
                ref={(el) => { panels.current[i] = el }}
                style={{ opacity: 0 }}
                className="absolute inset-0 flex items-center
                           px-5 pt-[max(104px,calc(env(safe-area-inset-top,0px)+88px))]
                           pb-[max(96px,calc(env(safe-area-inset-bottom,0px)+80px))] sm:px-8"
              >
                {/* One container at the app's own width, so the page has the
                    same margins as every screen behind the front door. The
                    type takes the left column; the right is left empty for the
                    drawing to occupy. */}
                <div className="mx-auto grid w-full max-w-[1240px] gap-10 lg:grid-cols-2 lg:gap-16">
                  <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
                    <Copy panel={panel} first={i === 0} action={action} />
                  </div>
                </div>
              </section>
            ))}
          </main>

          {/* The anchors the header's section links jump to. They are the only
              things inside the track, because the track's whole job is height:
              scrolling to one of these lands the scrub on that panel. */}
          <div className="relative z-[1] h-[560vh] min-h-[3200px]">
            {PANELS.map((panel) => (
              <span
                key={panel.id}
                id={panel.id}
                aria-hidden
                className="absolute left-0 h-px w-px"
                style={{ top: `${panel.anchor * 100}%` }}
              />
            ))}
          </div>
        </>
      )}

      <Foot pinned={!still} />
    </div>
  )
}

type Action = { to: string; label: string }

function Chrome({ mono, onMono, action }: { mono: boolean; onMono: () => void; action: Action }) {
  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3
                 bg-gradient-to-b from-bg via-bg/80 to-transparent
                 px-4 pb-4 pt-[max(14px,calc(env(safe-area-inset-top,0px)+12px))] sm:px-8"
    >
      <Brand size="sm" to="/" />
      <nav className="flex shrink-0 items-center gap-3 sm:gap-5">
        {/* Says what it will do, not what is on. A switch labelled with its own
            current state is read as a label by half the people who see it. */}
        <button
          type="button"
          onClick={onMono}
          aria-pressed={mono}
          className="hidden h-9 items-center rounded-lg border border-border px-3 text-[13px]
                     text-text-muted transition-colors duration-150
                     hover:border-border-strong hover:text-text sm:inline-flex"
        >
          {mono ? 'Colour' : 'Black and white'}
        </button>
        <Link
          to={action.to}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-5 text-[14.5px]
                     font-medium text-brand-contrast no-underline transition-transform duration-200
                     hover:-translate-y-0.5"
        >
          {action.label}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </nav>
    </header>
  )
}

function Copy({ panel, first, action }: { panel: typeof PANELS[number]; first: boolean; action: Action }) {
  const Heading = first ? 'h1' : 'h2'
  return (
    <>
      <p className="label-caps text-text-subtle">{panel.eyebrow}</p>
      <Heading className="mt-4 max-w-[13ch] font-display text-display font-medium leading-[0.98] tracking-[-0.03em] lg:text-display-lg">
        {panel.title}
      </Heading>
      <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-text-muted sm:hidden">
        {panel.short}
      </p>
      <p className="mt-5 hidden max-w-[46ch] text-lg leading-relaxed text-text-muted sm:block">
        {panel.body}
      </p>

      {/* The detail. Three panels of one sentence each read as a placeholder
          however true the sentences are, and every figure here is read from
          the sample data or the schools list rather than typed. */}
      <dl className="mt-6 flex w-full max-w-[46ch] flex-col divide-y divide-border border-y border-border sm:mt-8">
        {panel.facts.map((f) => (
          <div key={f.note} className="flex items-baseline gap-3 py-2 text-left sm:gap-4 sm:py-3">
            <dt className="w-[5.5rem] shrink-0 font-display text-[13.5px] font-medium leading-snug tracking-tight text-text sm:w-[6.5rem] sm:text-[15px]">
              {f.figure}
            </dt>
            <dd className="text-[12.5px] leading-snug text-text-muted sm:text-[13.5px]">{f.note}</dd>
          </div>
        ))}
      </dl>

      <div className="pointer-events-auto mt-6 flex w-full justify-center sm:mt-8 lg:justify-start">
        {panel.action === 'join' ? (
          <Link
            to={action.to}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-[15px]
                       font-medium text-brand-contrast no-underline shadow-md
                       transition-transform duration-200 hover:-translate-y-0.5"
          >
            {action.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <Link
            to="/privacy"
            // Carries its own ground. An outline button over line art is an
            // outline among other outlines -- it read as part of the drawing.
            className="inline-flex h-12 items-center rounded-full border border-border bg-surface px-7
                       text-[15px] text-text no-underline shadow-sm transition-colors duration-150
                       hover:border-border-strong"
          >
            What it stores
          </Link>
        )}
      </div>
    </>
  )
}

/**
 * The no-motion page: an ordinary document.
 *
 * The three panels are read in order with the three drawings above them, which
 * is the same argument the scrub makes and none of the mechanism. Rendering
 * this branch first and asking whether it still makes the point is the test
 * this project applies to every animation, and it does: a book, a book opening,
 * a laptop, with the three sentences underneath.
 */
function StillPage({ paletteOf, action }: { paletteOf: () => Palette; action: Action }) {
  return (
    <main className="mx-auto max-w-[1240px] px-5 pb-24 pt-32 sm:px-8">
      <Stills paletteOf={paletteOf} />
      <div className="mt-20 flex flex-col gap-20">
        {PANELS.map((panel, i) => (
          <section key={panel.id} id={panel.id} className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="label-caps text-text-subtle">{panel.eyebrow}</p>
              {i === 0 ? (
                <h1 className="mt-3 max-w-[14ch] font-display text-display font-medium leading-[1.0] tracking-[-0.03em]">
                  {panel.title}
                </h1>
              ) : (
                <h2 className="mt-3 max-w-[14ch] font-display text-display-sm font-medium leading-[1.05] tracking-[-0.02em]">
                  {panel.title}
                </h2>
              )}
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-text-muted sm:text-lg">
                {panel.body}
              </p>
            </div>
            {/* The same figures the moving page shows. A reader who asked for
                no motion is not asking for less evidence. */}
            <dl className="flex flex-col divide-y divide-border border-y border-border lg:mt-9">
              {panel.facts.map((f) => (
                <div key={f.note} className="flex items-baseline gap-4 py-3">
                  <dt className="w-[6.5rem] shrink-0 font-display text-[15px] font-medium leading-snug tracking-tight text-text">
                    {f.figure}
                  </dt>
                  <dd className="text-[13.5px] leading-snug text-text-muted">{f.note}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <Link
        to={action.to}
        className="mt-16 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-[15px]
                   font-medium text-brand-contrast no-underline"
      >
        {action.label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </main>
  )
}

function Foot({ pinned }: { pinned: boolean }) {
  return (
    <footer
      className={
        'z-40 flex flex-col items-center gap-1 px-5 pt-3 text-center'
        + ' pb-[max(14px,calc(env(safe-area-inset-bottom,0px)+10px))]'
        + (pinned
          ? ' fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg/75 to-transparent'
          : ' mt-16 border-t border-border')
      }
    >
      <p className="text-[11px] leading-relaxed text-text-subtle">
        A personal project by Anshu Arunav. Not affiliated with, endorsed by, or an official
        product of any school.
      </p>
      <p className="text-[11px] text-text-subtle">
        <Link to="/privacy" className="underline underline-offset-2 hover:text-text-muted">Privacy</Link>
        {' · '}
        <Link to="/terms" className="underline underline-offset-2 hover:text-text-muted">Terms</Link>
        {' · '}
        <Link to="/created-by" className="underline underline-offset-2 hover:text-text-muted">Who built it</Link>
      </p>
    </footer>
  )
}
