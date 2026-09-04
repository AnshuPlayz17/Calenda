import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Bell, BellOff, Clock, Mail, Smartphone } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { CategoryDot } from '@/components/ui/CategoryDot'
import {
  useNotificationPreferences, useQueuedReminders, useUpdateCategoryPreference,
  useUpdatePreferences,
} from '@/features/notifications/queries'
import { usePushNotifications } from '@/features/notifications/usePushNotifications'
import { useCategories } from '@/features/events/queries'
import type { NotifyChannel } from '@/lib/types'
import { cn } from '@/lib/cn'

/** The offsets worth offering. Anything finer is noise for a school calendar. */
const OFFSETS: Array<{ minutes: number; label: string }> = [
  { minutes: 10080, label: '1 week' },
  { minutes: 4320, label: '3 days' },
  { minutes: 1440, label: '1 day' },
  { minutes: 720, label: '12 hours' },
  { minutes: 180, label: '3 hours' },
  { minutes: 60, label: '1 hour' },
  { minutes: 30, label: '30 min' },
]

function offsetLabel(minutes: number): string {
  return OFFSETS.find((o) => o.minutes === minutes)?.label ?? `${minutes} min`
}

export function NotificationsPage() {
  const { data, isLoading } = useNotificationPreferences()
  const { data: categories = [] } = useCategories()
  const { data: queued = [] } = useQueuedReminders()
  const updatePrefs = useUpdatePreferences()
  const updateCategory = useUpdateCategoryPreference()
  const push = usePushNotifications()
  const reduce = useReducedMotion()
  const [expanded, setExpanded] = useState<string | null>(null)

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

  return (
    <div className="flex flex-col gap-6">
      <motion.header {...rise(0)}>
        <h1 className="font-display text-[30px] font-medium tracking-tight">Notifications</h1>
        <p className="mt-1.5 max-w-[58ch] text-[15px] text-text-muted">
          Choose what you're reminded about and how far ahead.
        </p>
      </motion.header>

      <motion.section {...rise(1)}>
        <Card>
          <CardHeader title="How to reach you" />
          <div className="flex flex-col gap-2 px-5 pb-5">
            <ChannelRow
              Icon={Mail}
              title="Email"
              description="Reminders in your inbox."
              on={hasChannel('email')}
              onToggle={() => toggleChannel('email')}
            />
            <ChannelRow
              Icon={Smartphone}
              title="Push notifications"
              description={
                push.status === 'unsupported' ? 'This browser does not support push.'
                : push.status === 'unconfigured' ? 'Not set up on this deployment yet.'
                : push.status === 'denied' ? 'Blocked in your browser settings.'
                : 'On your lock screen. Set per device, not per account.'
              }
              on={push.status === 'on'}
              disabled={['unsupported', 'unconfigured', 'denied'].includes(push.status) || push.busy}
              onToggle={() => (push.status === 'on' ? void push.disable() : void push.enable())}
            />
            {push.error && (
              <p role="alert" className="text-[12.5px] text-danger">{push.error}</p>
            )}
            <p className="mt-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-text-muted">
              <strong className="font-medium text-text">SMS isn't available.</strong> Text
              messaging isn't free for a Canadian number, and the free workarounds were shut
              down in 2025. Push reaches your phone the same way, at no cost.
            </p>
          </div>
        </Card>
      </motion.section>

      <motion.section {...rise(2)}>
        <Card>
          <CardHeader title="What to remind you about" />
          <ul className="flex flex-col gap-1 px-5 pb-5">
            {categories.map((c) => {
              const pref = catPrefs.find((p) => p.category_id === c.id)
              const enabled = pref?.enabled ?? true
              const offsets = pref?.offsets_minutes ?? [1440]
              const open = expanded === c.id

              return (
                <li key={c.id} className="rounded-lg border border-border">
                  <div className="flex items-center gap-3 px-3.5 py-2.5">
                    <CategoryDot category={c} />
                    <button
                      onClick={() => setExpanded(open ? null : c.id)}
                      className="min-w-0 flex-1 text-left"
                      aria-expanded={open}
                    >
                      <span className="block text-[13.5px] font-medium text-text">{c.name}</span>
                      <span className="mt-0.5 block text-[12px] text-text-muted">
                        {enabled
                          ? offsets.length
                            ? offsets.map(offsetLabel).join(', ') + ' before'
                            : 'No reminders set'
                          : 'Muted'}
                      </span>
                    </button>
                    <Switch
                      on={enabled}
                      label={`Remind me about ${c.name}`}
                      onToggle={() =>
                        void updateCategory.mutateAsync({
                          categoryId: c.id, patch: { enabled: !enabled },
                        })}
                    />
                  </div>

                  {open && enabled && (
                    <div className="flex flex-wrap gap-1.5 border-t border-border px-3.5 py-3">
                      {OFFSETS.map((o) => {
                        const active = offsets.includes(o.minutes)
                        return (
                          <button
                            key={o.minutes}
                            aria-pressed={active}
                            onClick={() => {
                              const next = active
                                ? offsets.filter((m) => m !== o.minutes)
                                : [...offsets, o.minutes].sort((a, b) => b - a)
                              void updateCategory.mutateAsync({
                                categoryId: c.id, patch: { offsets: next },
                              })
                            }}
                            className={cn(
                              'h-7 rounded-full border px-2.5 text-[11.5px] transition-colors duration-150',
                              active
                                ? 'border-brand bg-brand-subtle font-medium text-brand'
                                : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                            )}
                          >
                            {o.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      </motion.section>

      <motion.section {...rise(3)}>
        <Card>
          <CardHeader title="Quiet hours" />
          <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
            <p className="w-full max-w-[46ch] text-[13px] text-text-muted">
              Reminders that land in this window are held until it ends, rather than dropped.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="label-caps">From</span>
              <input
                type="time"
                value={prefs.quiet_start ?? ''}
                onChange={(e) =>
                  void updatePrefs.mutateAsync({ quiet_start: e.target.value || null })}
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-text"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label-caps">Until</span>
              <input
                type="time"
                value={prefs.quiet_end ?? ''}
                onChange={(e) =>
                  void updatePrefs.mutateAsync({ quiet_end: e.target.value || null })}
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-text"
              />
            </label>
            {(prefs.quiet_start || prefs.quiet_end) && (
              <Button variant="ghost" size="sm"
                      onClick={() => void updatePrefs.mutateAsync({
                        quiet_start: null, quiet_end: null,
                      })}>
                Clear
              </Button>
            )}
          </div>
        </Card>
      </motion.section>

      <motion.section {...rise(4)}>
        <Card>
          <CardHeader title="Coming up" />
          {queued.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No reminders scheduled"
              description="Reminders appear here once there's something upcoming in a category you've enabled."
            />
          ) : (
            <ul className="flex flex-col gap-1.5 px-5 pb-5">
              {queued.slice(0, 12).map((r) => (
                <li key={r.id}
                    className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-2.5">
                  <Clock className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-text">
                      {r.subject_title ?? 'Reminder'}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-text-muted">
                      {offsetLabel(r.offset_minutes)} before · {r.channel === 'web_push' ? 'push' : r.channel}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11.5px] tabular text-text-subtle">
                    {new Date(r.scheduled_for).toLocaleDateString('en-CA', {
                      month: 'short', day: 'numeric',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </motion.section>
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
      <span className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
        on ? 'bg-brand-subtle text-brand' : 'bg-surface-2 text-text-subtle',
      )}>
        {on ? <Icon className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-text">{title}</span>
        <span className="mt-0.5 block text-[12px] text-text-muted">{description}</span>
      </span>
      <Switch on={on} label={title} disabled={disabled} onToggle={onToggle} />
    </div>
  )
}

function Switch({
  on, label, disabled, onToggle,
}: {
  on: boolean
  label: string
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200',
        on ? 'bg-brand' : 'bg-surface-3',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      style={{ transitionTimingFunction: 'var(--ease-out)' }}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          on ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
        style={{ transitionTimingFunction: 'var(--ease-out)' }}
      />
    </button>
  )
}
