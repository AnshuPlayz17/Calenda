import { useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion, useScroll, useMotionValueEvent } from 'motion/react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { DemoPanel } from './DemoPanel'
import type { DemoKind } from './DemoPanel'

export type Chapter = {
  id: string
  Icon: LucideIcon
  eyebrow: string
  title: string
  body: string
  demo: DemoKind
}

/**
 * One pinned frame; the content inside it changes as you scroll.
 *
 * The section is as tall as the number of chapters, and the visual is sticky
 * within it, so scrolling advances the story without moving the thing you are
 * looking at. Which chapter is showing comes from scroll progress rather than
 * from an IntersectionObserver per chapter, so there is exactly one source of
 * truth and no chance of two being active at once mid-scroll.
 *
 * Under reduced motion it is not pinned at all: the chapters render as a plain
 * stacked list. Pinning is itself motion -- content that changes underneath a
 * stationary viewport is exactly what someone with vestibular sensitivity is
 * asking not to have.
 */
export function PinnedStory({ chapters }: { chapters: Chapter[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const [active, setActive] = useState(0)

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  })

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    // Split the track evenly; clamp so the last chapter holds to the end
    // rather than flicking past when progress reaches exactly 1.
    const next = Math.min(chapters.length - 1, Math.floor(v * chapters.length))
    setActive((current) => (current === next ? current : next))
  })

  /**
   * Jump straight to a chapter. A pinned section takes four screens of scroll
   * to get through, and without this the only way past chapter two is to keep
   * scrolling and hope. Chapter i is active across progress [i/n, (i+1)/n), so
   * aim for the middle of its band.
   */
  const goTo = (i: number) => {
    const el = ref.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    const track = el.offsetHeight - window.innerHeight
    window.scrollTo({
      top: top + (track * (i + 0.5)) / chapters.length,
      behavior: 'smooth',
    })
  }

  if (reduce) {
    return (
      <div className="relative z-10 bg-bg">
        {chapters.map((c) => (
          <section
            key={c.id}
            className="mx-auto grid max-w-[1120px] items-center gap-10 px-6 py-16 lg:grid-cols-2"
          >
            {/* Wrapped: ChapterText is a fragment, and its three elements
                would otherwise become three separate grid cells. */}
            <div>
              <ChapterText chapter={c} showEyebrow />
            </div>
            {/* Height comes from the content here, unlike the pinned layout:
                nothing has to line up between chapters when they are stacked. */}
            <DemoPanel kind={c.demo} />
          </section>
        ))}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="relative z-10 bg-bg"
      style={{ height: `${chapters.length * 100}svh` }}
    >
      <div className="sticky top-0 flex h-svh items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-10 px-6 lg:grid-cols-2">
          {/* Text column. Only the active chapter is readable, so screen
              readers are never handed four competing headings. */}
          <div>
            <div className="relative min-h-[280px]">
              {chapters.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={false}
                  animate={{
                    opacity: i === active ? 1 : 0,
                    y: i === active ? 0 : i < active ? -18 : 18,
                  }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  aria-hidden={i !== active}
                  className={cn(
                    'absolute inset-0 flex flex-col justify-center',
                    i !== active && 'pointer-events-none',
                  )}
                >
                  <ChapterText chapter={c} />
                </motion.div>
              ))}
            </div>

            {/* Persistent, unlike the chapters above it: what is in this
                section, how far through you are, and a way out of the pin. */}
            <nav aria-label="Sections" className="mt-9 flex flex-wrap gap-x-1 gap-y-1">
              {chapters.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={i === active ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-2 pb-2 pt-1 text-[12.5px] transition-colors duration-200',
                    i === active
                      ? 'border-brand text-text'
                      : 'border-transparent text-text-subtle hover:border-border-strong hover:text-text-muted',
                  )}
                >
                  <span className={cn('tabular text-[11px]', i === active && 'text-brand')}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {c.eyebrow}
                </button>
              ))}
            </nav>
          </div>

          {/* Visual column, in the same frame throughout. */}
          <div className="relative h-[340px] sm:h-[400px]">
            {chapters.map((c, i) => (
              <motion.div
                key={c.id}
                initial={false}
                animate={{
                  opacity: i === active ? 1 : 0,
                  scale: i === active ? 1 : 0.97,
                }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden
                className={cn('absolute inset-0', i !== active && 'pointer-events-none')}
              >
                <DemoPanel kind={c.demo} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * `showEyebrow` is off in the pinned layout: the rail underneath already names
 * every chapter and marks this one, so the pill would repeat the word directly
 * above it. The stacked reduced-motion layout has no rail, so it keeps the pill.
 */
function ChapterText({ chapter, showEyebrow = false }: { chapter: Chapter; showEyebrow?: boolean }) {
  const { Icon, eyebrow, title, body } = chapter
  return (
    <>
      {showEyebrow && (
        <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-brand-border bg-brand-subtle px-3 py-1 text-[12px] font-medium text-brand">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {eyebrow}
        </span>
      )}
      <h2 className="max-w-[16ch] font-display text-[32px] font-medium leading-[1.1] tracking-tight text-text sm:text-[42px]">
        {title}
      </h2>
      <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-text-muted">{body}</p>
    </>
  )
}
