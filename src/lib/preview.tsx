import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { isConfigured } from './env'

/**
 * Preview mode: lets the app be explored before Supabase is connected, using
 * the seeded 2026-27 school calendar.
 *
 * It can only be entered when Supabase is unconfigured, so it cannot become a
 * way around authentication in a real deployment -- with a project configured,
 * `available` is false and nothing here can be switched on.
 *
 * Kept in sessionStorage rather than localStorage: closing the tab ends it,
 * so it never lingers as a surprising state.
 */
const KEY = 'calenda.preview'

type Value = {
  /** True only when Supabase is unconfigured. */
  available: boolean
  active: boolean
  enter: () => void
  exit: () => void
}

const Ctx = createContext<Value | null>(null)

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(() => {
    if (isConfigured) return false
    try {
      return sessionStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })

  const enter = useCallback(() => {
    if (isConfigured) return
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      // Non-fatal; preview still works for this render.
    }
    setActive(true)
  }, [])

  const exit = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      // Non-fatal.
    }
    setActive(false)
  }, [])

  const value = useMemo<Value>(
    () => ({ available: !isConfigured, active: !isConfigured && active, enter, exit }),
    [active, enter, exit],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePreview() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePreview must be used inside PreviewProvider')
  return ctx
}
