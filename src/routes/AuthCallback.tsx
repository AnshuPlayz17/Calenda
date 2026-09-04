import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/Button'

/**
 * Where OAuth and magic links land. supabase-js consumes the code from the URL
 * on load, so this waits for the session rather than parsing anything itself.
 */
export function AuthCallback() {
  const { session, loading } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000)
    return () => clearTimeout(t)
  }, [])

  if (session) return <Navigate to="/" replace />

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="flex max-w-[34ch] flex-col items-center gap-4 text-center">
        <Brand size="md" />
        {!timedOut || loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden />
            <p className="text-sm text-text-muted" role="status">Signing you in…</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-text">We couldn't finish signing you in.</p>
            <p className="text-[13px] leading-relaxed text-text-muted">
              The link may have expired or already been used. Try signing in again.
            </p>
            <Button onClick={() => { window.location.hash = '#/sign-in' }}>
              Back to sign in
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
