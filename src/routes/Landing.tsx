import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import {
  ArrowRight, CalendarDays, CheckCircle2, ClipboardList, GraduationCap,
  NotebookPen, ShieldCheck, Sparkles, Users,
} from 'lucide-react'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Reveal } from '@/components/Reveal'
import { useAuth } from '@/lib/auth'
import { usePreview } from '@/lib/preview'
import { schoolEvents2026_27 } from '@/data/schoolCalendar'
import { agendaLabel, todayPlain } from '@/lib/datetime'

export function Landing() {
  const { session, loading } = useAuth()
  const preview = usePreview()

  // Someone already signed in has no use for a pitch.
  if (!loading && (session || preview.active)) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-dvh bg-bg">
      <Header />
      <Hero />
      <Problem />
      <Features />
      <Privacy />
      <Closing />
      <Footer />
    </div>
  )
}

function Header() {
  const [scrolled, setScrolled] = useState(false)

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
        <Brand size="sm" />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            to="/sign-in"
            className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13.5px] font-medium text-brand-contrast no-underline transition-colors duration-150 hover:bg-brand-hover"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  const reduce = useReducedMotion()
  const { scrollY } = useScroll()
  // A small parallax on the card stack. Disabled entirely for reduced motion.
  const cardY = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -40])

  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-14 sm:px-8 sm:pb-28 sm:pt-20">
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

          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 font-display text-[40px] font-medium leading-[1.05] tracking-tight sm:text-[56px]"
          >
            Everything you need
            <br />
            for school, in one place.
          </motion.h1>

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
            <Link
              to="/sign-in"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[14.5px] font-medium text-brand-contrast no-underline transition-colors duration-150 hover:bg-brand-hover"
            >
              Get started <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <span className="text-[13px] text-text-subtle">Free. No app to install.</span>
          </motion.div>
        </div>

        <motion.div style={{ y: cardY }} className="relative">
          <UpcomingPreview />
        </motion.div>
      </div>
    </section>
  )
}

/**
 * The real 2026-27 calendar, not a mockup. Showing invented sample data on a
 * landing page for a school app would be the wrong first impression.
 */
function UpcomingPreview() {
  const reduce = useReducedMotion()
  const today = todayPlain()
  const next = schoolEvents2026_27
    .filter((e) => e.endDate >= today)
    .slice(0, 5)

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="label-caps">Coming up</span>
        <span className="label-caps">2026–27</span>
      </div>
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
    </div>
  )
}

function Problem() {
  return (
    <section className="border-y border-border bg-surface px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-[1120px]">
        <Reveal>
          <h2 className="max-w-[20ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[38px]">
            School information lives in too many places.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-3">
          {[
            {
              before: 'A PDF of important dates',
              after: 'Imported once, on your calendar all year — with duplicates caught before they land.',
            },
            {
              before: 'Google Calendar for classes',
              after: 'Brought in alongside everything else, read-only, so nothing in Google changes.',
            },
            {
              before: 'Notes and deadlines scattered',
              after: 'A workspace per class. Add an assignment and it appears on your calendar automatically.',
            },
          ].map((item, i) => (
            <Reveal key={item.before} delay={i * 0.08}>
              <p className="text-[13px] text-text-subtle line-through decoration-text-subtle/40">
                {item.before}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-text">{item.after}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  {
    Icon: CalendarDays,
    title: 'One calendar',
    body: 'School events, your own plans, Google Calendar and every assignment deadline — month, week or agenda.',
  },
  {
    Icon: GraduationCap,
    title: 'A workspace per class',
    body: 'Notes, assignments, tasks and deadlines together, filed under the class they belong to.',
  },
  {
    Icon: NotebookPen,
    title: 'Notes that keep up',
    body: 'Headings, checklists, code blocks. Saves as you write, so nothing is lost.',
  },
  {
    Icon: ClipboardList,
    title: 'Deadlines that find you',
    body: 'Add an assignment once. It shows on the dashboard, the calendar and your reminders.',
  },
  {
    Icon: Sparkles,
    title: 'Suggest school events',
    body: 'Know about a game or a club meeting? Put it forward for everyone, and follow it through review.',
  },
  {
    Icon: Users,
    title: 'Share with parents',
    body: 'Item by item, never all at once. Connecting a parent shares nothing on its own.',
  },
]

function Features() {
  return (
    <section className="px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-[1120px]">
        <Reveal>
          <p className="label-caps">What it does</p>
          <h2 className="mt-3 max-w-[24ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[38px]">
            Built for the way a school year actually works.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.08}>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-subtle text-brand">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <h3 className="mt-4 text-[15.5px] font-semibold tracking-tight">{title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-text-muted">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Privacy() {
  return (
    <section className="border-y border-border bg-surface px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto grid max-w-[1120px] items-start gap-10 lg:grid-cols-2">
        <Reveal>
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-subtle text-brand">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="mt-5 max-w-[18ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[36px]">
            Private by default, not by promise.
          </h2>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-text-muted">
            Your notes, personal events and deadlines are yours. Sharing is per item and
            reversible, and the rules are enforced by the database itself — not by hiding
            buttons.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <ul className="flex flex-col gap-3">
            {[
              'Connecting a parent shares nothing on its own.',
              'An admin can publish school events, and cannot read your private ones.',
              'Google Calendar access is read-only, and no Google credential is stored.',
              'Every rule has a test that tries to break it and must fail.',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <CheckCircle2
                  className="mt-0.5 h-[17px] w-[17px] shrink-0"
                  style={{ color: 'var(--success)' }}
                  aria-hidden
                />
                <span className="text-[14.5px] leading-relaxed text-text">{line}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}

function Closing() {
  return (
    <section className="px-5 py-24 sm:px-8 sm:py-28">
      <Reveal className="mx-auto max-w-[1120px] text-center">
        <h2 className="mx-auto max-w-[18ch] font-display text-[32px] font-medium leading-tight tracking-tight sm:text-[44px]">
          Start the year knowing what's coming.
        </h2>
        <div className="mt-8 flex justify-center">
          <Link
            to="/sign-in"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-6 text-[14.5px] font-medium text-brand-contrast no-underline transition-colors duration-150 hover:bg-brand-hover"
          >
            Open Calenda <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
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
