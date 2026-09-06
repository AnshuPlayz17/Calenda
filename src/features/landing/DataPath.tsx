import { Bell, CalendarDays, FileText, GraduationCap, ShieldCheck } from 'lucide-react'
import { CircuitBoard } from '@/components/motion/CircuitBoard'

/**
 * The route a date takes, as a board.
 *
 * Same five steps the pipeline section describes in words. A diagram is not a
 * substitute for that text -- it is faster to grasp and slower to be precise, so
 * they do different jobs on different parts of the page, and this one is used
 * where there is no room to read six paragraphs.
 */
export function DataPath({ className }: { className?: string }) {
  return (
    <CircuitBoard
      className={className}
      width={560}
      height={230}
      pulseSpeed={2.4}
      nodes={[
        { id: 'pdf', x: 46, y: 115, label: 'School PDF', icon: <FileText className="h-3.5 w-3.5" /> },
        { id: 'check', x: 190, y: 52, label: 'Duplicates', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
        { id: 'classes', x: 190, y: 178, label: 'Your classes', icon: <GraduationCap className="h-3.5 w-3.5" /> },
        { id: 'cal', x: 356, y: 115, label: 'One calendar', icon: <CalendarDays className="h-3.5 w-3.5" /> },
        { id: 'you', x: 508, y: 115, label: 'You, early', icon: <Bell className="h-3.5 w-3.5" /> },
      ]}
      connections={[
        { from: 'pdf', to: 'check', animated: true },
        { from: 'pdf', to: 'classes', animated: true },
        { from: 'check', to: 'cal', animated: true },
        { from: 'classes', to: 'cal', animated: true },
        { from: 'cal', to: 'you', animated: true },
      ]}
    />
  )
}
