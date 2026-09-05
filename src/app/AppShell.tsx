import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  CalendarDays, GraduationCap, LayoutDashboard, Bell, Lightbulb,
  Settings, ShieldCheck, Menu, X, LogOut, Search,
} from 'lucide-react'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/lib/auth'
import { PreviewBanner } from '@/components/PreviewBanner'
import { usePreview } from '@/lib/preview'
import { YearSwitcher } from '@/features/schoolYear/YearSwitcher'
import { SearchPalette } from '@/features/search/SearchPalette'
import { cn } from '@/lib/cn'

const nav = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { to: '/classes', label: 'Classes', Icon: GraduationCap },
  { to: '/notifications', label: 'Notifications', Icon: Bell },
  { to: '/suggestions', label: 'Suggestions', Icon: Lightbulb },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export function AppShell() {
  const { profile, isAdmin, signOut } = useAuth()
  const preview = usePreview()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  const reduce = useReducedMotion()

  // Navigating should always dismiss the mobile drawer.
  useEffect(() => setMobileOpen(false), [location.pathname])

  // Cmd/Ctrl+K opens search, and "/" does too as long as you are not already
  // typing into something -- both are what people try first.
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
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Escape closes the drawer, matching every other dismissible surface.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const sidebar = (
    <div className="flex h-full flex-col gap-1">
      <div className="px-3 pb-5 pt-1">
        <Brand size="sm" to="/dashboard" />
      </div>

      <button
        onClick={() => setSearchOpen(true)}
        className="mx-0 mb-3 flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-[13.5px] text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text-muted"
      >
        <Search className="h-[15px] w-[15px] shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] sm:block">
          /
        </kbd>
      </button>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {nav.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
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
                {label}
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
        ))}

        {/* Admin surfaces exist only for an admin. The RLS policies are the
            real guard; this simply avoids showing a door that will not open. */}
        {(isAdmin || preview.active) && (
          <>
            <hr className="my-2 border-border" />
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors duration-150',
                  isActive
                    ? 'bg-brand-subtle font-medium text-brand'
                    : 'text-text-muted hover:bg-surface-2 hover:text-text',
                )
              }
            >
              <ShieldCheck className="h-[17px] w-[17px] shrink-0" aria-hidden />
              Admin
            </NavLink>
          </>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-3 px-1 pt-4">
        <YearSwitcher />
        <ThemeToggle />
        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-text">
              {preview.active ? 'Preview' : profile?.full_name ?? 'Your account'}
            </p>
            <p className="label-caps">{preview.active ? 'sample data' : profile?.role ?? 'student'}</p>
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
        <Brand size="sm" showSchool={false} to="/dashboard" />
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
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: reduce ? 0 : '-100%', opacity: reduce ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reduce ? 0 : '-100%', opacity: reduce ? 0 : 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col border-r border-border bg-surface px-3 py-4 lg:hidden"
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

      <main className="lg:pl-[232px]">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <Outlet />
        </div>
      </main>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
