/**
 * The modal contract, tested at the DOM.
 *
 * These exist because a dialog that loses focus mid-typing is not obviously
 * broken from the outside -- nothing errors, the form still submits, and the
 * bug only shows up when someone is actually filling it in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from '@/components/ui/Dialog'

/**
 * Dialog focuses through requestAnimationFrame. jsdom will run those callbacks
 * eventually but not on any schedule a test can wait on, so a wall-clock sleep
 * makes a dropped frame look identical to a frame that correctly did nothing.
 * Driving the queue by hand makes the difference observable.
 */
let frames: FrameRequestCallback[] = []
let nextFrameId = 1

beforeEach(() => {
  frames = []
  nextFrameId = 1
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return nextFrameId++
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function flushFrames() {
  const queued = frames
  frames = []
  act(() => { queued.forEach((cb) => cb(performance.now())) })
}

/**
 * A parent that re-renders on demand and passes `onClose` the way every real
 * call site does: as a fresh arrow function each render.
 */
function Host({ onRerender }: { onRerender?: (fn: () => void) => void }) {
  const [, setTick] = useState(0)
  onRerender?.(() => setTick((t) => t + 1))
  return (
    <Dialog open onClose={() => {}} title="Add event" description="Fill this in">
      <input aria-label="Title" />
      <input aria-label="Location" />
    </Dialog>
  )
}

describe('Dialog', () => {
  it('moves focus to the first control on open', () => {
    render(<Host />)
    flushFrames()
    expect(screen.getByLabelText('Title')).toHaveFocus()
  })

  it('keeps focus where the user put it when the parent re-renders', async () => {
    // Every call site passes `onClose={() => ...}`, so its identity changes on
    // each parent render. A TanStack refetch on window focus is enough to
    // trigger one while a dialog is open. If the open effect depends on that
    // identity it re-runs, and focus is yanked back to the first field from
    // wherever the user had typed to.
    let rerender: (() => void) | undefined
    render(<Host onRerender={(fn) => { rerender = fn }} />)

    flushFrames()
    const location = screen.getByLabelText('Location')
    expect(screen.getByLabelText('Title')).toHaveFocus()

    location.focus()
    expect(location).toHaveFocus()

    act(() => { rerender?.() })
    // If the open effect re-ran it queued another focus frame. Running the
    // queue is what makes that visible -- and harmless when nothing queued.
    flushFrames()

    expect(location).toHaveFocus()
  })

  it('locks the page scroll while open and restores it on close', () => {
    let rerender: (() => void) | undefined
    document.body.style.overflow = 'auto'
    const { unmount } = render(<Host onRerender={(fn) => { rerender = fn }} />)

    expect(document.body.style.overflow).toBe('hidden')
    act(() => { rerender?.() })
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('opens on the first field, not the close button', () => {
    // The header renders before the body, so a naive search of the whole panel
    // finds Close first. Enter on an "Add event" form would then discard it.
    render(<Host />)
    flushFrames()
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus()
  })

  it('gives the description a unique id so two dialogs cannot collide', () => {
    render(
      <>
        <Dialog open onClose={() => {}} title="First" description="One">
          <input aria-label="A" />
        </Dialog>
        <Dialog open onClose={() => {}} title="Second" description="Two">
          <input aria-label="B" />
        </Dialog>
      </>,
    )
    const ids = screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-describedby'))
    expect(ids[0]).toBeTruthy()
    expect(ids[0]).not.toBe(ids[1])
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Add event">
        <input aria-label="Title" />
      </Dialog>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
