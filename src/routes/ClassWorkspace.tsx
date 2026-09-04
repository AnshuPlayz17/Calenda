import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowLeft, CheckSquare, ClipboardList, FileText, NotebookPen, Plus, Trash2,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { NoteEditor } from '@/features/notebook/NoteEditor'
import { AssignmentDialog } from '@/features/assignments/AssignmentDialog'
import {
  useAssignments, useClass, useCreatePage, useCreateTask, useDeletePage,
  useDeleteTask, usePages, useSetAssignmentStatus, useTasks, useToggleTask,
} from '@/features/classes/queries'
import type { Assignment, NotebookPage } from '@/lib/types'
import { ShareToggle } from '@/features/parents/ShareToggle'
import { cn } from '@/lib/cn'

type Tab = 'notes' | 'assignments' | 'tasks'

export function ClassWorkspace() {
  const { classId } = useParams<{ classId: string }>()
  const { data: klass, isLoading } = useClass(classId)
  // The tab lives in the URL so a reload, a bookmark and the back button all
  // land where you actually were rather than resetting to notes.
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = raw === 'assignments' || raw === 'tasks' ? raw : 'notes'
  const setTab = (next: Tab) => {
    setParams((prev) => {
      const copy = new URLSearchParams(prev)
      if (next === 'notes') copy.delete('tab')
      else copy.set('tab', next)
      return copy
    }, { replace: true })
  }
  const reduce = useReducedMotion()

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />

  if (!klass) {
    return (
      <Card>
        <EmptyState
          icon={FileText}
          title="That class doesn't exist"
          description="It may have been deleted, or the link is out of date."
          action={<Link to="/classes" className="text-[13px] text-brand">Back to classes</Link>}
        />
      </Card>
    )
  }

  const tabs: Array<{ id: Tab; label: string; Icon: typeof NotebookPen }> = [
    { id: 'notes', label: 'Notes', Icon: NotebookPen },
    { id: 'assignments', label: 'Assignments', Icon: ClipboardList },
    { id: 'tasks', label: 'Tasks', Icon: CheckSquare },
  ]

  return (
    <div className="flex flex-col gap-5">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <Link to="/classes"
              className="inline-flex items-center gap-1.5 text-[12.5px] text-text-muted no-underline hover:text-text">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Classes
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-[30px] font-medium tracking-tight">{klass.name}</h1>
          {klass.course_code && (
            <span className="font-mono text-[13px] uppercase tracking-wide text-brand">
              {klass.course_code}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {(klass.teacher || klass.room) && (
            <p className="text-[13px] text-text-muted">
              {[klass.teacher, klass.room].filter(Boolean).join(' · ')}
            </p>
          )}
          <ShareToggle
            kind="class"
            id={klass.id}
            shared={klass.shared_with_parents}
            label={`The class “${klass.name}”`}
          />
        </div>
      </motion.header>

      <div role="tablist" aria-label="Class sections" className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'relative flex items-center gap-2 px-3 pb-2.5 pt-1 text-[13.5px] transition-colors duration-150',
              tab === id ? 'font-medium text-text' : 'text-text-muted hover:text-text',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {tab === id && (
              <motion.span
                layoutId={reduce ? undefined : 'class-tab'}
                className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-brand"
              />
            )}
          </button>
        ))}
      </div>

      {tab === 'notes' && <NotesTab classId={klass.id} />}
      {tab === 'assignments' && <AssignmentsTab classId={klass.id} />}
      {tab === 'tasks' && <TasksTab classId={klass.id} />}
    </div>
  )
}

// ----------------------------------------------------------------- notes --

