import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * A section that exists in navigation but is filled in a later phase. It says
 * plainly what will live here rather than showing a broken-looking blank.
 */
export function Placeholder({
  title, lede, icon, emptyTitle, emptyBody, phase,
}: {
  title: string
  lede: string
  icon: LucideIcon
  emptyTitle: string
  emptyBody: string
  phase: string
}) {
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-col gap-6">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="font-display text-[30px] font-medium tracking-tight">{title}</h1>
        <p className="mt-1.5 max-w-[58ch] text-[15px] text-text-muted">{lede}</p>
      </motion.header>

      <Card>
        <EmptyState icon={icon} title={emptyTitle} description={emptyBody} />
        <p className="border-t border-border px-5 py-3 text-center label-caps">{phase}</p>
      </Card>
    </div>
  )
}
