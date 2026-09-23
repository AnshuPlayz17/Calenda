import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The delete control, and the three ways it could lie.
 *
 * This is the most destructive thing in the app and the only one with no undo,
 * so what is tested here is not that it works -- a mocked function call always
 * works -- but that it cannot report something that did not happen, and cannot
 * happen to somebody who did not ask for it.
 *
 * The middle one is this project's oldest bug wearing yet another costume. A
 * success signal that is not downstream of the success has now appeared as a
 * workflow reporting on its own invocation, a counter incremented beside the
 * attempt rather than by it, a service worker whose silence meant both "fine"
 * and "broken", a setup file checking the row it just wrote, and a dispatcher
 * marking an announcement sent on a path that sent nothing. Here it would be
 * "the call returned 200, so the account is gone" -- and the person would be
 * signed out and shown a goodbye while their data sat exactly where it was.
 */

const invoke = vi.fn()
const signOut = vi.fn(async () => {})
let previewActive = false

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}))
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'Someone@Example.com' }, signOut }),
}))
vi.mock('@/lib/preview', () => ({
  usePreview: () => ({ active: previewActive, available: false, enter: () => {}, exit: () => {} }),
}))

async function open() {
  const { DeleteAccountCard } = await import('@/features/settings/DeleteAccountCard')
  render(<DeleteAccountCard />)
}

beforeEach(() => {
  invoke.mockReset()
  signOut.mockClear()
  previewActive = false
})

describe('deleting an account', () => {
  it('will not fire until the address is typed', async () => {
    const user = userEvent.setup()
    await open()

    await user.click(screen.getByRole('button', { name: /delete this account/i }))
    const confirm = screen.getByRole('button', { name: /delete my account permanently/i })
    expect(confirm).toBeDisabled()

    // A near miss is still a miss. Somebody who cannot produce the address on
    // the screen in front of them is not the person this decision belongs to.
    await user.type(screen.getByLabelText(/your email address/i), 'someone@example.co')
    expect(confirm).toBeDisabled()

    // Case and surrounding space are not the test. A phone capitalises the
    // first letter of everything, and refusing a correctly typed address over
    // an autocapital would be the app inventing an obstacle.
    await user.clear(screen.getByLabelText(/your email address/i))
    await user.type(screen.getByLabelText(/your email address/i), '  SOMEONE@example.com ')
    expect(confirm).toBeEnabled()

    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not report a deletion the function did not confirm', async () => {
    const user = userEvent.setup()
    // A 200 with no `deleted` flag: the function answered something this
    // screen does not understand. Treating that as success is the bug.
    invoke.mockResolvedValue({ data: {}, error: null })
    await open()

    await user.click(screen.getByRole('button', { name: /delete this account/i }))
    await user.type(screen.getByLabelText(/your email address/i), 'someone@example.com')
    await user.click(screen.getByRole('button', { name: /delete my account permanently/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/was not deleted/i)
    })
    // And the session is untouched, because the account still exists.
    expect(signOut).not.toHaveBeenCalled()
  })

  it('repeats the function\'s own sentence, which names the step that failed', async () => {
    const user = userEvent.setup()
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        context: new Response(
          JSON.stringify({
            error: 'deleting your files',
            message: 'Your account was not deleted. It failed while deleting your files: 2 of 9 could not be removed',
            deleted: false,
          }),
          { status: 500 },
        ),
      },
    })
    await open()

    await user.click(screen.getByRole('button', { name: /delete this account/i }))
    await user.type(screen.getByLabelText(/your email address/i), 'someone@example.com')
    await user.click(screen.getByRole('button', { name: /delete my account permanently/i }))

    // Not "please try again". Somebody at this moment needs to know whether
    // their data is gone, and only the function knows.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/2 of 9 could not be removed/)
    })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('signs out only once the account is actually gone', async () => {
    const user = userEvent.setup()
    invoke.mockResolvedValue({ data: { deleted: true, files: 3 }, error: null })
    await open()

    await user.click(screen.getByRole('button', { name: /delete this account/i }))
    await user.type(screen.getByLabelText(/your email address/i), 'someone@example.com')
    await user.click(screen.getByRole('button', { name: /delete my account permanently/i }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    // No id in the call. The function reads it from the token; a client that
    // sends one is a client whose value could be changed.
    expect(invoke).toHaveBeenCalledWith('calenda-delete-account')
  })

  it('offers nothing to delete in preview, and says why', async () => {
    previewActive = true
    await open()

    // Every audit this project runs enters through preview, so a control that
    // renders there and silently does nothing is exactly the defect those
    // audits exist to catch.
    expect(screen.queryByRole('button', { name: /delete this account/i })).toBeNull()
    expect(screen.getByText(/nothing here to delete/i)).toBeInTheDocument()
  })
})
