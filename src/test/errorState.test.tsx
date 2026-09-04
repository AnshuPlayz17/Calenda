/**
 * "Nothing here" and "we could not load it" must never look the same.
 *
 * Every list in the app defaulted a failed query to an empty array, so when
 * Supabase was briefly unhealthy the Classes page rendered "No classes yet" --
 * identical to a brand new account. That reads as though your work has been
 * deleted, and it was never true.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { GraduationCap } from 'lucide-react'

describe('ErrorState', () => {
  it('says the data could not be loaded, not that there is none', () => {
    render(<ErrorState what="your classes" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Couldn't load your classes/i)).toBeInTheDocument()
  })

  it('says outright that nothing has been deleted', () => {
    // The whole point: a person seeing this must not conclude their work is gone.
    render(<ErrorState what="your classes" />)
    expect(screen.getByText(/nothing has been deleted/i)).toBeInTheDocument()
  })

  it('offers a retry that calls back', async () => {
    const onRetry = vi.fn()
    render(<ErrorState what="your calendar" onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('has no retry button when there is nothing to retry', () => {
    render(<ErrorState what="your calendar" />)
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  it('reads differently from the empty state it used to be mistaken for', () => {
    const { unmount } = render(<ErrorState what="your classes" />)
    const failed = screen.getByRole('alert').textContent ?? ''
    unmount()

    render(
      <EmptyState
        icon={GraduationCap}
        title="No classes yet"
        description="Add your first class to start keeping notes, assignments and deadlines in one place."
      />,
    )
    const empty = document.body.textContent ?? ''

    expect(failed).not.toBe(empty)
    expect(empty).not.toMatch(/couldn't load/i)
    // And the failure is announced; an empty list is not an alert.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
