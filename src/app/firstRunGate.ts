import type { Profile } from '@/lib/auth'

/**
 * Whether this person still has to answer the questions sign-up asks.
 *
 * Its own file so the test can call the thing that ships. It used to be four
 * lines inside RequireAuth and the test reproduced them, which checks that a
 * copy behaves rather than that the app does -- and a copy is exactly what goes
 * stale when somebody edits one of the two.
 *
 * WHO THIS IS FOR
 *
 * Anybody who arrived through Google, GitHub or Discord. They press one button
 * and are signed in, so they never see the sign-up form and nothing ever asked
 * whether they are a student or a parent -- and they are most of the accounts.
 * `handle_new_user()` copies a name out of the provider's metadata, so that
 * much arrives. Nothing else does.
 *
 * EVERY CONDITION HERE EXISTS TO STOP SOMEBODY BEING TRAPPED
 *
 * This runs on every protected page for every signed-in person, so the failure
 * that matters is not "it did not ask" -- it is "it asked and there was no way
 * out". In order:
 *
 *   - No session: not this gate's business. Somewhere else sends them to
 *     sign-in.
 *   - Preview: sample data with no profile row behind it, so a first-run screen
 *     could never be completed and the session would be stuck on it.
 *   - `profileReady` false: the fetch has not finished. Redirecting on a value
 *     that is merely not here yet would fire mid-sign-in, on every load.
 *   - `profile` null *after* the fetch finished: the row cannot be read. Let
 *     them through; an unreadable row must not lock somebody out of the app
 *     while a screen that writes to that row is the only way forward.
 *
 * The last two used to be one check on `profile` being truthy, which could not
 * tell those two cases apart. `loading` went false the moment the session
 * resolved while the profile was still in flight, so the gate saw null, fell
 * through, and rendered the dashboard to somebody who had never been asked.
 * They were asked a moment later when the profile landed -- unless it was slow,
 * or failed, in which case they never were.
 */
export function needsFirstRun({ session, profile, profileReady, preview }: {
  session: boolean
  profile: Pick<Profile, 'onboarded_at'> | null
  profileReady: boolean
  preview: boolean
}): 'wait' | 'ask' | 'through' {
  if (!session || preview) return 'through'
  if (!profileReady) return 'wait'
  if (profile && !profile.onboarded_at) return 'ask'
  return 'through'
}
