/**
 * The walkthrough's closing scene, at the DOM.
 *
 * It cannot be checked in the preview, because preview has no profile and so
 * no school -- which is correct behaviour and also means the interesting half
 * never renders there. These drive it directly.
 *
 * The thing most worth pinning is what it must NOT do: put made-up initials
 * beside a real school's name, and put anything resembling a partnership
 * lockup between a school and Calenda.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClosingMark } from '@/features/welcome/ClosingMark'
import { SCHOOLS } from '@/data/schools'

function show(school: string | null) {
  return render(
    <MemoryRouter>
      <ClosingMark school={school} onDone={() => {}} />
    </MemoryRouter>,
  )
}

describe('the closing mark', () => {
  it('shows the curated monogram for a school on the list', () => {
    const school = SCHOOLS[0]!
    show(school.name)
    expect(screen.getByText(school.monogram)).toBeTruthy()
  })

  it('shows a typed-in school by name, never as invented initials', () => {
    show('Springfield Secondary')
    expect(screen.getByText('Springfield Secondary')).toBeTruthy()
    expect(screen.queryByText('SS')).toBeNull()
  })

  it('draws no mark at all when no school is known', () => {
    // A parent has no school on their profile. The scene still has to work,
    // and it must not fall back to a placeholder that looks like a school.
    show(null)
    expect(screen.getByText('Your year is ready.')).toBeTruthy()
  })

  it('never puts partnership grammar between the school and Calenda', () => {
    // The specific thing that was asked for and deliberately not built: an
    // "x" or a "|" between the two reads as a lockup, which is an endorsement
    // claim under a live trademark. If somebody adds one later, this fails.
    const school = SCHOOLS[0]!
    const { container } = show(school.name)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\s[x×|]\s*Calenda/i)
    expect(text).not.toMatch(/Calenda\s*[x×|]\s/i)
  })

  it('offers a way out rather than trapping the reader in an animation', () => {
    show(null)
    expect(screen.getByRole('button', { name: /skip/i })).toBeTruthy()
  })

  it('finishes on its own, and says it is done exactly once', async () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(
      <MemoryRouter>
        <ClosingMark school={null} onDone={onDone} />
      </MemoryRouter>,
    )

    // Two timers in sequence: a hold, then a fade, and the second is only
    // REGISTERED by an effect that runs after React commits the state change
    // the first one made. So a single large advanceTimersByTime fires the
    // first, queues the render, finishes -- and the second timer does not
    // exist yet, so it never fires. Advancing in steps lets the commit happen
    // in between, which is what actually occurs in a browser.
    //
    // The bounds are loose either side of both the animated (3400 + 700) and
    // the reduced-motion (2200 + 200) pairs, because which of those jsdom
    // picks is not this test's subject.
    let elapsed = 0
    while (elapsed < 1500) {
      await act(async () => { await vi.advanceTimersByTimeAsync(250) })
      elapsed += 250
    }
    expect(onDone).not.toHaveBeenCalled()

    while (elapsed < 6000 && onDone.mock.calls.length === 0) {
      await act(async () => { await vi.advanceTimersByTimeAsync(250) })
      elapsed += 250
    }
    expect(onDone).toHaveBeenCalledTimes(1)

    // And not again. A second call would navigate twice, the second landing
    // after the first has already left the route.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(onDone).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
