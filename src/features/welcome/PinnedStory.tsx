import { useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion, useScroll, useTransform, useMotionValueEvent } from 'motion/react'
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

  const progress = useTransform(scrollYProgress, [0, 1], ['0%', '100%'])

  if (reduce) {
    return (
      <div className="relative z-10 bg-bg">
        {chapters.map((c) => (
          <section
            key={c.id}
            className="mx-auto grid max-w-[1120px] items-center gap-10 px-6 py-16 lg:grid-cols-2"
          >
            <ChapterText chapter={c} />
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
          {/* Text column. Only the active chapter is mounted, so screen
              readers are never handed five competing headings. */}
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

        {/* Where you are in the story. Five dots would be decoration; a filling
            line says how much is left. */}
        <div className="absolute bottom-8 left-1/2 h-[3px] w-[132px] -translate-x-1/2 overflow-hidden rounded-full bg-surface-3">
          <motion.div className="h-full rounded-full bg-brand" style={{ width: progress }} />
        </div>
      </div>
    </div>
  )
}

function ChapterText({ chapter }: { chapter: Chapter }) {
  const { Icon, eyebrow, title, body } = chapter
  return (
    <>
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-border bg-brand-subtle px-3 py-1 text-[12px] font-medium text-brand">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {eyebrow}
      </span>
      <h2 className="mt-5 max-w-[16ch] font-display text-[32px] font-medium leading-[1.1] tracking-tight text-text sm:text-[42px]">
        {title}
      </h2>
      <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-text-muted">{body}</p>
    </>
  )
}
