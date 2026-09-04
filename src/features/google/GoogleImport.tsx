import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, Calendar, CheckCircle2, Link2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useGoogleToken } from './useGoogleToken'
import { GoogleAuthExpired, listCalendars, listEvents, toPlainRange } from '@/lib/google'
import type { GoogleCalendar } from '@/lib/google'
import { analyseImport, buildWrites, summarise } from '@/features/import/analyse'
import type { AnalysedRow, ImportCandidate, Resolution } from '@/features/import/analyse'
import { useAllForYear, useImportEvents } from '@/features/events/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { agendaLabel } from '@/lib/datetime'
import { cn } from '@/lib/cn'

type Stage = 'connect' | 'choose' | 'review' | 'done'

const RESOLUTION_LABELS: Record<Resolution, string> = {
  add_anyway: 'Add anyway',
  keep_existing: 'Keep existing',
  merge: 'Merge',
  replace: 'Replace',
  skip: 'Skip',
}

function optionsFor(row: AnalysedRow): Resolution[] {
  if (row.verdict === 'new') return ['add_anyway', 'skip']
  if (row.matchRowKey) return ['merge', 'add_anyway', 'skip']
  return ['keep_existing', 'replace', 'add_anyway']
}

export function GoogleImport() {
  const { current } = useSchoolYear()
  const { token, checking, connect, clear } = useGoogleToken()
  const { data: existing = [] } = useAllForYear(current?.id)
  // Google events stay private to the person who imported them.
  const runImport = useImportEvents(current?.id, {
    visibility: 'private',
    source: 'google',
  })
  const reduce = useReducedMotion()

  const [stage, setStage] = useState<Stage>('connect')
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [rows, setRows] = useState<AnalysedRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState(0)

  const writes = useMemo(() => buildWrites(rows), [rows])
  const stats = useMemo(() => summarise(rows), [rows])

  function handle(err: unknown) {
    if (err instanceof GoogleAuthExpired) {
      clear()
      setStage('connect')
      setError(err.message)
      return
    }
    setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
  }

  async function loadCalendars() {
    if (!token) return
    setBusy(true); setError(null)
    try {
      const list = await listCalendars(token)
      setCalendars(list)
      // Default to the calendars Google already shows the user, rather than
      // every calendar they have ever subscribed to.
      setChosen(list.filter((c) => c.primary || c.selected).map((c) => c.id))
      setStage('choose')
    } catch (err) {
      handle(err)
    } finally {
      setBusy(false)
    }
  }

  async function fetchAndAnalyse() {
    if (!token || !current) return
    setBusy(true); setError(null)
    try {
      const candidates: ImportCandidate[] = []

      for (const id of chosen) {
        const events = await listEvents(token, id, current.starts_on, current.ends_on)
        for (const e of events) {
          const range = toPlainRange(e)
          // An event with no usable date is skipped rather than guessed at.
          if (!range || !e.summary) continue
          candidates.push({
            title: e.summary.trim(),
            description: e.description?.trim().slice(0, 500) ?? null,
            startDate: range.startDate,
            endDate: range.endDate,
            category: 'other',
          })
        }
      }

      setRows(analyseImport(candidates, existing))
      setStage('review')
    } catch (err) {
      handle(err)
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    setBusy(true); setError(null)
    try {
      const n = await runImport.mutateAsync(writes)
      setImported(n)
      setStage('done')
    } catch (err) {
      handle(err)
    } finally {
      setBusy(false)
    }
  }

  if (checking) return <Skeleton className="h-40 w-full rounded-xl" />

  if (stage === 'done') {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6" style={{ color: 'var(--success)' }} aria-hidden />
        <p className="mt-3 text-[15px] font-medium text-text">
          Imported {imported} {imported === 1 ? 'event' : 'events'} from Google
        </p>
        <p className="mt-1 text-[13px] text-text-muted">They're on your calendar now.</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => setStage('connect')}>
          Done
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert"
           className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-subtle px-3 py-2.5 text-[13px] text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {stage === 'connect' && (
        <Card className="p-6">
          <Link2 className="h-5 w-5 text-brand" aria-hidden />
          <p className="mt-3 text-[15px] font-medium text-text">Import from Google Calendar</p>
          <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-text-muted">
            Bring your Google events into Calenda so everything sits in one place. Read-only —
            Calenda never changes anything in Google, and nothing is imported until you've
            reviewed it.
          </p>
          <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-text-subtle">
            We don't store your Google credentials. Access lasts about an hour and is used only
            while you're on this page.
          </p>

          {token ? (
            <Button size="sm" className="mt-4" loading={busy} onClick={() => void loadCalendars()}>
              Choose calendars
            </Button>
          ) : (
            <Button size="sm" className="mt-4" onClick={() => void connect().catch(handle)}>
              Connect Google Calendar
            </Button>
          )}
        </Card>
      )}

      {stage === 'choose' && (
        <Card className="p-5">
          <p className="text-[14px] font-medium text-text">Which calendars?</p>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            Events between {agendaLabel(current!.starts_on)} and {agendaLabel(current!.ends_on)}.
          </p>

          <ul className="mt-4 flex flex-col gap-1">
            {calendars.map((c) => {
              const on = chosen.includes(c.id)
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setChosen((prev) =>
                          on ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                      className="h-4 w-4 rounded border-border-strong accent-[var(--brand)]"
                    />
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: c.backgroundColor ?? 'var(--cat-other)' }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">
                      {c.summary}
                    </span>
                    {c.primary && <span className="label-caps">main</span>}
                  </label>
                </li>
              )
            })}
          </ul>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setStage('connect')}>
              Back
            </Button>
            <Button size="sm" loading={busy} disabled={chosen.length === 0}
                    onClick={() => void fetchAndAnalyse()}>
              Read {chosen.length} {chosen.length === 1 ? 'calendar' : 'calendars'}
            </Button>
          </div>
        </Card>
      )}

      {stage === 'review' && (
        <>
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
            <Stat label="To import" value={writes.length} />
            <Stat label="New" value={stats.fresh} />
            <Stat label="Possible duplicates" value={stats.likely}
                  tone={stats.likely ? 'warn' : undefined} />
            <Stat label="Already there" value={stats.exact} />
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStage('choose')}>
                Back
              </Button>
              <Button size="sm" loading={busy} disabled={stats.unresolved > 0}
                      title={stats.unresolved > 0 ? 'Decide the highlighted rows first' : undefined}
                      onClick={() => void commit()}>
                Import {writes.length}
              </Button>
            </div>
          </Card>

          {rows.length === 0 && (
            <Card>
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <Calendar className="h-5 w-5 text-text-subtle" aria-hidden />
                <p className="text-sm font-medium text-text">No events in this school year</p>
                <p className="max-w-[42ch] text-[13px] text-text-muted">
                  Those calendars have nothing between{' '}
                  {agendaLabel(current!.starts_on)} and {agendaLabel(current!.ends_on)}.
                </p>
              </div>
            </Card>
          )}

          <ul className="flex flex-col gap-1.5">
            {rows.map((row, i) => {
              const needsChoice = row.resolution === null
              const other = row.matchRowKey ? rows.find((r) => r.key === row.matchRowKey) : null
              return (
                <motion.li
                  key={row.key}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i, 12) * 0.015 }}
                >
                  <Card
                    className={cn('px-4 py-3', needsChoice && 'border-l-[3px]')}
                    {...(needsChoice ? { style: { borderLeftColor: 'var(--warning)' } } : {})}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-text">{row.candidate.title}</p>
                        <p className="mt-0.5 text-[12px] text-text-muted">
                          {agendaLabel(row.candidate.startDate)}
                          {row.candidate.endDate !== row.candidate.startDate &&
                            ` – ${agendaLabel(row.candidate.endDate)}`}
                        </p>
                        {row.matchExisting && (
                          <p className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[11.5px] text-text-muted">
                            Already on your calendar:{' '}
                            <strong className="font-medium text-text">{row.matchExisting.title}</strong>
                          </p>
                        )}
                        {other && (
                          <p className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[11.5px] text-text-muted">
                            Looks like another event in this import:{' '}
                            <strong className="font-medium text-text">{other.candidate.title}</strong>
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {optionsFor(row).map((opt) => (
                          <button
                            key={opt}
                            aria-pressed={row.resolution === opt}
                            onClick={() =>
                              setRows((prev) => prev.map((r) =>
                                r.key === row.key ? { ...r, resolution: opt } : r))}
                            className={cn(
                              'h-7 rounded-full border px-2.5 text-[11.5px] transition-colors duration-150',
                              row.resolution === opt
                                ? 'border-brand bg-brand-subtle font-medium text-brand'
                                : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                            )}
                          >
                            {RESOLUTION_LABELS[opt]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Card>
                </motion.li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div>
      <p className="label-caps">{label}</p>
      <p className="tabular font-display text-[22px] font-medium leading-tight"
         style={tone === 'warn' ? { color: 'var(--warning)' } : undefined}>
        {value}
      </p>
    </div>
  )
}
