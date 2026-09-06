import { motion, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { Bell, CalendarDays, GraduationCap, Link2 } from 'lucide-react'
import { sampleUpcoming } from '@/data/sampleEvents'
import { agendaLabel } from '@/lib/datetime'
import { useScrollScene, held } from './scrollScene'

/**
 * The calendar you land on, opened up.
 *
 * The page used to introduce itself and then, separately, start explaining. This
 * closes that gap: the card in the hero is the thing you scroll into, and what
 * you find inside it is a single row taken apart -- what one event on this
 * calendar actually holds, and everything that hangs off it.
 *
 * The zoom is a cross-dissolve between two separately rendered cards, not one
 * card scaled up. Scaling text past about 1.5x resamples every glyph and the
 * type goes soft exactly when the reader is being asked to read it; drawing the
 * large card at its true size and fading between them costs one more subtree
 * and stays sharp. The small residual scale on each is what sells it as a
 * camera move rather than a swap.
 */

const EVENT = sampleUpcoming()[0]!

export function ZoomScene() {
  const { ref, reduce, progress, height } = useScrollScene(2)

  if (reduce) {
    return (
      <section className="border-y border-border bg-surface px-5 py-20 sm:px-8" aria-labelledby="zoom-heading">
        <div className="mx-auto max-w-[1000px]">
          <Heading />
          <div className="mt-10">
            <Detail />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={ref}
      className="relative border-y border-border bg-surface"
      style={{ height }}
      aria-labelledby="zoom-heading"
    >
      <div className="sticky top-0 flex h-svh items-center overflow-hidden px-5 pb-8 pt-16 sm:px-8">
        <div className="mx-auto w-full max-w-[1000px]">
          <Frames progress={progress} />
        </div>
      </div>
    </section>
  )
}

function Heading() {
  return (
    <>
      <p className="label-caps">One row, opened</p>
      <h2
        id="zoom-heading"
        className="mt-3 max-w-[20ch] font-display text-[28px] font-medium leading-[1.12] tracking-tight sm:text-[36px]"
      >
        Every date carries the things that hang off it.
      </h2>
    </>
  )
}

function Frames({ progress }: { progress: MotionValue<number> }) {
  // The list recedes as the single row comes forward. The two overlap for a
  // fifth of the scene, which is long enough to read as one move and short
  // enough that neither is legible on top of the other.
  const [listR, listV] = held([0.08, 0.34], [1, 0])
  const [detailR, detailV] = held([0.26, 0.52], [0, 1])
  const listOpacity = useTransform(progress, listR, listV)
  const detailOpacity = useTransform(progress, detailR, detailV)

  // Small, opposed scales: the list pushes past the camera, the detail settles
  // into it. Neither exceeds 1.06, which keeps the card inside a 390px viewport
  // and well short of the point where glyphs resample visibly.
  //
  // These need their own held() pairs. held() expands a two-stop range into four
  // so the ends are held explicitly, and reusing that expanded range with a
  // two-value output leaves Motion extrapolating off the end -- which it did,
  // to a card two and a half thousand pixels wide.
  const [lsR, lsV] = held([0.08, 0.34], [1, 1.06])
  const [dsR, dsV] = held([0.26, 0.52], [0.93, 1])
  const listScale = useTransform(progress, lsR, lsV)
  const detailScale = useTransform(progress, dsR, dsV)

  const [headR, headV] = held([0.3, 0.42], [0, 1])
  const headingOpacity = useTransform(progress, headR, headV)

  return (
    <div className="relative">
      <motion.div style={{ opacity: headingOpacity }} className="mb-8">
        <Heading />
      </motion.div>

      <div className="relative min-h-[330px] sm:min-h-[380px]">
        <motion.div
          style={{ opacity: listOpacity, scale: listScale }}
          className="absolute inset-x-0 top-0 origin-center"
          aria-hidden
        >
          <Summary />
        </motion.div>

        <motion.div
          style={{ opacity: detailOpacity, scale: detailScale }}
          className="absolute inset-x-0 top-0 origin-center"
        >
          <Detail />
        </motion.div>
      </div>
    </div>
  )
}

/** What you saw a moment ago, at the size you saw it. */
function Summary() {
  const rows = sampleUpcoming().slice(0, 4)
  return (
    <div className="mx-auto max-w-[620px] overflow-hidden rounded-2xl border border-border bg-bg shadow-md">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <CalendarDays className="h-3.5 w-3.5 text-text-muted" aria-hidden />
        <span className="text-[12px] font-medium text-text-muted">Coming up</span>
      </div>
      <ul className="flex flex-col">
        {rows.map((e, i) => (
          <li
            key={e.title}
            className={
              'flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 '
              + (i === 0 ? 'bg-brand-subtle/50' : '')
            }
          >
            <span
              aria-hidden
              className="h-7 w-[3px] shrink-0 rounded-full"
              style={{ background: `var(--cat-${e.category})` }}
            />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text">{e.title}</span>
            <span className="tabular shrink-0 text-[11.5px] text-text-subtle">
              {agendaLabel(e.startDate)}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
    <div className="mx-auto max-w-[760px] overflow-hidden rounded-2xl border border-border bg-bg shadow-lg">
      <div className="flex items-start gap-4 border-b border-border p-5 sm:p-6">
        <span
          aria-hidden
          className="mt-1 h-12 w-1 shrink-0 rounded-full"
          style={{ background: `var(--cat-${EVENT.category})` }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[22px] font-medium leading-tight tracking-tight text-text sm:text-[26px]">
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

function Fact({
  Icon, term, detail,
}: {
  Icon: typeof Bell
  term: string
  detail: string
}) {
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
