import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Changing the credential, and the three things that would make it a prop.
 *
 * The current-password field is the one worth testing. `updateUser({ password
 * })` changes the password of whoever holds the session, so without a check
 * that field is decoration -- it looks like a control and stops nothing, which
 * is the failure mode this project names most often. Somebody on an unlocked
 * laptop could set a new password and lock the owner out, and the form would
 * have asked them a question whose answer it ignored.
 */

const signInWithPassword = vi.fn()
const updateUser = vi.fn()
let identities: Array<{ provider: string }> = [{ provider: 'email' }]
let previewActive = false
let delivery = true

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      updateUser: (...a: unknown[]) => updateUser(...a),
    },
  },
}))
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'me@example.com', identities } }),
}))
vi.mock('@/lib/preview', () => ({
  usePreview: () => ({ active: previewActive, available: false, enter: () => {}, exit: () => {} }),
}))
vi.mock('@/lib/email', () => ({ get emailDelivery() { return delivery } }))

async function open() {
  vi.resetModules()
  const { SignInCard } = await import('@/features/settings/SignInCard')
  render(<SignInCard />)
}

beforeEach(() => {
  signInWithPassword.mockReset()
  updateUser.mockReset()
  identities = [{ provider: 'email' }]
  previewActive = false
  delivery = true
})

describe('changing the password', () => {
  it('will not set a new one without the current one being right', async () => {
    const user = userEvent.setup()
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    await open()

    await user.type(screen.getByLabelText(/current password/i), 'wrong-one')
    await user.type(screen.getByLabelText(/^new password$/i), 'a-good-long-one')
    await user.type(screen.getByLabelText(/new password again/i), 'a-good-long-one')
    await user.click(screen.getByRole('button', { name: /change password/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not your current password/i)
    })
    // The whole point. A form that asks and then does not check is worse than
    // one that does not ask, because it reads as a control.
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses two that do not match before it spends a round trip', async () => {
    const user = userEvent.setup()
    await open()

    await user.type(screen.getByLabelText(/current password/i), 'right-one')
    await user.type(screen.getByLabelText(/^new password$/i), 'a-good-long-one')
    await user.type(screen.getByLabelText(/new password again/i), 'a-good-long-two')
    await user.click(screen.getByRole('button', { name: /change password/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i)
    })
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('sets it once the current one checks out', async () => {
    const user = userEvent.setup()
    signInWithPassword.mockResolvedValue({ error: null })
    updateUser.mockResolvedValue({ error: null })
    await open()

    await user.type(screen.getByLabelText(/current password/i), 'right-one')
    await user.type(screen.getByLabelText(/^new password$/i), 'a-good-long-one')
    await user.type(screen.getByLabelText(/new password again/i), 'a-good-long-one')
    await user.click(screen.getByRole('button', { name: /change password/i }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'a-good-long-one' }))
    expect(await screen.findByText(/changed/i)).toBeInTheDocument()
  })

  it('is not offered to an account that has no password', async () => {
    identities = [{ provider: 'google' }]
    await open()

    // A form asking for a current password somebody has never had is a form
    // that cannot be completed.
    expect(screen.queryByLabelText(/current password/i)).toBeNull()
    expect(screen.getByText(/no password/i)).toBeInTheDocument()
  })
})

describe('changing the address', () => {
  it('says the change has not happened yet', async () => {
    const user = userEvent.setup()
    updateUser.mockResolvedValue({ error: null })
    await open()

    await user.type(screen.getByLabelText(/new email address/i), 'new@example.com')
    await user.click(screen.getByRole('button', { name: /send the confirmation/i }))

    await waitFor(() => expect(updateUser).toHaveBeenCalled())
    // Supabase does not apply the change until the link is followed. "Saved"
    // here would send somebody away believing they can sign in with an address
    // that does not work yet.
    expect(screen.getByRole('status')).toHaveTextContent(/check your inbox/i)
    expect(screen.queryByText(/^saved$/i)).toBeNull()
  })

  it('is not rendered at all while mail is off', async () => {
    delivery = false
    await open()
    // Its entire effect would be a message nobody receives.
    expect(screen.queryByLabelText(/new email address/i)).toBeNull()
  })
})
