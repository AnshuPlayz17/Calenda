import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { FileUp, Inbox } from 'lucide-react'
import { ReviewQueue } from '@/features/admin/ReviewQueue'
import { ImportPanel } from '@/features/import/ImportPanel'
import { usePendingReview } from '@/features/events/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { cn } from '@/lib/cn'

type Tab = 'queue' | 'import'

export function AdminPage() {
  const { current } = useSchoolYear()
  const { data: pending = [] } = usePendingReview(current?.id)
  const [tab, setTab] = useState<Tab>('queue')
  const reduce = useReducedMotion()

  const tabs: Array<{ id: Tab; label: string; Icon: typeof Inbox; count?: number }> = [
    { id: 'queue', label: 'Review queue', Icon: Inbox, count: pending.length },
    { id: 'import', label: 'Import calendar', Icon: FileUp },
  ]

  return (
    <div className="flex flex-col gap-6">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="font-display text-[30px] font-medium tracking-tight">Admin</h1>
        <p className="mt-1.5 max-w-[58ch] text-[15px] text-text-muted">
          Review what people have suggested, and bring the school's calendar in.
        </p>
      </motion.header>

      <div role="tablist" aria-label="Admin sections"
           className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, Icon, count }) => (
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
            {count !== undefined && count > 0 && (
              <span className="tabular rounded-full px-1.5 text-[11px] font-medium"
                    style={{ background: 'var(--warning-subtle)', color: 'var(--warning)' }}>
                {count}
              </span>
            )}
            {tab === id && (
              <motion.span
                layoutId={reduce ? undefined : 'admin-tab'}
                className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-brand"
              />
            )}
          </button>
        ))}
      </div>

      {tab === 'queue' ? <ReviewQueue /> : <ImportPanel />}
    </div>
  )
}
