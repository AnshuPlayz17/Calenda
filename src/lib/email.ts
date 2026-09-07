/**
 * Whether Calenda can actually send an email.
 *
 * Everything that recovers an account goes through an inbox -- a magic link, a
 * password reset, a confirmation. None of it is worth putting on a page unless
 * a message genuinely arrives, and right now none has been verified to. Supabase
 * ships a built-in sender for auth mail, but it is rate limited to a couple of
 * messages an hour on the free tier and mail from its shared domain lands in
 * spam often enough that "we sent you a link" is a claim rather than a fact.
 *
 * So this is off, and while it is off the UI does not offer any of it. That is
 * the same rule the SMS adapter follows: the code path is complete and dormant,
 * and nothing on screen says it works. A "Forgot password?" link that leads to
 * a screen saying "check your inbox" when nothing was ever delivered is worse
 * than no link, because it sends someone away from the sign-in page to wait for
 * something that is not coming.
 *
 * ---------------------------------------------------------------------------
 * To turn it on
 *
 * 1. In the Supabase dashboard, Authentication -> Emails, either accept the
 *    built-in sender or add SMTP credentials under "Custom SMTP". Free options
 *    that work: Resend (3,000/month) and Brevo (300/day). Both need a domain
 *    you can add DNS records to.
 * 2. Authentication -> URL Configuration: add the site URL and the redirect URL
 *    `<site>/#/reset-password` to the allow list. The hash matters -- this app
 *    is hash-routed, and a redirect without it lands on the landing page with
 *    the recovery token attached to the wrong route.
 * 3. Send yourself a reset from the live site and confirm it arrives, in the
 *    inbox rather than in spam.
 * 4. Only then flip this to `true`.
 *
 * Step 3 is not optional. It is the entire reason this flag exists.
 * ---------------------------------------------------------------------------
 */
export const emailDelivery = false

/**
 * What to tell someone who cannot get in, given the above.
 *
 * Kept here next to the flag so the message and the reason for it cannot drift
 * apart, and so there is exactly one sentence to change when it goes live.
 */
export const NO_RECOVERY_NOTE
  = 'Password recovery by email is not switched on yet. If you signed up with '
  + 'Google, GitHub or Discord, use that button instead — it works whether or '
  + 'not you remember a password.'
