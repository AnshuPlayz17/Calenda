import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  AlertTriangle, Check, FileText, Upload, X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDelete } from '@/components/ui/ConfirmDelete'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Dialog } from '@/components/ui/Dialog'
import {
  useApplyReportCard, useDecodeReportCard, useDeleteReportCard, useReportCardLines,
  useReportCards, useUpdateLine, useUploadReportCard,
} from '@/features/reportCards/queries'
import { useClasses } from '@/features/classes/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import type { ReportCard, ReportCardLine } from '@/lib/types'
import { isPreview } from '@/data'
import { cn } from '@/lib/cn'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf'

/**
 * Upload a report card, have it read, agree with it line by line.
 *
 * The import pipeline again, for a second kind of document, and deliberately
 * the same shape: a document produces a proposal, a person confirms it, and
 * only then is anything written. Nothing here reaches `grades` without somebody
 * pressing accept on that exact line.
 */
export function ReportCards() {
  const reduce = useReducedMotion()
  const { current } = useSchoolYear()
  const { data: cards = [], isLoading } = useReportCards()
  const upload = useUploadReportCard()
  const decode = useDecodeReportCard()
  const remove = useDeleteReportCard()

  const fileRef = useRef<HTMLInputElement>(null)
  const [term, setTerm] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmUpload, setConfirmUpload] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    // The consent step. Reading it means sending it to a third party, and that
    // is said before it leaves rather than in a policy nobody opens.
    setConfirmUpload(file)
  }

  async function go() {
    const file = confirmUpload
    if (!file) return
    setConfirmUpload(null)
    try {
      const card = await upload.mutateAsync({ file, term: term.trim() || null })
      await decode.mutateAsync(card.id)
      setOpenId(card.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="font-display text-[30px] font-medium tracking-tight">Report cards</h1>
        <p className="mt-1 max-w-[62ch] text-[13.5px] text-text-muted">
          Upload one and Calenda reads the marks off it. Nothing is saved until you
          agree with it, line by line — and the document itself is never visible to
          a linked parent, even after you share a mark from it.
        </p>
      </motion.header>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Input
          label="Term"
          placeholder="Term 1"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="w-[160px]"
          hint="Optional. Used to label the marks."
        />
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          // sr-only is clipped, not removed, so it stays focusable -- and a
          // keyboard user was landing on an invisible, unnamed input. The
          // button beside it is the control; this is only the mechanism.
          tabIndex={-1}
          aria-label="Report card file"
          className="sr-only"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button onClick={() => fileRef.current?.click()} loading={upload.isPending}>
          <Upload className="h-4 w-4" aria-hidden /> Choose a file
        </Button>
        {/* Said before the picker opens, not after a rejection. A storage 400
            means nothing to somebody holding a phone.

            The PDF caveat is here rather than in the error, because it read
            "A photo, a screenshot or a PDF" as a flat promise and whether a
            PDF can actually be read depends on a model chosen in a server
            secret this page cannot see. Promising it and then refusing after
            the upload is the wrong order to find out. */}
        <p className="text-[12px] text-text-subtle">
          A photo or a screenshot, up to 10MB. PDFs depend on the reader
          configured for this project — if yours cannot take one, it says so and
          nothing is lost.
        </p>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle px-3.5 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No report cards yet"
            description="Upload one and the marks on it become rows you can check and keep."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {cards.map((card) => (
            <li key={card.id}>
              <CardRow
                card={card}
                onOpen={() => setOpenId(card.id)}
                onDelete={() => remove.mutateAsync(card.id)}
                deleting={remove.isPending}
              />
            </li>
          ))}
        </ul>
      )}

      {/* The disclosure. Deliberately a dialog rather than a line of small
          print: sending somebody's transcript to a third party is the single
          most consequential thing this app does on their behalf. */}
      <Dialog
        open={confirmUpload !== null}
        onClose={() => setConfirmUpload(null)}
        title="Read this report card?"
        description="To read the marks off it, the file is sent to the model provider Calenda is configured to use. It is not used to train anything, and it is not shared with anyone else."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmUpload(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void go()}>Upload and read it</Button>
          </div>
        }
      >
        <ul className="flex flex-col gap-1.5 text-[13px] text-text-muted">
          <li>· The file is stored privately. Only you can open it.</li>
          <li>· A linked parent can never see it, even if you share a mark from it.</li>
          <li>· You can delete it, and the file goes with it.</li>
          <li>· Nothing reaches your marks until you agree with it, line by line.</li>
        </ul>
      </Dialog>

      {openId && (
        <ReviewDialog
          cardId={openId}
          schoolYearId={current?.id}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

function CardRow({
  card, onOpen, onDelete, deleting,
}: {
  card: ReportCard
  onOpen: () => void
  onDelete: () => Promise<unknown>
  deleting?: boolean
}) {
  const label: Record<ReportCard['status'], string> = {
    uploaded: 'Not read yet',
    decoding: 'Reading…',
    decoded: 'Ready to check',
    failed: 'Could not be read',
    applied: 'Marks saved',
  }
  return (
    <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
      <FileText className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-text">
          {card.original_name ?? 'Report card'}
        </span>
        <span className="block truncate text-[12.5px] text-text-muted">
          {[card.term, card.created_at.slice(0, 10)].filter(Boolean).join(' · ')}
        </span>
      </span>

      <span className={cn(
        'shrink-0 rounded-full px-2.5 py-1 text-[11.5px]',
        card.status === 'failed' ? 'bg-danger-subtle text-danger'
          : card.status === 'applied' ? 'bg-brand-subtle text-brand'
          : 'bg-surface-2 text-text-muted',
      )}>
        {label[card.status]}
      </span>

      {/* Said, not swallowed. A decode that failed and shows nothing is
          indistinguishable from one that found no marks. */}
      {card.error && (
        <p className="w-full text-[12.5px] text-danger">{card.error}</p>
      )}

      {(card.status === 'decoded' || card.status === 'applied') && (
        <Button size="sm" variant="secondary" onClick={onOpen}>Check it</Button>
      )}
      <ConfirmDelete
        what={`“${card.original_name ?? 'this report card'}”`}
        title="Delete this report card?"
        detail={
          // The document goes with it, and any mark already saved does not.
          // Both halves are surprising in opposite directions, so both are said.
          card.status === 'applied'
            ? 'The uploaded document is deleted too. Marks you already saved stay in your classes.'
            : 'The uploaded document is deleted too, along with everything read off it.'
        }
        pending={deleting}
        onConfirm={onDelete}
      />
    </Card>
  )
}

/**
 * Agreeing with a reading, one line at a time.
 *
 * Lines arrive least-confident first, so the ones most likely to be wrong are
 * the ones you see rather than the ones you scroll past. Nothing is
 * pre-accepted, however sure the model claimed to be.
 */
function ReviewDialog({
  cardId, schoolYearId, onClose,
}: {
  cardId: string
  schoolYearId: string | undefined
  onClose: () => void
}) {
  const { data: lines = [], isLoading } = useReportCardLines(cardId)
  const { data: classes = [] } = useClasses(schoolYearId)
  const update = useUpdateLine()
  const apply = useApplyReportCard()
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  const acceptable = lines.filter(
    (l) => l.decision === 'accept' && l.matched_class_id && !l.grade_id,
  ).length

  return (
    <Dialog
      open
      onClose={onClose}
      title="What we read"
      description="Check each line. Only the ones you accept, with a class chosen, become marks."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] text-text-muted">
            {acceptable === 0
              ? 'Nothing accepted yet.'
              : `${acceptable} line${acceptable === 1 ? '' : 's'} ready to save.`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
            <Button
              size="sm"
              disabled={acceptable === 0}
              loading={apply.isPending}
              onClick={async () => setResult(await apply.mutateAsync(cardId))}
            >
              {acceptable > 0 ? `Save ${acceptable} to my marks` : 'Save to my marks'}
            </Button>
          </div>
        </div>
      }
    >
      {isPreview && (
        <p className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text-muted">
          This is the preview. Nothing was sent anywhere — these lines are invented
          so the checking step can be tried out.
        </p>
      )}

      {result && (
        <p role="status" className="mb-3 rounded-lg border border-border bg-brand-subtle px-3 py-2 text-[13px] text-brand">
          Saved {result.created} mark{result.created === 1 ? '' : 's'}.
          {result.skipped > 0 && ` ${result.skipped} left alone.`}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              classes={classes}
              onDecide={(decision) =>
                void update.mutateAsync({ id: line.id, patch: { decision } })}
              onMatch={(matchedClassId) =>
                void update.mutateAsync({ id: line.id, patch: { matchedClassId } })}
            />
          ))}
        </ul>
      )}
    </Dialog>
  )
}

