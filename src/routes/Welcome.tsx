import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import {
  ArrowDown, CalendarDays, ClipboardList, NotebookPen, Bell, Users, Check,
} from 'lucide-react'
import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/lib/auth'
import { usePreview } from '@/lib/preview'
import { PinnedStory } from '@/features/welcome/PinnedStory'
import type { Chapter } from '@/features/welcome/PinnedStory'

const CHAPTERS: Chapter[] = [
  {
    id: 'calendar',
    Icon: CalendarDays,
    eyebrow: 'The calendar',
    title: 'Every school date, already in.',
    body: 'PA days, exams, assemblies and breaks came out of the school PDF and are '
      + 'on your calendar from the moment you sign in. You never type them.',
    demo: 'calendar',
  },
  {
    id: 'classes',
    Icon: NotebookPen,
    eyebrow: 'Your classes',
    title: 'A workspace for each subject.',
    body: 'Notes, assignments and tasks live inside the class they belong to, '
      + 'instead of one long list you have to sort in your head.',
    demo: 'classes',
  },
  {
    id: 'assignments',
    Icon: ClipboardList,
    eyebrow: 'Deadlines',
    title: 'Add a due date, see it on the calendar.',
    body: 'An assignment is not copied onto your calendar — it appears there because '
      + 'it is due. Change the date once and both agree.',
    demo: 'assignments',
  },
  {
    id: 'reminders',
    Icon: Bell,
    eyebrow: 'Reminders',
    title: 'Told before it matters.',
    body: 'Choose how far ahead each kind of thing warns you, and set quiet hours '
      + 'for the days you actually want them.',
    demo: 'reminders',
  },
  {
    id: 'parents',
    Icon: Users,
    eyebrow: 'Parents',
    title: 'Share only what you choose.',
    body: 'Connecting a parent shows them nothing by itself. Each class and event '
      + 'is shared deliberately, and you can stop at any time.',
    demo: 'parents',
  },
]

export function Welcome() {
  const { session, profile } = useAuth()
  const preview = usePreview()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const heroRef = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.94])

  // The title sequence plays once on arrival. It is an animation, not a video:
  // nothing to host, nothing to download, and it respects reduced motion.
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), reduce ? 0 : 900)
    return () => clearTimeout(t)
  }, [reduce])

  if (!session && !preview.active) return <Navigate to="/sign-in" replace />

  const firstName = profile?.full_name?.split(' ')[0]

  return (
    <div className="bg-bg">
      {/* ---------------------------------------------------------- title -- */}
      <motion.section
        ref={heroRef}
        style={reduce ? undefined : { opacity: heroOpacity, scale: heroScale }}
        className="sticky top-0 flex min-h-[86dvh] flex-col items-center justify-center px-6 text-center"
      >
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <Brand size="lg" showSchool={false} />
        </motion.div>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 max-w-[18ch] font-display text-[40px] font-medium leading-[1.08] tracking-tight text-text sm:text-[60px]"
        >
          Welcome to Calenda{firstName ? `, ${firstName}` : ''}.
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-text-muted"
        >
          Your account is ready. Here's what it does — scroll through, it takes a minute.
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: started ? 1 : 0 }}
          transition={{ duration: 0.6 }}
          className="mt-12 flex flex-col items-center gap-2"
        >
          <span className="label-caps">Scroll</span>
          <motion.span
            animate={reduce ? undefined : { y: [0, 7, 0] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
            className="text-text-subtle"
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
          </motion.span>
        </motion.div>
      </motion.section>

      {/* ------------------------------------------------------- chapters -- */}
      <PinnedStory chapters={CHAPTERS} />

      {/* ------------------------------------------------------------ end -- */}
      <section className="relative z-10 flex min-h-[70dvh] flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-subtle text-brand">
          <Check className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="max-w-[20ch] font-display text-[32px] font-medium leading-tight tracking-tight text-text sm:text-[42px]">
          That's the whole thing.
        </h2>
        <p className="max-w-[48ch] text-[15px] leading-relaxed text-text-muted">
          Start by adding your classes — everything else hangs off them. You can come
          back to this walkthrough any time from Settings.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="lg" onClick={() => navigate('/classes')}>
            Add my classes
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate('/dashboard')}>
            Go to the dashboard
          </Button>
        </div>
      </section>
    </div>
  )
}
