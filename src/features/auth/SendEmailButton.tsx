import { Button } from '@/components/ui/Button'
import { useEmailCooldown } from './emailCooldown'

/**
 * A button that sends an email, and says so when it will not.
 *
 * Every place in the app that asks a mail server to do something shares this,
 * because the failure it prevents is the same everywhere: somebody who did not
 * see the message pressing the button again, and again, and being told off by
 * the server on the third try.
 *
 * Disabled is the wrong shape on its own -- a button that stops working with
 * no explanation reads as broken. It stays pressable-looking and states the
 * count, so the answer to "why isn't this doing anything" is on the button
 * itself.
 */
export function SendEmailButton({
  address, busy, label,
}: {
  /** Cooldowns are per address, so one person does not block the next. */
  address: string
  busy: boolean
  /** What the button says when it is ready. */
  label: string
}) {
  const { remaining } = useEmailCooldown(address)
  const waiting = remaining > 0

  return (
    <>
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={waiting}>
        {waiting ? `Wait ${remaining}s` : label}
      </Button>
      {waiting && (
        <p className="-mt-1 text-center text-[12.5px] leading-relaxed text-text-subtle" role="status">
          One is already on its way. Check your spam folder before asking again.
        </p>
      )}
    </>
  )
}
