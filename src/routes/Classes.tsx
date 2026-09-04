import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Archive, GraduationCap, Plus, RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { ClassDialog } from '@/features/classes/ClassDialog'
import { useArchiveClass, useClasses } from '@/features/classes/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import type { SchoolClass } from '@/lib/types'
import { cn } from '@/lib/cn'

export function ClassesPage() {
  const { current } = useSchoolYear()
  const [showArchived, setShowArchived] = useState(false)
  const { data: classes = [], isLoading, isError, refetch, isFetching } =
    useClasses(current?.id, showArchived)
  const archive = useArchiveClass()
  const reduce = useReducedMotion()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SchoolClass | null>(null)

  const visible = showArchived ? classes : classes.filter((c) => !c.is_archived)

  return (
    <div className="flex flex-col gap-6">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h1 className="font-display text-[30px] font-medium tracking-tight">Classes</h1>
          <p className="mt-1.5 max-w-[56ch] text-[15px] text-text-muted">
            A workspace for each class — notes, assignments, tasks and deadlines together.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowArchived((v) => !v)}>
            <Archive className="h-4 w-4" aria-hidden />
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
            <Plus className="h-4 w-4" aria-hidden />
            Add class
          </Button>
        </div>
      </motion.header>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : isError ? (
        <ErrorState what="your classes" retrying={isFetching} onRetry={() => void refetch()} />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title="No classes yet"
            description="Add your first class to start keeping notes, assignments and deadlines in one place."
            action={
              <Button size="sm" variant="secondary"
                      onClick={() => { setEditing(null); setDialogOpen(true) }}>
                Add a class
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c, i) => (
            <motion.div
              key={c.id}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className={cn('group relative p-0', c.is_archived && 'opacity-65')}>
                <Link
                  to={`/classes/${c.id}`}
                  className="block px-5 py-4 no-underline"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-medium text-text">{c.name}</p>
                      {c.course_code && (
                        <p className="mt-0.5 font-mono text-[11.5px] uppercase tracking-wide text-brand">
                          {c.course_code}
                        </p>
                      )}
                    </div>
                    {c.is_archived && <span className="label-caps shrink-0">archived</span>}
                  </div>
                  <p className="mt-3 text-[12.5px] text-text-muted">
                    {[c.teacher, c.room].filter(Boolean).join(' · ') || 'No teacher set'}
                  </p>
                </Link>

                <div className="flex justify-end gap-1 border-t border-border px-3 py-2">
                  <Button variant="ghost" size="sm"
                          onClick={() => { setEditing(c); setDialogOpen(true) }}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={archive.isPending}
                    onClick={() =>
                      void archive.mutateAsync({ id: c.id, archived: !c.is_archived })}
                  >
                    {c.is_archived
                      ? <><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore</>
                      : <><Archive className="h-3.5 w-3.5" aria-hidden /> Archive</>}
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <ClassDialog open={dialogOpen} onClose={() => setDialogOpen(false)} existing={editing} />
    </div>
  )
}
