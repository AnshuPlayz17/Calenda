import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { createPortal } from 'react-dom'
import {
  CalendarDays, ClipboardList, GraduationCap, NotebookPen, Search, CornerDownLeft,
} from 'lucide-react'
import { useSearch } from './queries'
import type { SearchHit } from './queries'
import { agendaLabel } from '@/lib/datetime'
import { cn } from '@/lib/cn'

const ICONS = {
  event: CalendarDays,
  note: NotebookPen,
  assignment: ClipboardList,
  class: GraduationCap,
} as const

const KIND_LABEL = {
  event: 'Event',
  note: 'Note',
  assignment: 'Assignment',
  class: 'Class',
} as const

function hrefFor(hit: SearchHit): string {
  switch (hit.kind) {
    case 'class':
      return `/classes/${hit.id}`
    case 'note':
      return hit.class_id ? `/classes/${hit.class_id}` : '/classes'
    case 'assignment':
      return hit.class_id ? `/classes/${hit.class_id}?tab=assignments` : '/classes'
    default:
      return '/calendar'
  }
}

/**
 * Search over everything, opened with the key people already press for it.
 *
 * The results are grouped by what they are rather than ranked into one blur,
 * because "is this a note or an event" is the first thing you need to know
 * about a hit -- the title alone often does not say.
 */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  const { data: hits = [], isFetching } = useSearch(query)

  // Grouped, but flattened again for keyboard navigation, so arrow keys move
  // through what is on screen rather than through the unsorted results.
  const groups = useMemo(() => {
    const order: Array<SearchHit['kind']> = ['event', 'assignment', 'note', 'class']
    return order
      .map((kind) => ({ kind, items: hits.filter((h) => h.kind === kind) }))
      .filter((g) => g.items.length > 0)
  }, [hits])

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  function go(hit: SearchHit) {
    navigate(hrefFor(hit))
    onClose()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(flat.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter' && flat[cursor]) {
      e.preventDefault()
      go(flat[cursor])
    }
  }

  let index = -1

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0"
            style={{ background: 'var(--overlay)' }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.995 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={onKeyDown}
            className="relative flex max-h-[70dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events, notes, assignments, classes"
                aria-label="Search"
                className="h-12 flex-1 bg-transparent text-[14.5px] text-text outline-none placeholder:text-text-subtle"
              />
              <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10.5px] text-text-subtle sm:block">
                Esc
              </kbd>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              {query.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-[13px] text-text-subtle">
                  Type at least two letters.
                </p>
              ) : flat.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-text-muted">
                  {isFetching ? 'Searching…' : `Nothing matches "${query.trim()}".`}
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.kind} className="px-2 pb-1">
                    <p className="label-caps px-2 pb-1 pt-2">{KIND_LABEL[group.kind]}</p>
                    {group.items.map((hit) => {
                      index += 1
                      const active = index === cursor
                      const Icon = ICONS[hit.kind]
                      const at = index
                      return (
                        <button
                          key={`${hit.kind}-${hit.id}`}
                          onMouseEnter={() => setCursor(at)}
                          onClick={() => go(hit)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-100',
                            active ? 'bg-surface-2' : 'hover:bg-surface-2',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] text-text">
                              {hit.title}
                            </span>
                            {hit.subtitle && (
                              <span className="block truncate text-[12px] text-text-muted">
                                {hit.subtitle}
                              </span>
                            )}
                          </span>
                          {hit.occurs_on && (
                            <span className="shrink-0 text-[11.5px] tabular text-text-subtle">
                              {agendaLabel(hit.occurs_on)}
                            </span>
                          )}
                          {active && (
                            <CornerDownLeft
                              className="h-3.5 w-3.5 shrink-0 text-text-subtle"
                              aria-hidden
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
