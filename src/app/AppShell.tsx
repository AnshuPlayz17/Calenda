import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  CalendarClock, CalendarDays, GraduationCap, LayoutDashboard, Bell, Lightbulb,
  Settings, ShieldCheck, Menu, X, LogOut, Search, Info, UserRound, Sparkles,
  FileText,
} from 'lucide-react'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/lib/auth'
import { PreviewBanner } from '@/components/PreviewBanner'
import { usePreview } from '@/lib/preview'
import { YearSwitcher } from '@/features/schoolYear/YearSwitcher'
import { SearchPalette } from '@/features/search/SearchPalette'
import { AssistantPanel } from '@/features/assistant/AssistantPanel'
import { usePendingReview } from '@/features/events/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { cn } from '@/lib/cn'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * The sidebar, in groups.
 *
 * It was six flat links, which was fine at six and stops being fine the moment
 * there are ten: a list with no shape is read from the top every time, so
 * everything below the fourth item costs the same as everything else. Three
 * headings turn it into three short lists, and the headings are the reader's
 * own vocabulary rather than the schema's -- "Your work" rather than "Classes,
 * assignments, notebook_pages".
 */
const GROUPS: Array<{
  heading: string
  items: Array<{ to: string; label: string; Icon: typeof LayoutDashboard; end?: boolean }>
}> = [
  {
    heading: 'Today',
    items: [
      { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, end: true },
      { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
      { to: '/timetable', label: 'Timetable', Icon: CalendarClock },
    ],
  },
  {
    heading: 'Your work',
    items: [
      { to: '/classes', label: 'Classes', Icon: GraduationCap },
      { to: '/report-cards', label: 'Report cards', Icon: FileText },
    ],
  },
  {
    heading: 'Keeping up',
    items: [
      { to: '/notifications', label: 'Reminders', Icon: Bell },
      { to: '/suggestions', label: 'Suggestions', Icon: Lightbulb },
      { to: '/settings', label: 'Settings', Icon: Settings },
    ],
  },
]

export function AppShell() {
  const { profile, isAdmin, signOut } = useAuth()
  const preview = usePreview()
  const { current } = useSchoolYear()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const location = useLocation()
  const reduce = useReducedMotion()
  const drawerRef = useRef<HTMLElement>(null)
  const drawerReturn = useRef<HTMLElement | null>(null)
  const mainRef = useRef<HTMLElement>(null)

  // Only an admin has a review queue, so only an admin pays for the query.
  const { data: pending = [] } = usePendingReview(
    isAdmin || preview.active ? current?.id : undefined,
  )

  // Navigating should always dismiss the mobile drawer.
  useEffect(() => setMobileOpen(false), [location.pathname])

  // Cmd/Ctrl+K opens search, and "/" does too as long as you are not already
  // typing into something -- both are what people try first. Cmd/Ctrl+J opens
  // the assistant, next to K because they are the two "ask the app something"
  // shortcuts and nobody remembers two unrelated letters.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setAssistantOpen(true)
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * The drawer is a modal dialog and now behaves like one.
   *
   * It has always carried `role="dialog" aria-modal="true"`, and it never moved
   * focus into itself or kept it there -- so a screen reader was told a modal
   * had opened while focus stayed on the menu button behind it, and Tab walked
   * straight out into a page the overlay had covered. Announcing a trap that
   * does not exist is worse than not announcing one.
   */
  useEffect(() => {
    if (!mobileOpen) return
    drawerReturn.current = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMobileOpen(false); return }
      if (e.key !== 'Tab') return
      const items = drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!items || items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      drawerReturn.current?.focus?.()
    }
  }, [mobileOpen])

  const sidebar = (
    // min-h-0 flex-1 rather than h-full: the rail is already a flex column, so
    // this sizes to the space left inside its padding instead of to 100% of a
    // box that includes it. Both happen to work here; this one keeps working
    // if the padding changes.
    //
    // A note on how this was nearly "fixed" twice. The first probe reported
    // items in the scrollable nav as clipped, because it compared their rects
    // against the rail's box -- which is exactly what a scrolled list looks
    // like, and it reported the same numbers before and after a change that
    // did nothing. The question worth asking is not "is it inside the box" but
    // "can it be reached": scroll it into view first, then measure. It can, at
    // every height checked (1440x900, 1280x700, 1440x640, 1024x760).
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-4 pt-1">
        <Brand size="sm" to="/dashboard" />
      </div>

      <button
        onClick={() => setSearchOpen(true)}
        className="mb-2 flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-[13.5px] text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text-muted"
      >
        <Search className="h-[15px] w-[15px] shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] sm:block">
          /
        </kbd>
      </button>

      {/* The assistant sits with search rather than in the nav, because it is
          something you do rather than somewhere you go -- and because putting
          it in the list would make it compete with the pages it answers about. */}
      <button
        onClick={() => setAssistantOpen(true)}
        className="mb-4 flex items-center gap-2.5 rounded-lg border border-brand/25 bg-brand-subtle px-3 py-2 text-[13.5px] text-brand transition-colors duration-150 hover:border-brand/40"
      >
        <Sparkles className="h-[15px] w-[15px] shrink-0" aria-hidden />
        <span className="flex-1 text-left font-medium">Ask Calenda</span>
        <kbd className="hidden rounded border border-brand/25 px-1.5 py-0.5 font-mono text-[10px] sm:block">
          ⌘J
        </kbd>
      </button>

      {/* Everything from here to the account row scrolls together.
          The About links used to be part of the pinned footer, which made that
          footer five rows tall -- and at 900px with the preview banner showing,
          the last nav group ("Admin") was clipped in half by it. Only the three
          controls somebody reaches for without reading stay pinned. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <nav aria-label="Main" className="flex flex-col gap-4">
        {GROUPS.map((group) => (
          <div key={group.heading} className="flex flex-col gap-0.5">
            <p className="label-caps px-3 pb-1">{group.heading}</p>
            {group.items.map(({ to, label, Icon, end }) => (
              <NavItem key={to} to={to} label={label} Icon={Icon} end={end} reduce={reduce} />
            ))}
          </div>
        ))}

        {/* Admin surfaces exist only for an admin. The RLS policies are the
            real guard; this simply avoids showing a door that will not open. */}
        {(isAdmin || preview.active) && (
          <div className="flex flex-col gap-0.5">
            <p className="label-caps px-3 pb-1">Running Calenda</p>
            <NavItem
              to="/admin"
              label="Admin"
              Icon={ShieldCheck}
              reduce={reduce}
              // A real count from the real query, or nothing. A badge that is
              // always there teaches people to ignore it.
              badge={pending.length || undefined}
            />
          </div>
        )}
      </nav>

        <div className="flex flex-col gap-0.5">
          <p className="label-caps px-3 pb-1">About</p>
          <Link
            to="/about"
            className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] text-text-subtle no-underline transition-colors duration-150 hover:bg-surface-2 hover:text-text"
          >
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
            About Calenda
          </Link>
          <Link
            to="/about#founder"
            className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] text-text-subtle no-underline transition-colors duration-150 hover:bg-surface-2 hover:text-text"
          >
            <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
            About the founder
          </Link>
        </div>
      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-border pt-3">
        <YearSwitcher />
        <ThemeToggle />
        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-text">
              {preview.active ? 'Preview' : profile?.full_name ?? 'Your account'}
            </p>
            <p className="label-caps">
              {preview.active ? 'sample data' : profile?.role ?? 'student'}
            </p>
          </div>
          <button
            onClick={() => { preview.exit(); void signOut() }}
            aria-label={preview.active ? 'Leave preview' : 'Sign out'}
            title={preview.active ? 'Leave preview' : 'Sign out'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-bg">
      {/*
        The first thing Tab reaches, and invisible until it is reached.

        The keyboard audit counted the rail: between twenty-two and a hundred
        and thirty-one focusable controls per screen, and roughly fifteen of
        them come before the content on every single one. Without this, reading
        the dashboard by keyboard means passing the whole navigation first --
        every time, on every screen.

        Not `hidden`, because a hidden element cannot be focused to become
        visible. It is positioned off-screen and comes back on focus.

        A BUTTON, NOT AN ANCHOR, AND THAT IS NOT A STYLE CHOICE. The first
        version was the textbook `<a href="#main">` -- and this app uses
        HashRouter, so pressing it set the URL to `#main`, which the router
        read as the route /main and rendered "This page doesn't exist". The
        keyboard probe reported the skip as working, because the next Tab did
        land in the content: the content of a 404.
      */}
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-[13.5px] focus:font-medium focus:text-brand-contrast"
      >
        Skip to content
      </button>

      {/* Offset by the sidebar width, which is fixed-positioned and would
          otherwise cover the first 232px of the banner. */}
      <div className="lg:pl-[232px]">
        <PreviewBanner />
      </div>
      {/* Desktop: a fixed rail. Mobile gets a purpose-built drawer instead of
          the same rail squeezed narrower. */}
      <aside className="fixed inset-y-0 left-0 hidden w-[232px] flex-col border-r border-border bg-surface px-3 py-4 lg:flex">
        {sidebar}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur-md lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          className="grid h-9 w-9 place-items-center rounded-lg text-text-muted hover:bg-surface-2"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Brand size="sm" showMark={false} to="/dashboard" />
        {/* On a phone the assistant needs its own door: the drawer is two taps
            away and the keyboard shortcut does not exist. */}
        <button
          onClick={() => setAssistantOpen(true)}
          aria-label="Ask Calenda"
          className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-brand hover:bg-brand-subtle"
        >
          <Sparkles className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 lg:hidden"
              style={{ background: 'var(--overlay)' }}
            />
            <motion.aside
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: reduce ? 0 : '-100%', opacity: reduce ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reduce ? 0 : '-100%', opacity: reduce ? 0 : 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col overflow-y-auto border-r border-border bg-surface px-3 py-4 lg:hidden"
            >
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-text-subtle hover:bg-surface-2"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* tabIndex -1 so the skip link can move focus here. Without it the
          browser scrolls to the anchor and leaves focus at the top of the
          document, so the next Tab goes back into the rail -- which is the
          failure mode that makes people think skip links do not work. */}
      {/* tabIndex -1 so the skip button has somewhere to put focus. Without
          it, focus would stay where it was and the next Tab would go straight
          back into the rail -- the failure that makes people believe skip
          links do not work. */}
      <main ref={mainRef} tabIndex={-1} className="lg:pl-[232px] focus:outline-none">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <Outlet />
        </div>
      </main>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  )
}

function NavItem({
  to, label, Icon, end, reduce, badge,
}: {
  to: string
  label: string
  Icon: typeof LayoutDashboard
  end?: boolean
  reduce: boolean | null
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px]',
          'transition-colors duration-150',
          isActive
            ? 'bg-brand-subtle font-medium text-brand'
            : 'text-text-muted hover:bg-surface-2 hover:text-text',
        )
      }
      style={{ transitionTimingFunction: 'var(--ease-out)' }}
    >
      {({ isActive }) => (
        <>
          <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && (
            <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-medium leading-none text-brand-contrast">
              {badge}
              <span className="sr-only"> waiting</span>
            </span>
          )}
          {isActive && !reduce && (
            <motion.span
              layoutId="nav-active"
              className="absolute left-0 h-5 w-[3px] rounded-r-full bg-brand"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
        </>
      )}
    </NavLink>
  )
}
