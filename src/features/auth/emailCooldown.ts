import { useCallback, useEffect, useState } from 'react'

/**
 * How long before the same address may ask for another email.
 *
 * BE CLEAR ABOUT WHAT THIS IS AND IS NOT.
 *
 * This is not a security control and must never be described as one. It lives
 * in localStorage, so clearing site data, a private window or a second browser
 * all defeat it in seconds. Anybody who wants to send a thousand requests can.
 *
 * What it is for is the honest case, which is much the more common one: a
 * person who did not see the email, presses the button again, still does not
 * see it, presses it again. That reader deserves a countdown telling them one
 * is already on the way -- not three wasted sends and then a wall of
 * "For security purposes, you can only request this after 47 seconds", which
 * is Supabase's wording and reads like an accusation.
 *
 * THE REAL LIMITS ARE ELSEWHERE, AND THERE ARE THREE OF THEM
 *
 *   1. Supabase enforces its own minimum gap between emails to one address,
 *      server-side. That is the one that cannot be bypassed, and it is why the
 *      error above exists at all.
 *   2. Supabase's project-wide "Emails per hour" (Authentication -> Rate
 *      Limits) caps everything. Whatever it is set to, N, the most that can
 *      leave in a day is 24N.
 *   3. Brevo's free plan allows 300 emails a day.
 *
 * Those interact in a way worth writing down: to make it arithmetically
 * impossible to exhaust the daily quota, N must be 12 or lower, because
 * 24 x 12 = 288. At 30/hour a determined stranger could burn 720 in a day,
 * and the failure lands on the wrong person -- the quota is gone and a real
 * user cannot reset their password.
 *
 * For one user and a few testers, 12 an hour is far more than anyone needs and
 * removes the failure mode entirely. That is the setting to keep.
 */
export const COOLDOWN_SECONDS = 60

const KEY = 'calenda.email.lastSent'

/** Addresses differ only by case and spacing as far as a mail server cares. */
function normalise(address: string) {
  return address.trim().toLowerCase()
}

type Sent = Record<string, number>

function read(): Sent {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Sent) : {}
  } catch {
    // A private window, a browser with storage blocked, or a corrupt value.
    // The cooldown is a courtesy; losing it is not worth failing a sign-in over.
    return {}
  }
}

function write(next: Sent) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* Same reasoning. */
  }
}

/**
 * Seconds still to wait before this address may ask again, and a way to record
 * that it just did.
 *
 * Keyed by address rather than held as one global timer, so a shared computer
 * does not make one person's request block the next person's.
 */
export function useEmailCooldown(address: string) {
  const key = normalise(address)

  // Both of these are state rather than a read during render, and that is the
  // fix for a real bug the tests caught. `record()` used to write to storage
  // and then call setNow(Date.now()) -- which, on the same tick, is the value
  // React already had. React compares and skips the re-render, so nothing
  // recomputed, and the button stayed live immediately after a send. Storage
  // is where this survives a reload; state is what the render reads.
  const [sentAt, setSentAt] = useState(() => read()[key] ?? 0)
  const [now, setNow] = useState(() => Date.now())

  // The address is a text field, so it changes under this hook as it is typed.
  useEffect(() => {
    setSentAt(read()[key] ?? 0)
    setNow(Date.now())
  }, [key])

  const remaining = Math.max(0, Math.ceil((sentAt + COOLDOWN_SECONDS * 1000 - now) / 1000))

  // Only ticking while there is something to count down, so an idle form is
  // not running a timer for no reason.
  useEffect(() => {
    if (remaining <= 0) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [remaining])

  const record = useCallback(() => {
    const at = Date.now()
    const next = read()
    next[key] = at

    // Old entries would otherwise accumulate for every address ever typed on
    // this machine. Anything past its cooldown can no longer affect anything.
    const cutoff = at - COOLDOWN_SECONDS * 1000
    for (const [k, t] of Object.entries(next)) {
      if (t < cutoff && k !== key) delete next[k]
    }

    write(next)
    setSentAt(at)
    setNow(at)
  }, [key])

  return { remaining, record }
}
