import { motion, useReducedMotion } from 'motion/react'
import { Card, CardHeader } from '@/components/ui/Card'
import { ThemeToggle } from '@/components/ThemeToggle'
import { GoogleImport } from '@/features/google/GoogleImport'
import { ParentsSection } from '@/features/parents/ParentsSection'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { useAuth } from '@/lib/auth'
import { agendaLabel } from '@/lib/datetime'

export function SettingsPage() {
  const { profile, user } = useAuth()
  const { current, years, setCurrent } = useSchoolYear()
  const reduce = useReducedMotion()

  const rise = (i: number) =>
    reduce ? {} : {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
    }

  return (
    <div className="flex flex-col gap-6">
      <motion.header {...rise(0)}>
        <h1 className="font-display text-[30px] font-medium tracking-tight">Settings</h1>
        <p className="mt-1.5 max-w-[56ch] text-[15px] text-text-muted">
          Your account, calendars and how Calenda looks.
        </p>
      </motion.header>

      <motion.section {...rise(1)}>
        <Card>
          <CardHeader title="Google Calendar" />
          <div className="px-5 pb-5">
            <GoogleImport />
          </div>
        </Card>
      </motion.section>

      <motion.section {...rise(2)}>
        <Card>
          <CardHeader title="Parents" />
          <div className="px-5 pb-5">
            <ParentsSection />
          </div>
        </Card>
      </motion.section>

      <motion.section {...rise(3)}>
        <Card>
          <CardHeader title="Appearance" />
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-5">
            <p className="text-[13.5px] text-text-muted">
              Light, dark, or follow your device.
            </p>
            <ThemeToggle />
          </div>
        </Card>
      </motion.section>

      <motion.section {...rise(4)}>
        <Card>
          <CardHeader title="School year" />
          <div className="px-5 pb-5">
            {years.length <= 1 ? (
              <p className="text-[13.5px] text-text-muted">
                {current
                  ? <>You're in <strong className="font-medium text-text">{current.label}</strong>,
                      running {agendaLabel(current.starts_on)} to {agendaLabel(current.ends_on)}.</>
                  : 'No school year set up yet.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {years.map((y) => (
                  <button
                    key={y.id}
                    onClick={() => setCurrent(y.id)}
                    aria-pressed={current?.id === y.id}
                    className={
                      current?.id === y.id
                        ? 'h-8 rounded-full border border-brand bg-brand-subtle px-3.5 text-[13px] font-medium text-brand'
                        : 'h-8 rounded-full border border-border px-3.5 text-[13px] text-text-muted hover:border-border-strong hover:text-text'
                    }
                  >
                    {y.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      </motion.section>

      <motion.section {...rise(5)}>
        <Card>
          <CardHeader title="Account" />
          <dl className="grid gap-x-8 gap-y-3 px-5 pb-5 sm:grid-cols-2">
            <div>
              <dt className="label-caps">Name</dt>
              <dd className="mt-0.5 text-[13.5px] text-text">
                {profile?.full_name ?? <span className="text-text-subtle">Not set</span>}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Email</dt>
              <dd className="mt-0.5 truncate text-[13.5px] text-text">{user?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="label-caps">Role</dt>
              <dd className="mt-0.5 text-[13.5px] capitalize text-text">
                {profile?.role ?? 'student'}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Time zone</dt>
              <dd className="mt-0.5 text-[13.5px] text-text">{profile?.timezone ?? '—'}</dd>
            </div>
          </dl>
        </Card>
      </motion.section>
    </div>
  )
}
