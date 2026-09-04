import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'vivid' | 'system'

const STORAGE_KEY = 'calenda.theme'

type ThemeContextValue = {
  theme: Theme
  /**
   * What is actually on screen once 'system' is resolved. Vivid is a light
   * theme, so anything keying off lightness treats it as one.
   */
  resolved: 'light' | 'dark'
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'vivid') return v
  } catch {
    // Private browsing blocks storage; the OS preference is a fine fallback.
  }
  return 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Track the OS preference so 'system' stays live rather than sampled once.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // 'system' removes the attribute entirely so the media query takes over.
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
  }, [theme])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolved:
        theme === 'system'
          ? (systemDark ? 'dark' : 'light')
          : theme === 'dark'
            ? 'dark'
            : 'light',
      setTheme,
    }),
    [theme, systemDark, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
