import { describe, expect, it } from 'vitest'
import { needsFirstRun } from '@/app/firstRunGate'

/**
 * The gate that sends somebody who has never answered to the first-run screen.
 *
 * This calls the function App.tsx calls. The previous version of this file
 * reproduced the four lines instead, which checks that a copy behaves rather
 * than that the app does -- and the copy would not have caught the hole below,
 * because the copy did not have it.
 *
 * It runs on every protected page for every signed-in person, so the failure
 * that matters is not "it did not ask". It is "it asked and there was no way
 * out".
 */

const ANSWERED = { onboarded_at: '2026-09-08T00:00:00Z' }
const UNANSWERED = { onboarded_at: null }

describe('the first-run gate', () => {
  it('asks somebody who has never answered', () => {
    expect(needsFirstRun({
      session: true, profile: UNANSWERED, profileReady: true, preview: false,
    })).toBe('ask')
  })

  it('lets somebody who has answered straight through', () => {
    expect(needsFirstRun({
      session: true, profile: ANSWERED, profileReady: true, preview: false,
    })).toBe('through')
  })

  it('waits while the profile is still being fetched', () => {
    // The hole this closes: `loading` went false the moment the session
    // resolved, while the profile was still in flight. The gate saw a null
    // profile, fell through, and rendered the dashboard to somebody who had
    // never been asked anything -- and if that fetch was slow or failed, they
    // were never asked at all.
    expect(needsFirstRun({
      session: true, profile: null, profileReady: false, preview: false,
    })).toBe('wait')
  })

  it('lets them through if the profile came back empty, rather than waiting forever', () => {
    // "We looked and found nothing" is an answer. An unreadable row must not
    // lock somebody out of the app when the only way forward is a screen that
    // writes to that row.
    expect(needsFirstRun({
      session: true, profile: null, profileReady: true, preview: false,
    })).toBe('through')
  })

  it('never traps a preview session, which has no profile row to complete', () => {
    expect(needsFirstRun({
      session: false, profile: null, profileReady: true, preview: true,
    })).toBe('through')
    // Even mid-fetch, and even looking unanswered.
    expect(needsFirstRun({
      session: true, profile: UNANSWERED, profileReady: false, preview: true,
    })).toBe('through')
  })

  it('is not the gate that handles a signed-out visitor', () => {
    expect(needsFirstRun({
      session: false, profile: null, profileReady: true, preview: false,
    })).toBe('through')
  })

  it('asks an OAuth account, which is the whole reason it exists', () => {
    // What a Google sign-up actually looks like a moment after the callback:
    // a name from the provider, the default role, and nothing answered.
    const fromGoogle = { onboarded_at: null }
    expect(needsFirstRun({
      session: true, profile: fromGoogle, profileReady: true, preview: false,
    })).toBe('ask')
  })
})