function NotesTab({ classId }: { classId: string }) {
  const { data: pages = [], isLoading, isError, refetch, isFetching } = usePages(classId)
  const createPage = useCreatePage(classId)
  const deletePage = useDeletePage()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Follow the list rather than holding a stale id: after a delete, or on
  // first load, land on something that actually exists.
  useEffect(() => {
    if (pages.length === 0) { setSelectedId(null); return }
    if (!selectedId || !pages.some((p) => p.id === selectedId)) {
      setSelectedId(pages[0]!.id)
    }
  }, [pages, selectedId])

  const selected = pages.find((p) => p.id === selectedId) ?? null

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />
  if (isError) return <ErrorState what="these notes" retrying={isFetching} onRetry={() => void refetch()} />

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-1">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="label-caps">Pages</span>
          <button
            onClick={() => void createPage.mutateAsync({ parentId: null })}
            aria-label="New page"
            className="grid h-6 w-6 place-items-center rounded-md text-text-subtle hover:bg-surface-2 hover:text-text"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        {pages.length === 0 ? (
          <Button variant="secondary" size="sm"
                  onClick={() => void createPage.mutateAsync({ parentId: null })}>
            <Plus className="h-4 w-4" aria-hidden /> First page
          </Button>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {pages.map((p) => (
              <li key={p.id} className="group flex items-center gap-1">
                <button
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors duration-150',
                    p.id === selectedId
                      ? 'bg-brand-subtle font-medium text-brand'
                      : 'text-text-muted hover:bg-surface-2 hover:text-text',
                  )}
                >
                  {p.title || 'Untitled'}
                </button>
                <button
                  onClick={() => void deletePage.mutateAsync(p.id)}
                  aria-label={`Delete ${p.title}`}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-text-subtle opacity-0 transition-opacity hover:bg-surface-2 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <Card className="min-w-0 px-5 py-4 sm:px-7 sm:py-6">
        {selected
          ? <>
              <div className="mb-2 flex justify-end">
                <ShareToggle
                  kind="notebook_page"
                  id={selected.id}
                  shared={selected.shared_with_parents}
                  label={`The page “${selected.title || 'Untitled'}”`}
                />
              </div>
              <NoteEditor key={selected.id} page={selected as NotebookPage} />
            </>
          : <EmptyState
              icon={NotebookPen}
              title="Your notebook is empty"
              description="Create your first page and start writing."
            />}
      </Card>
    </div>
  )
}

// ----------------------------------------------------------- assignments --

const STATUS_LABEL: Record<Assignment['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Done',
}

function AssignmentsTab({ classId }: { classId: string }) {
  const { data: assignments = [], isLoading, isError, refetch, isFetching } = useAssignments(classId)
  const setStatus = useSetAssignmentStatus()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Assignment | null>(null)

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />
  if (isError) return <ErrorState what="these assignments" retrying={isFetching} onRetry={() => void refetch()} />

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="h-4 w-4" aria-hidden /> New assignment
        </Button>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            description="Add one with a due date and it appears on your calendar and dashboard automatically."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {assignments.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  onClick={() => void setStatus.mutateAsync({
                    id: a.id,
                    status: a.status === 'completed' ? 'not_started' : 'completed',
                  })}
                  aria-label={a.status === 'completed' ? 'Mark not done' : 'Mark done'}
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border transition-colors duration-150',
                    a.status === 'completed'
                      ? 'border-brand bg-brand text-brand-contrast'
                      : 'border-border-strong hover:border-brand',
                  )}
                >
                  {a.status === 'completed' && <CheckSquare className="h-3 w-3" aria-hidden />}
                </button>

                <button
                  onClick={() => { setEditing(a); setOpen(true) }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className={cn(
                    'block truncate text-[14px] font-medium',
                    a.status === 'completed' ? 'text-text-subtle line-through' : 'text-text',
                  )}>
                    {a.title}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-text-muted">
                    {a.due_at
                      ? new Date(a.due_at).toLocaleDateString('en-CA', {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })
                      : 'No due date'}
                    {' · '}{STATUS_LABEL[a.status]}
                    {a.priority === 'high' && ' · High priority'}
                  </span>
                </button>

                <ShareToggle
                  kind="assignment"
                  id={a.id}
                  shared={a.shared_with_parents}
                  label={`The assignment “${a.title}”`}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AssignmentDialog
        open={open}
        onClose={() => setOpen(false)}
        classId={classId}
        existing={editing}
      />
    </div>
  )
}

// ----------------------------------------------------------------- tasks --

function TasksTab({ classId }: { classId: string }) {
  const { data: tasks = [], isLoading, isError, refetch, isFetching } = useTasks(classId)
  const create = useCreateTask(classId)
  const toggle = useToggleTask()
  const remove = useDeleteTask()
  const [title, setTitle] = useState('')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const value = title.trim()
    if (!value) return
    setTitle('')
    await create.mutateAsync(value)
  }

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />
  if (isError) return <ErrorState what="these tasks" retrying={isFetching} onRetry={() => void refetch()} />

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={add} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Finish chapter 4 questions"
          aria-label="New task"
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-text-subtle hover:border-border-strong"
        />
        <Button type="submit" size="md" loading={create.isPending} disabled={!title.trim()}>
          Add
        </Button>
      </form>

      {tasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckSquare}
            title="No tasks yet"
            description="Small things to get done for this class — not big enough to be assignments."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-1">
          {tasks.map((t) => {
            const done = t.status === 'completed'
            return (
              <li key={t.id} className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => void toggle.mutateAsync({ id: t.id, done: !done })}
                  aria-label={t.title}
                  className="h-4 w-4 shrink-0 rounded border-border-strong accent-[var(--brand)]"
                />
                <span className={cn(
                  'min-w-0 flex-1 truncate text-[13.5px]',
                  done ? 'text-text-subtle line-through' : 'text-text',
                )}>
                  {t.title}
                </span>
                <button
                  onClick={() => void remove.mutateAsync(t.id)}
                  aria-label={`Delete ${t.title}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-subtle opacity-0 transition-opacity hover:bg-surface-2 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
