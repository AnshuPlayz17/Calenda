import type { ReactNode } from 'react'
import type { Provider } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { ProviderIcon } from '@/components/ProviderIcon'
import { enabledProviders } from '@/lib/providers'
import { isConfigured } from '@/lib/env'
import { usePreview } from '@/lib/preview'

/**
 * The pieces sign-in, sign-up and the reset pages all had their own copy of.
 *
 * Three pages had three separately written provider lists, three error boxes
 * and three "not connected" cards, which is how the same control ends up with
 * three paddings and two different words for the same thing.
 */

/** Whatever went wrong, in the one place a reader is already looking. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="mt-5 rounded-lg border border-danger-border bg-danger-subtle px-3.5 py-2.5 text-[13px] text-danger"
    >
      {message}
    </p>
  )
}

/**
 * Sign in with an account you already have.
 *
 * Only providers with credentials actually configured in Supabase are
 * rendered -- see `lib/providers.ts`. A provider that is listed but not set up
 * fails with an opaque error the moment it is clicked.
 */
export function ProviderButtons({
  verb, busy, onPick,
}: {
  /** "Continue with" when signing in, "Sign up with" when creating. */
  verb: string
  busy: string | null
  onPick: (p: Provider) => void
}) {
  return (
    <>
      {enabledProviders.map((p) => (
        <Button
          key={p.id}
          variant="secondary"
          size="lg"
          fullWidth
          loading={busy === p.id}
          onClick={() => void onPick(p.id)}
          className="justify-start"
        >
          <ProviderIcon provider={p.id} />
          <span className="ml-1">{verb} {p.label}</span>
        </Button>
      ))}
    </>
  )
}

/** A rule with a word in it. */
export function Separator({ children }: { children: ReactNode }) {
  return (
    <div className="my-2 flex items-center gap-3">
      <hr className="flex-1 border-border" />
      <span className="label-caps">{children}</span>
      <hr className="flex-1 border-border" />
    </div>
  )
}

/**
 * The development-only state, at the bottom rather than the top.
 *
 * It used to be the first thing on both pages, above the buttons somebody came
 * to press. It only ever appears when there is no Supabase project configured,
 * which is a local-development condition and never true for a visitor to the
 * real site -- so it was taking the best slot on the page to explain something
 * to the one person who already knows it. Same words, last position.
 */
export function NotConnected({ children }: { children: ReactNode }) {
  const preview = usePreview()
  if (isConfigured) return null

  return (
    // Marked so the harness can tell it apart from the page. It renders only
    // when there is no Supabase project configured, which is a local condition
    // and never true for a visitor -- verified by building with credentials,
    // where it is absent entirely. Measuring it in the fold check was measuring
    // a screen nobody is ever shown.
    <div data-dev-only className="mt-8 rounded-xl border border-border bg-surface p-4">
      <p className="text-[13.5px] font-medium text-text">Not connected yet</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{children}</p>
      <Button size="sm" className="mt-3" onClick={preview.enter}>
        Explore the preview
      </Button>
    </div>
  )
}
