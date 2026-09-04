import { cn } from '@/lib/cn'

/**
 * A sheen rather than a pulse -- calmer when several are on screen at once.
 * The sheen is suppressed under prefers-reduced-motion by the global rule.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('skeleton', className)} aria-hidden>
      <div
        className="absolute inset-0 -translate-x-full"
        style={{
          animation: 'calenda-shimmer 1.6s infinite',
          background:
            'linear-gradient(90deg, transparent, color-mix(in oklab, var(--surface-3) 70%, transparent), transparent)',
        }}
      />
    </div>
  )
}
