import { cn } from '@/lib/cn'

/**
 * The knob is anchored with an explicit left. Without one, an absolutely
 * positioned child falls back to its static position inside the button --
 * which a button centres -- so the knob started 20px in and the translate
 * pushed it clean off the end of the track and out of the row.
 */
export function Switch({
  on, label, disabled, onToggle,
}: {
  on: boolean
  label: string
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200',
        on ? 'bg-brand' : 'bg-surface-3',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      style={{ transitionTimingFunction: 'var(--ease-out)' }}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm',
          'transition-transform duration-200',
          on ? 'translate-x-4' : 'translate-x-0',
        )}
        style={{ transitionTimingFunction: 'var(--ease-out)' }}
      />
    </button>
  )
}
