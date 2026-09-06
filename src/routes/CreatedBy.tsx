import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Reveal } from '@/components/Reveal'
import { CountUp } from '@/features/landing/CountUp'

/**
 * Who built this, and what it took.
 *
 * Every figure here was counted from the repository rather than estimated, and
 * every problem described is one the code actually solves -- the page would be
 * worth less if any of it were rounded up. The disclaimer at the foot is not
 * boilerplate either: this is a personal project, and a page about its author
 * is exactly where the distinction from an official school product matters
 * most.
 */

const NUMBERS = [
  { value: 27, label: 'database tables' },
  { value: 54, label: 'row-level security policies' },
  { value: 117, label: 'automated tests' },
  { value: 13421, label: 'lines of TypeScript' },
]

const PROBLEMS = [
  {
    n: '01',
    title: 'Sixteen dates that look identical',
    body: `The school's calendar contains the words “Late Start” sixteen times — byte for
           byte the same string, on sixteen different days. Matching on the title keeps one
           and loses fifteen. Matching on the date breaks Winter Break, which is one holiday
           filed as two entries. The identity key is both together, and even then the app
           shows you the pair and asks rather than merging anything on your behalf.`,
  },
  {
    n: '02',
    title: 'A PDF that lies quietly',
    body: `The source document stores some punctuation as private-use glyphs — the en dash in
           “January 1–3” among them. Strip it and you get “January 13”: a valid date, on the
           wrong day, turning a three-day break into one. It parses cleanly, which is what
           makes it dangerous. The extractor repairs those glyphs first and then refuses to
           finish if a single one survives into a parsed date, because a loud failure is
           worth more than a quiet corruption.`,
  },
  {
    n: '03',
    title: 'A reminder that must never arrive twice',
    body: `Two schedulers run on purpose — one in the database, one in CI — because either can
           stop without warning. Redundancy usually means duplicates. Here it cannot: a unique
           constraint means the second identical reminder is refused by the database itself,
           not merely unlikely to be written. The dispatcher claims each row under a lock, so
           two workers racing cannot both send it.`,
  },
]

const PRINCIPLES = [
  {
    title: 'Free to run, honestly',
    body: `Every part of it sits inside a free tier — hosting, database, authentication, push
           notifications. Where something could not be free, it was not faked: SMS ships as a
           dormant adapter with the consent columns already in place, and the page never
           claims it sends one.`,
  },
  {
    title: 'Permission is enforced, not promised',
    body: `Fifty-four policies in the database decide who can read what, so the rules hold for
           a request the interface never meant to make. Six tests do the opposite of checking
           that it works: they sign in as the wrong person, try to reach somebody else's data,
           and require it to fail.`,
  },
  {
    title: 'Nothing is silently deleted',
    body: `Duplicate detection surfaces a decision rather than making one. An import stages the
           whole batch for review before a single row lands. The word “merge” never happens
           without both versions in front of you.`,
  },
]

export function CreatedBy() {
  const reduce = useReducedMotion()

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1000px] items-center justify-between px-5 sm:px-8">
          <Brand size="sm" to="/" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3.5 text-[13.5px] font-medium text-text no-underline transition-colors duration-150 hover:bg-surface-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back
            </Link>
          </div>
        </div>
      </header>

      <section className="px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-24">
        <div className="mx-auto max-w-[1000px]">
          <p className="label-caps">Created by</p>
          <h1 className="mt-4 font-display text-[46px] font-medium leading-[1.02] tracking-tight sm:text-[76px]">
            {['Anshu', 'Arunav'].map((word, i) => (
              <span key={word} className="block overflow-hidden pb-[0.06em] sm:inline sm:pb-0">
                <motion.span
                  className="block sm:inline-block"
                  initial={reduce ? false : { y: '108%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.9, delay: 0.05 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
                >
                  {word}
                  {i === 0 && <span className="hidden sm:inline">&nbsp;</span>}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-[58ch] text-[17px] leading-relaxed text-text-muted sm:text-[19px]"
          >
            A student at University of Toronto Schools, who wanted the school year to stop
            living in four places at once — and then built the thing that fixes it, end to
            end, alone.
          </motion.p>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-[58ch] text-[15px] leading-relaxed text-text-muted"
          >
            Not a prototype and not a class project. A working application with a real
            database behind it, real authentication, notifications that reach a phone, and a
            test suite that tries to break into it on every change.
          </motion.p>
        </div>
      </section>

      <section className="border-y border-border bg-surface px-5 py-14 sm:px-8">
        <div className="mx-auto grid max-w-[1000px] gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {NUMBERS.map((n, i) => (
            <Reveal key={n.label} delay={i * 0.07}>
              <p className="font-display text-[40px] font-medium leading-none tracking-tight text-text sm:text-[48px]">
                <CountUp to={n.value} />
              </p>
              <p className="mt-2 text-[13.5px] leading-snug text-text-muted">{n.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[1000px]">
          <Reveal>
            <p className="label-caps">The hard parts</p>
            <h2 className="mt-3 max-w-[24ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[38px]">
              Three problems that had to be solved properly.
            </h2>
            <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-text-muted">
              Each of these is the kind of thing that is easy to get almost right, and almost
              right is how calendars quietly lose a day.
            </p>
          </Reveal>

          <div className="mt-12 flex flex-col gap-px overflow-hidden rounded-2xl border border-border bg-border">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.n} delay={i * 0.06}>
                <div className="grid gap-4 bg-surface p-6 sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-9">
                  <p className="label-caps tabular sm:pt-1">{p.n}</p>
                  <div>
                    <h3 className="max-w-[26ch] font-display text-[21px] font-medium leading-snug tracking-tight text-text sm:text-[25px]">
                      {p.title}
                    </h3>
                    <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-text-muted">
                      {p.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-surface px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[1000px]">
          <Reveal>
            <p className="label-caps">How it was built</p>
            <h2 className="mt-3 max-w-[22ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[38px]">
              Three rules it never broke.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.07}>
                <h3 className="text-[15.5px] font-medium text-text">{p.title}</h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-text-muted">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8">
        <Reveal className="mx-auto max-w-[1000px]">
          <div className="rounded-2xl border border-border bg-surface p-8 sm:p-12">
            <h2 className="max-w-[18ch] font-display text-[28px] font-medium leading-tight tracking-tight sm:text-[36px]">
              See what it actually does.
            </h2>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-6 text-[14.5px] font-medium text-brand-contrast no-underline transition-colors duration-150 hover:bg-brand-hover"
              >
                Back to Calenda <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-border px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-[1000px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Brand size="sm" showSchool={false} />
          <p className="max-w-[60ch] text-[12px] leading-relaxed text-text-subtle">
            A personal project by Anshu Arunav. Not affiliated with, endorsed by, or an
            official product of University of Toronto Schools.
          </p>
        </div>
      </footer>
    </div>
  )
}
