import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Brand } from '@/components/Brand'
import { CircuitBoard } from '@/components/motion/CircuitBoard'
import { Bell, CalendarDays, FileText, GraduationCap } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'

/**
 * The shell both sign-in and sign-up sit in.
 *
 * They were one page with a boolean, which made "create an account" a
 * second-class state of signing in -- the heading changed and nothing else
 * did. Splitting them means each can say the right thing, and a link to a
 * sign-up page is something you can send someone.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  const reduce = useReducedMotion()

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,44%)]">
      {/* Editorial panel. Hidden on small screens, where it would only push
          the actual task below the fold. */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: 'var(--blue-900)' }}
      >
        <div className="relative z-10">
          <Brand size="md" showSchool={false} to="/" className="[&_span]:text-white" />
        </div>

        <div className="relative z-10 max-w-[30ch]">
          <h1 className="font-display text-[42px] font-medium leading-[1.1] tracking-tight text-white">
            Your school, in one place.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--blue-200)' }}>
            Community events, your own calendar, class notebooks and every deadline —
            together, and organised the way you actually think about them.
          </p>
        </div>

        {/* What happens after signing in, while somebody is deciding whether to.
            Scoped tokens rather than the page's, because this panel is a fixed
            dark ground regardless of the theme around it. */}
        <div
          className="relative z-10 -mx-2 mt-8"
          style={{
            ['--border' as string]: 'rgb(255 255 255 / 0.14)',
            ['--border-strong' as string]: 'rgb(255 255 255 / 0.3)',
            ['--surface' as string]: 'var(--blue-800)',
            ['--brand' as string]: 'var(--blue-300)',
            ['--text-muted' as string]: 'var(--blue-200)',
          }}
        >
          <CircuitBoard
            width={480}
            height={190}
            pulseSpeed={2.6}
            nodes={[
              { id: 'pdf', x: 40, y: 95, label: 'School dates', icon: <FileText className="h-3 w-3" /> },
              { id: 'cls', x: 190, y: 40, label: 'Your classes', icon: <GraduationCap className="h-3 w-3" /> },
              { id: 'cal', x: 190, y: 150, label: 'Your calendar', icon: <CalendarDays className="h-3 w-3" /> },
              { id: 'you', x: 430, y: 95, label: 'A reminder', icon: <Bell className="h-3 w-3" /> },
            ]}
            connections={[
              { from: 'pdf', to: 'cls', animated: true },
              { from: 'pdf', to: 'cal', animated: true },
              { from: 'cls', to: 'you', animated: true },
              { from: 'cal', to: 'you', animated: true },
            ]}
          />
        </div>

        <p className="relative z-10 text-[12px]" style={{ color: 'var(--blue-300)' }}>
          A personal project. Not an official product of University of Toronto Schools.
        </p>

        {/* Ambient calendar grid, drawn rather than decorative imagery. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="auth-grid" width="72" height="72" patternUnits="userSpaceOnUse">
                <path d="M72 0H0V72" fill="none" stroke="#fff" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#auth-grid)" />
          </svg>
        </div>
      </aside>

      <main className="relative flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[380px]"
        >
          <div className="lg:hidden">
            <Brand size="md" to="/" />
          </div>

          <h2 className="mt-7 text-[22px] font-semibold tracking-tight text-text lg:mt-0">
            {title}
          </h2>
          <p className="mt-1.5 text-[14px] text-text-muted">{subtitle}</p>

          {children}

          {footer && <div className="mt-6 text-[13px] text-text-muted">{footer}</div>}
        </motion.div>
      </main>
    </div>
  )
}
