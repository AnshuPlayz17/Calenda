import type { EventStatus } from '@/lib/types'

const STYLES: Record<EventStatus, { label: string; fg: string; bg: string; border: string }> = {
  pending:  { label: 'Pending',  fg: 'var(--warning)', bg: 'var(--warning-subtle)', border: 'var(--warning-border)' },
  approved: { label: 'Approved', fg: 'var(--success)', bg: 'var(--success-subtle)', border: 'var(--success-border)' },
  rejected: { label: 'Declined', fg: 'var(--danger)',  bg: 'var(--danger-subtle)',  border: 'var(--danger-border)' },
  draft:    { label: 'Draft',    fg: 'var(--text-muted)', bg: 'var(--surface-2)',   border: 'var(--border)' },
}

/** Status is carried by colour AND word, so it never depends on colour alone. */
export function StatusBadge({ status }: { status: EventStatus }) {
  const s = STYLES[status]
  return (
    <span
      className="inline-flex h-[19px] shrink-0 items-center rounded-full border px-2 text-[10.5px] font-medium uppercase tracking-wide"
      style={{ color: s.fg, background: s.bg, borderColor: s.border }}
    >
      {s.label}
    </span>
  )
}
