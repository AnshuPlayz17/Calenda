import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, ImageIcon, Paperclip, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDelete } from '@/components/ui/ConfirmDelete'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { ShareToggle } from '@/features/parents/ShareToggle'
import { dataSource, isPreview } from '@/data'

const FILES = 'attachments'
/** Matches the bucket's own allowlist, so the picker cannot offer a type the
 *  storage API will refuse with a 400 that means nothing to anybody. */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif,image/gif,application/pdf,text/plain,text/csv'
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Files attached to a class.
 *
 * `files` and `file_links` have been in the schema since the first migration
 * and nothing has ever written to them, because there was nowhere to put the
 * bytes. There is now: one private bucket, everything under the owner's own uid
 * prefix, and links that are signed and expire.
 */
export function FilesTab({ classId }: { classId: string }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: files = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [FILES, classId],
    queryFn: () => dataSource.listAttachments(classId),
  })

  const upload = useMutation({
    mutationFn: (file: File) => dataSource.uploadAttachment(classId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: [FILES] }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => dataSource.deleteAttachment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [FILES] }),
  })

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    // Checked here as well as by the bucket. The storage API's refusal is a
    // 400 with a body nobody reads; this can say which file and how big.
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is ${(file.size / 1048576).toFixed(1)}MB. The limit is 10MB.`)
      return
    }
    try {
      await upload.mutateAsync(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That upload did not work.')
    }
  }

  async function open(id: string, filename: string) {
    setError(null)
    const url = await dataSource.attachmentUrl(id)
    if (!url) {
      // The preview holds no bytes, and it says so rather than opening a blank
      // tab or offering a link that goes nowhere.
      setError(`The preview cannot open ${filename} — there is no file behind it.`)
      return
    }
    window.open(url, '_blank', 'noopener')
  }

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />
  if (isError) {
    return <ErrorState what="these files" retrying={isFetching} onRetry={() => void refetch()} />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-text-subtle">
          Photos, PDFs and notes. Up to 10MB each, private unless you share them.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          // sr-only is clipped, not removed, so it stays focusable -- and a
          // keyboard user was landing on an invisible, unnamed input. The
          // button beside it is the control; this is only the mechanism.
          tabIndex={-1}
          aria-label="File to attach"
          className="sr-only"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button size="sm" onClick={() => fileRef.current?.click()} loading={upload.isPending}>
          <Upload className="h-4 w-4" aria-hidden /> Add a file
        </Button>
      </div>

      {isPreview && (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text-muted">
          In the preview a file is recorded but not stored, so it cannot be opened again.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle px-3.5 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      )}

      {files.length === 0 ? (
        <Card>
          <EmptyState
            icon={Paperclip}
            title="Nothing attached yet"
            description="A photo of the whiteboard, a handout, a past paper — anything you want beside the notes for this class."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => {
            const isImage = f.mime_type.startsWith('image/')
            return (
              <li key={f.id}>
                <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {isImage
                    ? <ImageIcon className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
                    : <FileText className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-text">
                      {f.filename}
                    </span>
                    <span className="block text-[12.5px] text-text-muted">
                      {(f.size_bytes / 1024).toFixed(0)} KB · {f.created_at.slice(0, 10)}
                    </span>
                  </span>

                  {/* The file's own flag, not the class's. An earlier version
                      of this passed kind="class" with the class's id, so the
                      toggle said "this file" and shared the whole class. */}
                  <ShareToggle
                    kind="file"
                    id={f.id}
                    shared={f.shared_with_parents}
                    label={`The file “${f.filename}”`}
                  />

                  <button
                    onClick={() => void open(f.id, f.filename)}
                    aria-label={`Open ${f.filename}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <ConfirmDelete
                    what={`“${f.filename}”`}
                    title="Delete this file?"
                    detail="The file itself is removed from storage, not just this link to it."
                    pending={remove.isPending}
                    onConfirm={() => remove.mutateAsync(f.id)}
                  />
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
