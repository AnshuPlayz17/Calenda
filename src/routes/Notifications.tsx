import { motion, useReducedMotion } from 'motion/react'
import { Bell, BellOff, Clock, Mail, Smartphone, Wand2 } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useNotificationPreferences, useQueuedReminders, useUpdateCategoryPreference,
  useUpdatePreferences,
} from '@/features/notifications/queries'
import { usePushNotifications } from '@/features/notifications/usePushNotifications'
import { useCategories } from '@/features/events/queries'
import { CategoryCard } from '@/features/notifications/CategoryCard'
import { Switch } from '@/features/notifications/Switch'
import { offsetLabel } from '@/features/notifications/offsets'
import type { NotifyChannel } from '@/lib/types'
import { agendaLabel } from '@/lib/datetime'
import { cn } from '@/lib/cn'

/** ISO weekdays, Monday first, matching what the scheduler stores. */
const QUIET_DAYS: Array<{ iso: number; label: string }> = [
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
  { iso: 7, label: 'Sun' },
]

/** The timings worth offering as a one-click preset for everything at once. */
const PRESETS = [10080, 4320, 1440, 60]

export function NotificationsPage() {
  const { data, isLoading } = useNotificationPreferences()
  const { data: categories = [] } = useCategories()
  const { data: queued = [] } = useQueuedReminders()
  const updatePrefs = useUpdatePreferences()
  const updateCategory = useUpdateCategoryPreference()
  const push = usePushNotifications()
  const reduce = useReducedMotion()

  const rise = (i: number) =>
    reduce ? {} : {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
    }

  if (isLoading || !data) return <Skeleton className="h-64 w-full rounded-xl" />

  const { prefs, categories: catPrefs } = data
  const hasChannel = (c: NotifyChannel) => prefs.channels.includes(c)

  function toggleChannel(c: NotifyChannel) {
    const next = hasChannel(c)
      ? prefs.channels.filter((x) => x !== c)
      : [...prefs.channels, c]
    void updatePrefs.mutateAsync({ channels: next })
  }

  const enabledCount = catPrefs.filter((c) => c.enabled).length
  const onNow = hasChannel('web_push') || hasChannel('email')

  /** Applies one timing to every enabled category, instead of thirteen times. */
  function setAllOffsets(minutes: number) {
    for (const c of catPrefs) {
      if (!c.enabled) continue
      void updateCategory.mutateAsync({
        categoryId: c.category_id,
        patch: { offsets: [minutes] },
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <motion.header {...rise(0)}>
        <h1 className="font-display text-[30px] font-medium tracking-tight">Notifications</h1>
        <p className="mt-1.5 max-w-[56ch] text-[15px] text-text-muted">
          Choose what you're reminded about and how far ahead.
        </p>
      </motion.header>

      {/* A read of the whole setup before any of the controls. */}
      <motion.div {...rise(1)} className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Reminding you about"
          value={`${enabledCount} of ${catPrefs.length}`}
          hint="categories"
        />
        <Stat
          label="Reaching you by"
          value={onNow ? (hasChannel('web_push') ? 'Push' : 'Email') : 'Nothing'}
          hint={onNow ? 'on this device' : 'turn a channel on below'}
          tone={onNow ? undefined : 'warn'}
        />
        <Stat
          label="Queued"
          value={String(queued.length)}
          hint={queued.length === 1 ? 'reminder waiting' : 'reminders waiting'}
        />
      </motion.div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* ------------------------------------------------- channels -- */}
          <motion.div {...rise(2)}>
            <Card>
              <CardHeader title="How to reach you" />
              <div className="flex flex-col gap-2 px-5 pb-5">
                <ChannelRow
                  Icon={Smartphone}
                  title="Push notifications"
                  description={
                    push.status === 'unsupported' ? 'This browser cannot receive them.'
                    : push.status === 'unconfigured' ? 'Not set up on this deployment yet.'
                    : push.status === 'denied' ? 'Blocked in your browser settings.'
                    : 'On your phone and laptop, free.'
                  }
                  on={push.status === 'on'}
                  disabled={push.status === 'unsupported' || push.status === 'unconfigured'}
                  onToggle={() => (push.status === 'on' ? void push.disable() : void push.enable())}
                />
                <ChannelRow
                  Icon={Mail}
                  title="Email"
                  description="Needs a sending account; reminders are skipped without one."
                  on={hasChannel('email')}
                  onToggle={() => toggleChannel('email')}
                />
              </div>
            </Card>
          </motion.div>

          {/* ------------------------------------------------ categories -- */}
          <motion.div {...rise(3)}>
            <Card>
              <CardHeader title="What to remind you about" />

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-4">
                <span className="flex items-center gap-1.5 text-[12.5px] text-text-muted">
                  <Wand2 className="h-3.5 w-3.5 text-text-subtle" aria-hidden />
                  Set every one to
                </span>
                {PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAllOffsets(m)}
                    className="rounded-md border border-border px-2 py-1 text-[11.5px] text-text-muted
                               transition-colors duration-150 hover:border-border-strong hover:text-text"
                  >
                    {offsetLabel(m)} before
                  </button>
                ))}
              </div>

              <div className="grid gap-2.5 px-5 pb-5 sm:grid-cols-2">
                {categories.map((c) => {
                  const pref = catPrefs.find((p) => p.category_id === c.id)
                  return (
                    <CategoryCard
                      key={c.id}
                      category={c}
                      enabled={pref?.enabled ?? false}
                      offsets={pref?.offsets_minutes ?? []}
                      onToggle={() =>
                        void updateCategory.mutateAsync({
                          categoryId: c.id,
                          patch: { enabled: !(pref?.enabled ?? false) },
                        })}
                      onSetOffsets={(next) =>
                        void updateCategory.mutateAsync({
                          categoryId: c.id,
                          patch: { offsets: next },
                        })}
                    />
                  )
                })}
              </div>
            </Card>
          </motion.div>
        </div>

        <div className="flex flex-col gap-4">
          {/* ---------------------------------------------- quiet hours -- */}
          <motion.div {...rise(4)}>
            <Card>
              <CardHeader title="Quiet hours" />
              <div className="flex flex-col gap-3 px-5 pb-5">
                <p className="text-[12.5px] leading-relaxed text-text-muted">
                  Reminders landing in this window are held until it ends, rather than dropped.
                </p>

                <div className="flex items-end gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="label-caps">From</span>
                    <input
                      type="time"
                      value={prefs.quiet_start ?? ''}
                      onChange={(e) =>
                        void updatePrefs.mutateAsync({ quiet_start: e.target.value || null })}
                      className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text"
                    />
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="label-caps">Until</span>
                    <input
                      type="time"
                      value={prefs.quiet_end ?? ''}
                      onChange={(e) =>
                        void updatePrefs.mutateAsync({ quiet_end: e.target.value || null })}
                      className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text"
                    />
                  </label>
                </div>

                {(prefs.quiet_start || prefs.quiet_end) && (
                  <>
                    <div>
                      <p className="label-caps mb-1.5">On these days</p>
                      <div className="flex flex-wrap gap-1">
                        {QUIET_DAYS.map(({ iso, label }) => {
                          const everyDay = (prefs.quiet_days ?? []).length === 0
                          const on = everyDay || (prefs.quiet_days ?? []).includes(iso)
                          return (
                            <button
                              key={iso}
                              type="button"
                              aria-pressed={on}
                              onClick={() => {
                                const current = everyDay
                                  ? QUIET_DAYS.map((d) => d.iso)
                                  : [...(prefs.quiet_days ?? [])]
                                const next = on
                                  ? current.filter((d) => d !== iso)
                                  : [...current, iso].sort((a, b) => a - b)
                                // Turning the last day off would mean "every
                                // day" again, the opposite of what was asked,
                                // so clearing the window is the honest result.
                                void updatePrefs.mutateAsync(
                                  next.length === 0
                                    ? { quiet_start: null, quiet_end: null, quiet_days: [] }
                                    : { quiet_days: next.length === 7 ? [] : next },
                                )
                              }}
                              className={cn(
                                'h-7 w-9 rounded-md border text-[11.5px] transition-colors duration-150',
                                on
                                  ? 'border-brand bg-brand-subtle font-medium text-brand'
                                  : 'border-border text-text-subtle hover:border-border-strong hover:text-text',
                              )}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      <p className="mt-1.5 text-[11.5px] text-text-subtle">
                        {(prefs.quiet_days ?? []).length === 0
                          ? 'Every day.'
                          : 'Other days are unaffected.'}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => void updatePrefs.mutateAsync({
                        quiet_start: null, quiet_end: null, quiet_days: [],
                      })}
                    >
                      Turn quiet hours off
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </motion.div>

          {/* ------------------------------------------------ coming up -- */}
          <motion.div {...rise(5)}>
            <Card>
              <CardHeader title="Coming up" />
              {queued.length === 0 ? (
                <EmptyState
                  icon={Bell}
                  title="Nothing scheduled"
                  description="Reminders appear here once something is coming up in a category you've turned on."
                  size="compact"
                />
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5 px-5 pb-3">
                    {queued.slice(0, 6).map((r) => (
                      <li
                        key={r.id}
                        className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2"
                      >
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-subtle" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-[12.5px] leading-snug text-text">
                            {r.subject_title ?? 'Reminder'}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-text-muted">
                            {offsetLabel(r.offset_minutes)} before ·{' '}
                            {r.channel === 'web_push' ? 'push' : r.channel}
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-[11px] text-text-subtle">
                          {agendaLabel(r.scheduled_for.slice(0, 10) as `${number}-${number}-${number}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {queued.length > 6 && (
                    <p className="px-5 pb-5 text-[12px] text-text-subtle">
                      and {queued.length - 6} more
                    </p>
                  )}
                </>
              )}
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function Stat({
  label, value, hint, tone,
}: {
  label: string
  value: string
  hint: string
  tone?: 'warn'
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <p className="label-caps">{label}</p>
      <p
        className={cn(
          'mt-1 text-[20px] font-medium leading-none tracking-tight',
          tone === 'warn' ? 'text-warning' : 'text-text',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[12px] text-text-muted">{hint}</p>
    </div>
  )
}

function ChannelRow({
  Icon, title, description, on, disabled, onToggle,
}: {
  Icon: typeof Mail
  title: string
  description: string
  on: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3">
      <span
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
          on ? 'bg-brand-subtle text-brand' : 'bg-surface-2 text-text-subtle',
        )}
      >
        {disabled ? <BellOff className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-text">{title}</span>
        <span className="mt-0.5 block text-[12px] text-text-muted">{description}</span>
      </span>
      <Switch on={on} label={title} disabled={disabled} onToggle={onToggle} />
    </div>
  )
}
