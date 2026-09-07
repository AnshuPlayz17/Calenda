import { Link } from 'react-router-dom'
import { motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { ArrowRight, Bell, CheckCircle2, GraduationCap, Link2 } from 'lucide-react'
import { sampleUpcoming } from '@/data/sampleEvents'
import { agendaLabel } from '@/lib/datetime'
import { HeroStack } from './HeroStack'
import { useScrollScene, held, paced, useRoomy } from './scrollScene'

/**
 * The first screen, and the one you scroll into.
 *
 * These were two chapters. The hero sat still while the page moved out from
 * under it, and then a separate section faded a card in and opened it -- which
 * meant the card you were shown in the hero and the card being opened were two
 * different objects that happened to look alike, and the reader had to take the
 * connection on trust.
 *
 * They are one move now. The copy falls back, the card travels from the right
 * column into the middle of the window and grows to fill it, and the thing it
 * opens into is the row you were already looking at. Scrolling stops meaning
 * "the next section arrives from below" and starts meaning "go further in",
 * which is the whole difference between a page of sections and a page you
 * travel through.
 *
 * The card layer is the size of the frame, so a percentage translate on it is a
 * percentage of the *frame* -- which is the one case where CSS's "percentage of
 * the element's own size" rule works in our favour, and it means the travel
 * needs no measurement and no resize handling at all.
 */

const EVENT = sampleUpcoming()[0]!
const HEADLINE = ['Everything you', 'need for school,', 'in one place.']

/** Where the card sits before the camera starts moving. */
const START_WIDE = { x: '24%', y: '0%', scale: 0.72 }
const START_NARROW = { x: '0%', y: '26%', scale: 0.62 }

export function OpeningScene({ signedIn }: { signedIn: boolean }) {
  const { ref, reduce, progress, height } = useScrollScene(paced(6))
  const roomy = useRoomy()
  const start = roomy ? START_WIDE : START_NARROW

  // The copy retreats. It does not slide up and away -- it falls back, which is
  // what the camera moving forward past it looks like.
  const [cfR, cfV] = held([0.08, 0.26], [1, 0])
  const [cyR, cyV] = held([0, 0.3], [0, -70])
  const [csR, csV] = held([0, 0.3], [1, 0.93])
  const copyOpacity = useTransform(progress, cfR, cfV)
  const copyY = useTransform(progress, cyR, cyV)
  const copyScale = useTransform(progress, csR, csV)

  // The card's travel to the middle.
  const [cxR, cxV] = held([0.06, 0.34], [start.x, '0%'])
  // Three stops, not two. The card centres, and then drops a little as the
  // day's heading arrives above it -- the heading is two lines at display size
  // and it landed behind the card when the space was not made for it. Moving
  // the card rather than putting the heading in flow keeps it a transform:
  // in flow, the heading appearing would shove the card down a frame at a time.
  const [ctyR, ctyV] = held([0.06, 0.34, 0.5], [start.y, '0%', '8%'])
  const [cscR, cscV] = held([0.06, 0.34], [start.scale, 1])
  const cardX = useTransform(progress, cxR, cxV)
  const cardY = useTransform(progress, ctyR, ctyV)
  const cardScale = useTransform(progress, cscR, cscV)

  // And then it opens. Two separately drawn cards cross-fading, not one card
  // scaled: past about 1.5x every glyph resamples and the type goes soft
  // exactly where the reader is being asked to read it.
  const [soR, soV] = held([0.4, 0.56], [1, 0])
  const [doR, doV] = held([0.5, 0.66], [0, 1])
  const summaryOpacity = useTransform(progress, soR, soV)
  const detailOpacity = useTransform(progress, doR, doV)

  const [hR, hV] = held([0.46, 0.6], [0, 1])
  const dayHeading = useTransform(progress, hR, hV)

  // The hand-off. The whole chapter pushes past the camera and the next one
  // grows in behind it, so the boundary is a continuation rather than a cut.
  const [exR, exV] = held([0.9, 1], [1, 1.16])
  const [efR, efV] = held([0.93, 1], [1, 0])
  const exitScale = useTransform(progress, exR, exV)
  const exitOpacity = useTransform(progress, efR, efV)

  if (reduce) return <StaticOpening signedIn={signedIn} />

  return (
    <section ref={ref} className="relative z-10" style={{ height }}>
      {/* The companion rail jumps to chapters by id, and this chapter has two
          stops in it. The marker sits where the card has finished centring. */}
      <span id="glance" aria-hidden className="absolute left-0 top-[38%] block h-px w-px" />

      <div className="sticky top-0 h-svh overflow-hidden">
        <motion.div style={{ scale: exitScale, opacity: exitOpacity }} className="relative h-full origin-center">
          {/* The copy, in the left half on a wide window and the whole of a
              narrow one. */}
          <motion.div
            style={{ y: copyY, scale: copyScale, opacity: copyOpacity }}
            className="absolute inset-y-0 left-0 flex w-full origin-top items-center px-5 pt-16 sm:px-8 lg:w-[54%] lg:pl-[max(2rem,calc((100vw-1240px)/2))]"
          >
            <div className="w-full lg:max-w-[36rem]">
              <p className="label-caps text-accent">For students and parents</p>

              <h1
                aria-label={HEADLINE.join(' ')}
                className="mt-5 font-display text-display font-medium leading-[0.98] tracking-[-0.025em] lg:text-display-lg"
              >
                {HEADLINE.map((line, i) => (
                  <span key={line} className="block overflow-hidden pb-[0.09em]">
                    <motion.span
                      className="block"
                      initial={{ y: '110%' }}
                      animate={{ y: '0%' }}
                      transition={{ duration: 0.95, delay: 0.05 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {line}
                    </motion.span>
                  </span>
                ))}
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="mt-5 max-w-[42ch] text-base leading-relaxed text-text-muted sm:text-lg"
              >
                PA days, exams and assemblies. Your own calendar. Google Calendar. Class
                notes, assignments and deadlines. Calenda holds all of it, and tells you
                what actually matters today.
              </motion.p>

              <Actions signedIn={signedIn} />
            </div>
          </motion.div>

          {/* The card. Its layer is the size of the frame, so the percentages
              above move it across the frame rather than across itself. */}
          <motion.div
            style={{ x: cardX, y: cardY, scale: cardScale }}
            className="absolute inset-0 grid origin-center place-items-center px-5 pt-16 sm:px-8"
          >
            <div className="relative w-full max-w-[760px]">
              <motion.div style={{ opacity: dayHeading }} className="absolute inset-x-0 -top-[10.5rem] text-center">
                <p className="label-caps text-accent">One row, opened</p>
                <h2 className="mx-auto mt-2.5 max-w-[26ch] font-display text-title font-medium leading-[1.06] tracking-tight sm:text-display-sm">
                  Every date carries the things that hang off it.
                </h2>
              </motion.div>

              <motion.div style={{ opacity: summaryOpacity }} className="origin-center">
                <HeroStack />
              </motion.div>

              <motion.div style={{ opacity: detailOpacity }} className="absolute inset-x-0 top-0 origin-center">
                <Detail />
              </motion.div>
            </div>
          </motion.div>

          <ScrollCue progress={progress} />
        </motion.div>
      </div>
    </section>
  )
}

function Actions({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="mt-8 flex flex-wrap items-center gap-3"
      >
        {/* Someone reading this from inside the app has already done both of
            these; the only useful button is the way back. */}
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
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
        className="mt-7 flex flex-col gap-2.5"
      >
        {[
          'Free, with nothing to install',
          'Works on your phone and laptop',
          'Your notes stay private',
        ].map((line, i) => (
          <li key={line} className="flex items-center gap-2 text-[15px] text-text-muted">
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
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
    </>
  )
}

/** Says there is more, and gets out of the way before anyone needs it gone. */
function ScrollCue({ progress }: { progress: MotionValue<number> }) {
  const [r, v] = held([0, 0.06], [1, 0])
  const opacity = useTransform(progress, r, v)

  return (
    <motion.div
      style={{ opacity }}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-10 hidden justify-center gap-3 lg:flex"
    >
      <span className="label-caps text-accent">Scroll in</span>
      <span className="mt-[0.4em] block h-px w-16 bg-accent-border" />
    </motion.div>
  )
}

/**
 * The same row at reading size, with what it is attached to.
 *
 * Every line here is a real relationship in the data model rather than an
 * illustration: the category drives the reminder timings, the assignment owns
 * the event so editing either moves both, and the class is where the note about
 * it lives.
 */
function Detail() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg shadow-lg">
      <div className="flex items-start gap-4 border-b border-border p-5 sm:p-6">
        <span
          aria-hidden
          className="mt-1 h-12 w-1 shrink-0 rounded-full"
          style={{ background: `var(--cat-${EVENT.category})` }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-title-sm font-medium leading-[1.12] tracking-tight text-text sm:text-title">
            {EVENT.title}
          </p>
          <p className="tabular mt-1.5 text-[13px] text-text-muted">
            {agendaLabel(EVENT.startDate)} · {EVENT.description}
          </p>
        </div>
        <span
          className="label-caps shrink-0 rounded-full px-2.5 py-1"
          style={{
            background: `color-mix(in oklab, var(--cat-${EVENT.category}) 12%, var(--surface))`,
            color: `var(--cat-${EVENT.category})`,
          }}
        >
          Exam
        </span>
      </div>

      <dl className="grid gap-px bg-border sm:grid-cols-3">
        <Fact
          Icon={GraduationCap}
          term="The class it belongs to"
          detail="Biology — its notes, tasks and other deadlines are in the same workspace."
        />
        <Fact
          Icon={Link2}
          term="The assignment behind it"
          detail="The event exists because something is due. Change either date and both move."
        />
        <Fact
          Icon={Bell}
          term="When you hear about it"
          detail="Exams warn a week and a day ahead — your setting, per category, not per event."
        />
      </dl>
    </div>
  )
}

function Fact({ Icon, term, detail }: { Icon: typeof Bell; term: string; detail: string }) {
  return (
    <div className="bg-bg p-5">
      <dt className="flex items-center gap-2 text-[12.5px] font-medium text-text">
        <Icon className="h-3.5 w-3.5 shrink-0 text-text-subtle" aria-hidden />
        {term}
      </dt>
      <dd className="mt-2 text-[13px] leading-relaxed text-text-muted">{detail}</dd>
    </div>
  )
}

/**
 * Reduced motion gets both halves, stacked, with none of the travel.
 *
 * The camera move is a way of saying that the card in the hero and the card
 * being opened are the same object. Putting them one above the other says it
 * too, and says it without moving anything.
 */
function StaticOpening({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative z-10 px-5 py-16 sm:px-8">
      <div className="mx-auto w-full max-w-[1240px]">
        <p className="label-caps text-accent">For students and parents</p>
        <h1 className="mt-5 font-display text-display font-medium leading-[0.98] tracking-[-0.025em] lg:text-display-lg">
          {HEADLINE.join(' ')}
        </h1>
        <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-text-muted">
          PA days, exams and assemblies. Your own calendar. Google Calendar. Class notes,
          assignments and deadlines. Calenda holds all of it, and tells you what actually
          matters today.
        </p>
        <Actions signedIn={signedIn} />

        <div className="mt-16 max-w-[620px]">
          <HeroStack />
        </div>

        <div className="mt-16">
          <p className="label-caps text-accent">One row, opened</p>
          <h2 className="mt-2.5 max-w-[24ch] font-display text-title font-medium leading-[1.06] tracking-tight sm:text-display-sm">
            Every date carries the things that hang off it.
          </h2>
          <div className="mt-8 max-w-[760px]">
            <Detail />
          </div>
        </div>
      </div>
    </section>
  )
}
