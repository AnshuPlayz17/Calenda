import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { COOLDOWN_SECONDS, useEmailCooldown } from '@/features/auth/emailCooldown'

/**
 * The cooldown is a courtesy, not a control -- but the courtesy has to be
 * right, because a wrong one either locks somebody out of a password reset or
 * lets them fire four in a row at a quota of 300 a day.
 */

describe('the per-address email cooldown', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('lets an untouched address send immediately', () => {
    const { result } = renderHook(() => useEmailCooldown('a@example.com'))
    expect(result.current.remaining).toBe(0)
  })

  it('holds that address for the full cooldown once it has sent', () => {
    const { result } = renderHook(() => useEmailCooldown('a@example.com'))
    act(() => result.current.record())
    expect(result.current.remaining).toBe(COOLDOWN_SECONDS)
  })

  it('counts down and releases', () => {
    const { result, rerender } = renderHook(() => useEmailCooldown('a@example.com'))
    act(() => result.current.record())

    act(() => { vi.advanceTimersByTime(30_000) })
    rerender()
    expect(result.current.remaining).toBe(30)

    act(() => { vi.advanceTimersByTime(30_000) })
    rerender()
    expect(result.current.remaining).toBe(0)
  })

  it('does not let one address block another, so a shared computer still works', () => {
    const { result: first } = renderHook(() => useEmailCooldown('a@example.com'))
    act(() => first.current.record())

    const { result: second } = renderHook(() => useEmailCooldown('b@example.com'))
    expect(second.current.remaining).toBe(0)
  })

  it('treats case and surrounding spaces as the same address', () => {
    const { result: typed } = renderHook(() => useEmailCooldown('a@example.com'))
    act(() => typed.current.record())

    const { result: retyped } = renderHook(() => useEmailCooldown('  A@Example.COM '))
    expect(retyped.current.remaining).toBe(COOLDOWN_SECONDS)
  })

  it('survives storage being unavailable rather than failing the sign-in', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    const { result } = renderHook(() => useEmailCooldown('a@example.com'))
    expect(result.current.remaining).toBe(0)
    expect(() => act(() => result.current.record())).not.toThrow()

    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('ignores a corrupt stored value instead of crashing the page', () => {
    window.localStorage.setItem('calenda.email.lastSent', 'not json')
    const { result } = renderHook(() => useEmailCooldown('a@example.com'))
    expect(result.current.remaining).toBe(0)
  })

  it('forgets addresses whose cooldown has long passed', () => {
    const { result: old } = renderHook(() => useEmailCooldown('old@example.com'))
    act(() => old.current.record())

    act(() => { vi.advanceTimersByTime(10 * 60 * 1000) })

    const { result: fresh } = renderHook(() => useEmailCooldown('new@example.com'))
    act(() => fresh.current.record())

    const stored = JSON.parse(window.localStorage.getItem('calenda.email.lastSent')!)
    expect(Object.keys(stored)).toEqual(['new@example.com'])
  })
})
