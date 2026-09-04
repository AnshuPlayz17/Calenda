import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, CheckCircle2, FileUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAllForYear, useClearAll, useImportEvents } from '@/features/events/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { schoolEvents2026_27 } from '@/data/schoolCalendar'
import { agendaLabel } from '@/lib/datetime'
import { spanDays } from '@/lib/events'
import { analyseImport, buildWrites, summarise } from './analyse'
import type { AnalysedRow, ImportCandidate, Resolution } from './analyse'
import { cn } from '@/lib/cn'
import { dataSource } from '@/data'

const CANDIDATES: ImportCandidate[] = schoolEvents2026_27.map((e) => ({
  title: e.title,
  description: e.description,
  startDate: e.startDate,
  endDate: e.endDate,
  category: e.category,
}))

const RESOLUTION_LABELS: Record<Resolution, string> = {
  add_anyway: 'Add anyway',
  keep_existing: 'Keep existing',
  merge: 'Merge',
  replace: 'Replace',
  skip: 'Skip',
}

/** Which choices make sense depends on what the row collided with. */
function optionsFor(row: AnalysedRow): Resolution[] {
  if (row.verdict === 'new') return ['add_anyway', 'skip']
  if (row.matchRowKey) return ['merge', 'add_anyway', 'skip']
  return ['keep_existing', 'replace', 'add_anyway']
}

export function ImportPanel() {
  const { current } = useSchoolYear()
  const { data: existing = [], isLoading } = useAllForYear(current?.id)
  const runImport = useImportEvents(current?.id)
  const clearAll = useClearAll(current?.id)
  const reduce = useReducedMotion()

  const [started, setStarted] = useState(false)
  const [rows, setRows] = useState<AnalysedRow[]>([])
  const [done, setDone] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stats = useMemo(() => summarise(rows), [rows])

  function begin() {
    setRows(analyseImport(CANDIDATES, existing))
    setStarted(true)
    setDone(null)
    setError(null)
  }

  function choose(key: string, resolution: Resolution) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, resolution } : r)))
  }

  const writes = useMemo(() => buildWrites(rows), [rows])

  async function commit() {
    setError(null)
    try {
      const n = await runImport.mutateAsync(writes)
      setDone(n)
      setStarted(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't finish the import.")
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />

  if (done !== null) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6" style={{ color: 'var(--success)' }} aria-hidden />
        <p className="mt-3 text-[15px] font-medium text-text">
          Imported {done} {done === 1 ? 'event' : 'events'}
        </p>
        <p className="mt-1 text-[13px] text-text-muted">
          They're on the shared calendar now.
        </p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => setDone(null)}>
          Done
        </Button>
      </Card>
    )
  }

  if (!started) {
    return (
      <Card className="p-6">
        <FileUp className="h-5 w-5 text-brand" aria-hidden />
        <p className="mt-3 text-[15px] font-medium text-text">
          Import the {current?.label ?? ''} school calendar
        </p>
        <p className="mt-1 max-w-[60ch] text-[13.5px] leading-relaxed text-text-muted">
          {CANDIDATES.length} dates read from the school's Important Dates PDF. Nothing is
          written until you've reviewed anything that looks like a duplicate — and nothing is
          ever merged or removed without you choosing it.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={begin}>
            Review {CANDIDATES.length} events
          </Button>

          {/* Preview only. The Supabase source has no clearAll, so this is
              never rendered against a real database. */}
          {dataSource.clearAll && existing.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              loading={clearAll.isPending}
              onClick={() => void clearAll.mutateAsync()}
            >
              Empty the calendar first
            </Button>
          )}
        </div>

        {dataSource.clearAll && existing.length > 0 && (
          <p className="mt-2 text-[12px] text-text-subtle">
            The preview already has these {existing.length} events, so importing again finds
            them all. Empty it to see what a first import looks like — including the two
            Winter Break entries that are really one break.
          </p>
        )}
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <Stat label="To import" value={stats.willImport} />
        <Stat label="New" value={stats.fresh} />
        <Stat label="Possible duplicates" value={stats.likely} tone={stats.likely ? 'warn' : undefined} />
        <Stat label="Already there" value={stats.exact} />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setStarted(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={runImport.isPending}
            disabled={stats.unresolved > 0}
            title={stats.unresolved > 0 ? 'Decide the highlighted rows first' : undefined}
            onClick={() => void commit()}
          >
            Import {writes.length}
          </Button>
        </div>
      </Card>

      {error && (
        <p role="alert"
           className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      {stats.unresolved > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border px-4 py-3 text-[13px]"
             style={{
               borderColor: 'var(--warning-border)',
               background: 'var(--warning-subtle)',
               color: 'var(--warning)',
             }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">
              {stats.unresolved} {stats.unresolved === 1 ? 'row needs' : 'rows need'} a decision.
            </strong>{' '}
            These look like something that's already here, or like another row in this batch.
            Nothing is imported until you choose.
          </span>
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {rows.map((row, i) => {
          const needsChoice = row.resolution === null
          const days = spanDays(row.candidate.startDate, row.candidate.endDate)
          const other = row.matchRowKey ? rows.find((r) => r.key === row.matchRowKey) : null

          return (
            <motion.li
              key={row.key}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.015 }}
            >
              <Card
                className={cn('px-4 py-3', needsChoice && 'border-l-[3px]')}
                {...(needsChoice ? { style: { borderLeftColor: 'var(--warning)' } } : {})}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-medium text-text">{row.candidate.title}</p>
                      {row.verdict !== 'new' && (
                        <span className="rounded-full border px-2 text-[10px] font-medium uppercase tracking-wide"
                              style={{
                                color: 'var(--warning)',
                                background: 'var(--warning-subtle)',
                                borderColor: 'var(--warning-border)',
                              }}>
                          {row.verdict === 'exact_duplicate' ? 'Already there' : 'Possible duplicate'}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-text-muted">
                      {agendaLabel(row.candidate.startDate)}
                      {days > 1 && ` – ${agendaLabel(row.candidate.endDate)} · ${days} days`}
                    </p>

                    {row.matchExisting && (
                      <p className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[11.5px] text-text-muted">
                        Matches an event already here:{' '}
                        <strong className="font-medium text-text">{row.matchExisting.title}</strong>
                        {' · '}{agendaLabel(row.matchExisting.start_date)}
                      </p>
                    )}
                    {other && (
                      <p className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[11.5px] text-text-muted">
                        Looks like another row in this import:{' '}
                        <strong className="font-medium text-text">{other.candidate.title}</strong>
                        {' · '}{agendaLabel(other.candidate.startDate)} – {agendaLabel(other.candidate.endDate)}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1">
                    {optionsFor(row).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => choose(row.key, opt)}
                        aria-pressed={row.resolution === opt}
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
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div>
      <p className="label-caps">{label}</p>
      <p
        className="tabular font-display text-[22px] font-medium leading-tight"
        style={tone === 'warn' ? { color: 'var(--warning)' } : undefined}
      >
        {value}
      </p>
    </div>
  )
}

