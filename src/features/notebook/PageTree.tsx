import { useState } from 'react'
import {
  ChevronRight, CornerDownRight, MoreHorizontal, Plus, Trash2, Archive, ArrowUp, ArrowDown,
} from 'lucide-react'
import { buildPageTree } from './pageTree'
import type { TreeRow } from './pageTree'
import type { NotebookPage } from '@/lib/types'
import { cn } from '@/lib/cn'

/**
 * The notebook's page list, as the tree the schema has always described.
 *
 * WHY THE ROW IS NOT ONE BUTTON
 *
 * A row does four things -- open, expand, add a child, and everything else --
 * and nesting a button inside a button is invalid HTML that browsers resolve
 * by silently dropping one of them. So the row is a flex line of siblings and
 * the wide one is the page itself.
 *
 * WHY THE ACTIONS ARE NOT HOVER-ONLY
 *
 * The old delete button was `opacity-0 group-hover:opacity-100`, which is
 * invisible to anybody who does not hover: a touch screen has no hover state
 * at all, so on a phone the only way to reach it was to tap and hope. The
 * menu button is always rendered and merely *dimmer* until hover or focus, so
 * it is reachable by finger and by Tab, and `focus-visible` brings it to full
 * strength for a keyboard.
 */
export function PageTree({
  pages,
  selectedId,
  onSelect,
  onAddChild,
  onArchive,
  onDelete,
  onMove,
}: {
  pages: NotebookPage[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (parentId: string | null) => void
  onArchive: (page: NotebookPage) => void
  onDelete: (page: NotebookPage) => void
  /** Up or down among its own siblings. */
  onMove: (page: NotebookPage, direction: -1 | 1) => void
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const rows = buildPageTree(pages, collapsed)

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((row) => (
        <PageRow
          key={row.page.id}
          row={row}
          collapsed={collapsed.has(row.page.id)}
          selected={row.page.id === selectedId}
          onToggle={() => toggle(row.page.id)}
          onSelect={() => onSelect(row.page.id)}
          onAddChild={() => onAddChild(row.page.id)}
          onArchive={() => onArchive(row.page)}
          onDelete={() => onDelete(row.page)}
          onMove={(d) => onMove(row.page, d)}
        />
      ))}
    </ul>
  )
}

function PageRow({
  row, collapsed, selected, onToggle, onSelect, onAddChild, onArchive, onDelete, onMove,
}: {
  row: TreeRow
  collapsed: boolean
  selected: boolean
  onToggle: () => void
  onSelect: () => void
  onAddChild: () => void
  onArchive: () => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { page, depth, hasChildren } = row

  return (
    <li
      className="group relative"
      // Indent by padding on the row rather than margin on the button, so the
      // hover and selected backgrounds still start at the rail's edge. Capped
      // at four levels: past that the title has no width left on a 220px rail,
      // and a nesting depth of five is a notebook that needs reorganising
      // rather than a rail that needs to be wider.
      style={{ paddingLeft: `${Math.min(depth, 4) * 12}px` }}
    >
      <div className="flex items-center gap-0.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? `Expand ${page.title}` : `Collapse ${page.title}`}
            aria-expanded={!collapsed}
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text"
          >
            <ChevronRight
              className={cn('h-3.5 w-3.5 transition-transform duration-150',
                !collapsed && 'rotate-90')}
              aria-hidden
            />
          </button>
        ) : (
          // Holds the column so titles line up whether or not a page has
          // children. Without it every leaf shifts five pixels left and the
          // list reads as ragged rather than nested.
          <span className="h-5 w-5 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? 'page' : undefined}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px]',
            'transition-colors duration-150',
            selected
              ? 'bg-brand-subtle font-medium text-brand'
              : 'text-text-muted hover:bg-surface-2 hover:text-text',
          )}
        >
          {page.icon && <span aria-hidden className="shrink-0 text-[13px]">{page.icon}</span>}
          <span className="truncate">{page.title || 'Untitled'}</span>
        </button>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`Actions for ${page.title || 'Untitled'}`}
          aria-expanded={menuOpen}
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md transition-all duration-150',
            'text-text-subtle hover:bg-surface-2 hover:text-text',
            // Dimmed rather than hidden. See the note at the top of the file:
            // opacity-0 until hover is unreachable on a touch screen.
            menuOpen ? 'opacity-100' : 'opacity-40 focus-visible:opacity-100 group-hover:opacity-100',
          )}
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {menuOpen && (
        <>
          {/* Catches the next click anywhere so the menu closes the way every
              other menu does. Rendered before the panel so the panel wins any
              overlap. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 top-8 z-30 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            <MenuItem icon={CornerDownRight} onClick={() => { setMenuOpen(false); onAddChild() }}>
              Add a page inside
            </MenuItem>
            <MenuItem icon={ArrowUp} onClick={() => { setMenuOpen(false); onMove(-1) }}>
              Move up
            </MenuItem>
            <MenuItem icon={ArrowDown} onClick={() => { setMenuOpen(false); onMove(1) }}>
              Move down
            </MenuItem>
            <hr className="my-1 border-border" />
            {/* Archive first and delete second, in that order and with that
                emphasis, because archive is the one that can be undone. */}
            <MenuItem icon={Archive} onClick={() => { setMenuOpen(false); onArchive() }}>
              Archive
            </MenuItem>
            <MenuItem icon={Trash2} danger onClick={() => { setMenuOpen(false); onDelete() }}>
              Delete…
            </MenuItem>
          </div>
        </>
      )}
    </li>
  )
}

function MenuItem({
  icon: Icon, children, onClick, danger,
}: {
  icon: typeof Plus
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors duration-150',
        danger
          ? 'text-danger hover:bg-danger-subtle'
          : 'text-text-muted hover:bg-surface-2 hover:text-text',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </button>
  )
}
