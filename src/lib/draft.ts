import { useCallback, useEffect, useState } from 'react'

/**
 * A form value that survives leaving the screen and coming back.
 *
 * Typing half a class name, clicking something in the sidebar and coming back
 * to an empty form is losing somebody's work to a component unmounting -- which
 * is an implementation detail they have no way to know about. Reported from
 * real use on 2026-09-11, the first day anybody made a class for a real reason.
 *
 * `sessionStorage`, not `localStorage`, for the same reason the sign-in reel's
 * position is: closing the tab is a deliberate act and should end the draft,
 * while a stray navigation should not. Somebody coming back next week to a
 * half-typed class name from last week would be confusing rather than helpful.
 *
 * Every access is wrapped. Storage throws rather than returning null in a
 * private window with site data blocked, and a form that cannot be typed into
 * because the draft store is unavailable is far worse than one that forgets.
 */
export function useDraft<T extends Record<string, string>>(key: string, empty: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key)
      if (!saved) return empty
      const parsed = JSON.parse(saved) as Partial<T>
      // Merged over `empty` rather than used as-is: a draft saved before a
      // field was added would otherwise leave that field undefined, and an
      // undefined value on an input turns it from controlled to uncontrolled
      // with a console warning and a field that stops updating.
      return { ...empty, ...parsed }
    } catch {
      return empty
    }
  })

  useEffect(() => {
    try {
      // An empty draft is removed rather than stored, so a form somebody
      // cleared on purpose does not come back.
      const isEmpty = Object.values(value).every((v) => v.trim() === '')
      if (isEmpty) sessionStorage.removeItem(key)
      else sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // The form still works; it just will not be remembered.
    }
  }, [key, value])

  /** Clears both the fields and what is stored -- call it after a save. */
  const clear = useCallback(() => {
    setValue(empty)
    try {
      sessionStorage.removeItem(key)
    } catch {
      // Nothing was stored, so nothing to remove.
    }
    // `empty` is a literal at every call site, so a dependency on it would
    // rebuild this callback every render. The key is what identifies the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  /** Sets one field, by name, leaving the rest alone. */
  const set = useCallback(<K extends keyof T>(field: K, next: T[K]) => {
    setValue((v) => ({ ...v, [field]: next }))
  }, [])

  return { value, set, clear }
}
