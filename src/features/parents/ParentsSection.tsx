import { useState } from 'react'
import { Check, Copy, Link2, UserMinus, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useCreateInvite, useParentLinks, useRedeemInvite, useRevokeLink,
} from './queries'
import { useAuth } from '@/lib/auth'

export function ParentsSection() {
  const { user } = useAuth()
  const { data: links = [], isLoading } = useParentLinks()
  const createInvite = useCreateInvite()
  const redeem = useRedeemInvite()
  const revoke = useRevokeLink()

  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [entered, setEntered] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setError(null)
    try {
      setCode(await createInvite.mutateAsync())
      setCopied(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't create a code.")
    }
  }

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the code is on screen to type instead.
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      const name = await redeem.mutateAsync(entered)
      setMessage(`Connected to ${name}.`)
      setEntered('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code is not valid.')
    }
  }

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p role="alert"
           className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status"
           className="rounded-lg border px-3 py-2 text-[13px]"
           style={{
             borderColor: 'var(--success-border)',
             background: 'var(--success-subtle)',
             color: 'var(--success)',
           }}>
          {message}
        </p>
      )}

      {links.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No one connected"
          description="Connecting a parent doesn't share anything on its own — you choose what they can see, one thing at a time."
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {links.map((l) => (
            <li key={l.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-text">
                  {l.other_name ?? 'Unnamed'}
                </span>
                <span className="label-caps">
                  {l.parent_id === user?.id ? 'you are their parent' : 'your parent'}
                </span>
              </span>
              <Button variant="ghost" size="sm" loading={revoke.isPending}
                      onClick={() => void revoke.mutateAsync(l.id)}>
                <UserMinus className="h-3.5 w-3.5" aria-hidden /> Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-text">Invite a parent</p>
          <p className="text-[12.5px] leading-relaxed text-text-muted">
            Generate a code and give it to them. It works once and expires in a week.
          </p>
          {code ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-center font-mono text-[18px] tracking-[0.2em] text-text">
                {code}
              </code>
              <Button variant="secondary" size="sm" onClick={() => void copy()}>
                {copied
                  ? <><Check className="h-3.5 w-3.5" aria-hidden /> Copied</>
                  : <><Copy className="h-3.5 w-3.5" aria-hidden /> Copy</>}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" className="self-start"
                    loading={createInvite.isPending} onClick={() => void generate()}>
              <Link2 className="h-4 w-4" aria-hidden /> Create a code
            </Button>
          )}
        </div>

        <form onSubmit={submitCode} className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-text">Have a code?</p>
          <p className="text-[12.5px] leading-relaxed text-text-muted">
            Enter the code your child gave you to connect to their Calenda.
          </p>
          <div className="flex items-center gap-2">
            {/* A plain input rather than the Input component: this field's
                purpose is already stated by the heading above it, so a second
                visible label would be noise -- and an empty one is worse. */}
            <input
              value={entered}
              onChange={(e) => setEntered(e.target.value.toUpperCase())}
              placeholder="ABCD2345"
              maxLength={8}
              aria-label="Invite code from your child"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 font-mono tracking-[0.15em] text-sm text-text placeholder:text-text-subtle hover:border-border-strong"
            />
            <Button type="submit" size="md" loading={redeem.isPending}
                    disabled={entered.trim().length < 8}>
              Connect
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