function LineRow({
  line, classes, onDecide, onMatch,
}: {
  line: ReportCardLine
  classes: Array<{ id: string; name: string }>
  onDecide: (decision: ReportCardLine['decision']) => void
  onMatch: (classId: string | null) => void
}) {
  // Below about a half, the model is telling you it struggled. That is worth a
  // visible flag rather than a number nobody reads.
  const unsure = (line.confidence ?? 0) < 0.6
  const saved = Boolean(line.grade_id)

  return (
    <li className={cn(
      'rounded-lg border p-3',
      saved ? 'border-border bg-surface-2'
        : line.decision === 'accept' ? 'border-brand/40'
        : 'border-border',
    )}>
      <div className="flex flex-wrap items-center gap-2">
        {unsure && !saved && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-danger-subtle px-2 py-0.5 text-[11px] text-danger"
            title="The model was not confident about this line"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden /> hard to read
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text">
          {line.course_name || 'Unnamed line'}
        </span>
        <span className="shrink-0 tabular-nums text-[13.5px] text-text">
          {line.mark !== null && line.out_of !== null
            ? `${line.mark} / ${line.out_of}`
            : line.letter ?? '—'}
        </span>
      </div>

      {line.remark && (
        <p className="mt-1 line-clamp-2 text-[12.5px] text-text-muted">{line.remark}</p>
      )}

      {saved ? (
        <p className="mt-2 text-[12.5px] text-text-muted">Already saved to your marks.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Select
            label="Class"
            value={line.matched_class_id ?? ''}
            onChange={(e) => onMatch(e.target.value || null)}
            className="w-[190px]"
          >
            <option value="">Choose a class…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>

          <Button
            size="sm"
            variant={line.decision === 'accept' ? 'primary' : 'secondary'}
            onClick={() => onDecide(line.decision === 'accept' ? 'pending' : 'accept')}
          >
            <Check className="h-4 w-4" aria-hidden />
            {line.decision === 'accept' ? 'Accepted' : 'Accept'}
          </Button>
          <Button
            size="sm"
            variant={line.decision === 'skip' ? 'primary' : 'ghost'}
            onClick={() => onDecide(line.decision === 'skip' ? 'pending' : 'skip')}
          >
            <X className="h-4 w-4" aria-hidden />
            Skip
          </Button>
        </div>
      )}
    </li>
  )
}
