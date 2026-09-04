import { Monitor, Moon, Palette, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import type { Theme } from '@/lib/theme'
import { cn } from '@/lib/cn'

const options: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'vivid', label: 'Vivid', Icon: Palette },
  { value: 'system', label: 'Match my computer', Icon: Monitor },
]

/**
 * Four options, because "match my computer" is a real choice and not the
 * absence of one. Rendered as a radiogroup so arrow keys move between them.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
    >
      {options.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-md transition-colors duration-150',
              active
                ? 'bg-surface text-text shadow-xs'
                : 'text-text-subtle hover:text-text-muted',
            )}
            style={{ transitionTimingFunction: 'var(--ease-out)' }}
          >
            <Icon className="h-[15px] w-[15px]" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
