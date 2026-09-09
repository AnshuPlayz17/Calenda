import type { NotebookPage } from '@/lib/types'

/**
 * The notebook's flat page list, arranged into the tree it has always been.
 *
 * `parent_page_id` and `position` have been in the schema since the first
 * migration and both data sources have always written them -- `createPage`
 * computes a fractional position among its siblings. Only the sidebar never
 * asked: it passed `parentId: null` on every create and rendered one flat list
 * ordered by a position that is only meaningful *within* a sibling group, so
 * two roots and a child could interleave with nothing showing which was which.
 *
 * A pure function over the rows, so the tests call what ships -- and because
 * the two things most likely to break here, a missing parent and a cycle, are
 * far easier to state as inputs than to reproduce by clicking.
 */
export type TreeRow = {
  page: NotebookPage
  /** How many ancestors it has. 0 is a root. */
  depth: number
  /** Whether anything hangs off it, so a row knows to draw a disclosure. */
  hasChildren: boolean
}

/**
 * Depth-first, siblings in `position` order.
 *
 * `collapsed` names pages whose descendants are not to be listed. It is passed
 * in rather than held here because collapse is view state belonging to the
 * component -- and because a function that takes it can be asked what the tree
 * looks like in any state without rendering one.
 */
export function buildPageTree(
  pages: NotebookPage[],
  collapsed: ReadonlySet<string> = new Set(),
): TreeRow[] {
  const byParent = new Map<string | null, NotebookPage[]>()
  const ids = new Set(pages.map((p) => p.id))

  for (const page of pages) {
    // A page whose parent is not in this list is shown as a root rather than
    // dropped. It happens for real: `listPages` filters archived rows out, so
    // archiving a parent orphans its children -- they are not archived, they
    // still exist, and walking only from true roots would make them invisible
    // and unreachable. That is a page of somebody's notes gone, with no way
    // left in the interface to ask for it back.
    const key = page.parent_page_id && ids.has(page.parent_page_id)
      ? page.parent_page_id
      : null
    const group = byParent.get(key)
    if (group) group.push(page)
    else byParent.set(key, [page])
  }

  for (const group of byParent.values()) {
    // created_at breaks ties. Two pages can share a position -- the fractional
    // midpoint of a pair that is already adjacent eventually stops being
    // distinguishable in floating point -- and an unstable order would make
    // the list reshuffle itself between renders.
    group.sort((a, b) =>
      a.position - b.position || a.created_at.localeCompare(b.created_at))
  }

  const out: TreeRow[] = []
  // A cycle cannot be made through the interface, but it can be made by two
  // clients moving pages at the same time, and the cost of not guarding is an
  // infinite loop that takes the whole route down rather than one wrong row.
  const seen = new Set<string>()

  const walk = (parentId: string | null, depth: number) => {
    for (const page of byParent.get(parentId) ?? []) {
      if (seen.has(page.id)) continue
      seen.add(page.id)
      const children = byParent.get(page.id) ?? []
      out.push({ page, depth, hasChildren: children.length > 0 })
      if (children.length > 0 && !collapsed.has(page.id)) walk(page.id, depth + 1)
    }
  }

  walk(null, 0)
  return out
}

/**
 * Every descendant of a page, for the sentence a delete confirmation has to be
 * able to say.
 *
 * Deleting cascades in the database, so "delete this page" can mean deleting
 * nine. A confirmation that cannot count them is a confirmation that does not
 * describe what it is about to do.
 */
export function descendantsOf(pages: NotebookPage[], id: string): NotebookPage[] {
  const children = new Map<string, NotebookPage[]>()
  for (const p of pages) {
    if (!p.parent_page_id) continue
    const group = children.get(p.parent_page_id)
    if (group) group.push(p)
    else children.set(p.parent_page_id, [p])
  }

  const out: NotebookPage[] = []
  const seen = new Set<string>([id])
  const stack = [id]
  while (stack.length > 0) {
    for (const child of children.get(stack.pop()!) ?? []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      out.push(child)
      stack.push(child.id)
    }
  }
  return out
}

/**
 * Whether `candidate` may become the parent of `pageId`.
 *
 * Refuses the page itself and anything underneath it. Dragging a page into its
 * own child would detach that whole branch from every root -- the rows still
 * exist and reference each other in a ring, and `buildPageTree` would then
 * decline to list any of them. The cycle guard there stops it being fatal;
 * this stops it happening.
 */
export function canMoveUnder(
  pages: NotebookPage[],
  pageId: string,
  candidateParentId: string | null,
): boolean {
  if (candidateParentId === null) return true
  if (candidateParentId === pageId) return false
  return !descendantsOf(pages, pageId).some((d) => d.id === candidateParentId)
}

/**
 * Where to put a page dropped between two others, without renumbering anybody.
 *
 * Fractional ordering: the midpoint of its new neighbours. `before` and `after`
 * are the positions either side, or undefined at an end. `position` is numeric
 * rather than an integer for exactly this reason, and it is why a reorder
 * rewrites one row instead of every sibling after it.
 */
export function positionBetween(
  before: number | undefined,
  after: number | undefined,
): number {
  if (before === undefined && after === undefined) return 1000
  if (before === undefined) return after! - 1000
  if (after === undefined) return before + 1000
  return (before + after) / 2
}
