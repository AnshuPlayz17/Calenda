import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { SchoolYear } from '@/lib/types'

const STORAGE_KEY = 'calenda.schoolYear'

type Value = {
  years: SchoolYear[]
  current: SchoolYear | null
  loading: boolean
  setCurrent: (id: string) => void
}

const Ctx = createContext<Value | null>(null)

/**
 * The school year every other query is scoped by. Defaults to the year marked
 * current in the database, but a chosen year is remembered so switching to a
 * past year survives a reload.
 */
export function SchoolYearProvider({ children }: { children: ReactNode }) {
  const { data: years = [], isLoading } = useQuery({
    queryKey: ['school-years'],
    queryFn: () => dataSource.listSchoolYears(),
    staleTime: 5 * 60_000,
  })

  const [chosenId, setChosenId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })

  useEffect(() => {
    try {
      if (chosenId) localStorage.setItem(STORAGE_KEY, chosenId)
    } catch {
      // Storage unavailable; the choice simply lasts for this session.
    }
  }, [chosenId])

  const value = useMemo<Value>(() => {
    // A remembered year that no longer exists must not strand the user, so
    // fall back to the current year and then to the newest one.
    const chosen = years.find((y) => y.id === chosenId)
    const current = chosen ?? years.find((y) => y.is_current) ?? years[0] ?? null
    return { years, current, loading: isLoading, setCurrent: setChosenId }
  }, [years, chosenId, isLoading])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSchoolYear() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSchoolYear must be used inside SchoolYearProvider')
  return ctx
}
