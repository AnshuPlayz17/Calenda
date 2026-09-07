import { describe, expect, it } from 'vitest'
import { readRecoveryCredentials, withoutCredentials } from '@/features/auth/recoveryToken'

/**
 * The shapes a recovery link can arrive in.
 *
 * This exists because the question could not be settled by testing against the
 * live site: the route did not exist in the deployed build, so the link fell
 * through to the catch-all and the redirect to /sign-in discarded the query
 * string and the hash before anything could read them. Rather than guess which
 * shape Supabase uses, the code reads all of them -- and these are the cases
 * that says so.
 */

const SITE = 'https://example.github.io/Calenda/'

describe('reading a recovery token out of the address bar', () => {
  it('finds a PKCE code in a normal query string', () => {
    expect(readRecoveryCredentials(`${SITE}?code=abc123#/reset-password`))
      .toEqual({ kind: 'code', code: 'abc123' })
  })

  it('finds a PKCE code appended inside the hash, where supabase-js does not look', () => {
    expect(readRecoveryCredentials(`${SITE}#/reset-password?code=abc123`))
      .toEqual({ kind: 'code', code: 'abc123' })
  })

  it('finds implicit tokens in a second fragment', () => {
    expect(readRecoveryCredentials(
      `${SITE}#/reset-password#access_token=at1&refresh_token=rt1&type=recovery`,
    )).toEqual({ kind: 'tokens', accessToken: 'at1', refreshToken: 'rt1' })
  })

  it('finds implicit tokens in the only fragment', () => {
    expect(readRecoveryCredentials(`${SITE}#access_token=at1&refresh_token=rt1`))
      .toEqual({ kind: 'tokens', accessToken: 'at1', refreshToken: 'rt1' })
  })

  it('reports a refusal, which arrives looking much like a valid link', () => {
    expect(readRecoveryCredentials(
      `${SITE}#/reset-password?error=access_denied&error_description=Email+link+is+invalid`,
    )).toEqual({ kind: 'error', message: 'Email link is invalid' })
  })

  it('prefers the error to any credential beside it', () => {
    expect(readRecoveryCredentials(`${SITE}#/reset-password?error=expired&code=abc`))
      .toEqual({ kind: 'error', message: 'expired' })
  })

  it('finds nothing in a plain address, so a hand-typed URL is not mistaken for a link', () => {
    expect(readRecoveryCredentials(`${SITE}#/reset-password`)).toBeNull()
    expect(readRecoveryCredentials(SITE)).toBeNull()
  })

  it('ignores an access token with no refresh token, which cannot make a session', () => {
    expect(readRecoveryCredentials(`${SITE}#access_token=at1`)).toBeNull()
  })
})

describe('clearing the token out of the address bar', () => {
  it('strips a query string and every fragment', () => {
    expect(withoutCredentials(`${SITE}?code=abc#/reset-password`, '/reset-password'))
      .toBe(`${SITE}#/reset-password`)
    expect(withoutCredentials(`${SITE}#/reset-password?code=abc`, '/reset-password'))
      .toBe(`${SITE}#/reset-password`)
    expect(withoutCredentials(
      `${SITE}#/reset-password#access_token=at1&refresh_token=rt1`, '/reset-password',
    )).toBe(`${SITE}#/reset-password`)
  })

  it('leaves an already-clean address alone', () => {
    expect(withoutCredentials(`${SITE}#/reset-password`, '/reset-password'))
      .toBe(`${SITE}#/reset-password`)
  })
})
