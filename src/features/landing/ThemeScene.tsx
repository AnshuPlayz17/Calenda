import { motion, useReducedMotion } from 'motion/react'
import { Check, Monitor } from 'lucide-react'
import { Reveal } from '@/components/Reveal'
import { useTheme } from '@/lib/theme'
import { sampleUpcoming } from '@/data/sampleEvents'
import { agendaLabel } from '@/lib/datetime'
import { cn } from '@/lib/cn'

/**
 * The three themes, shown rather than described.
 *
 * A theme is the one product decision a reader can evaluate instantly and
 * cannot evaluate at all from a sentence, so the page shows all three at once,
 * live, and lets them set one from here. Every preview is the real component
 * tree under scoped tokens -- not a picture of it -- which is why the dates
 * inside them are the same dates as the hero.
 *
 * The fourth option has no swatch because it is not a fourth look: matching the
 * computer resolves to one of the first two, and drawing it as a third thing
 * would be a lie about what it does.
 */

const ROWS = sampleUpcoming().slice(0, 3)

const THEMES = [
  { value: 'light' as const, name: 'Light', note: 'The default, and what most people keep.' },
  { value: 'dark' as const, name: 'Dark', note: 'Lightness rather than shadow, so depth survives.' },
  { value: 'vivid' as const, name: 'Vivid', note: 'More colour, still one hue — not a rainbow.' },
]

export function ThemeScene() {
  const { theme, setTheme } = useTheme()
  const reduce = useReducedMotion()

  return (
    <section className="border-y border-border bg-surface px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-[1120px]">
        <Reveal>
          <p className="label-caps">However you read best</p>
          <h2 className="mt-3 max-w-[20ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[40px]">
            Three themes, and the one your computer is already using.
          </h2>
          <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-text-muted">
            Pick one here and the whole site changes — including this page. It is the same
            setting the app uses, and it is remembered.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {THEMES.map((t, i) => (
            <Reveal key={t.value} delay={i * 0.07}>
              <button
                type="button"
                onClick={() => setTheme(t.value)}
                aria-pressed={theme === t.value}
                className={cn(
                  'group block w-full rounded-2xl border p-1.5 text-left transition-all duration-200',
                  theme === t.value
                    ? 'border-brand shadow-md'
                    : 'border-border hover:border-border-strong hover:shadow-sm',
                )}
                style={{ transitionTimingFunction: 'var(--ease-out)' }}
              >
                <motion.span
                  className="block"
                  whileHover={reduce ? undefined : { y: -2 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Preview theme={t.value} />
                </motion.span>

                <span className="flex items-center gap-2 px-2.5 pb-1.5 pt-3">
                  <span className="text-[14px] font-medium text-text">{t.name}</span>
                  {theme === t.value && (
                    <span className="label-caps flex items-center gap-1 text-brand">
                      <Check className="h-3 w-3" aria-hidden />
                      On
                    </span>
                  )}
                </span>
                <span className="block px-2.5 pb-2 text-[12.5px] leading-snug text-text-muted">
                  {t.note}
                </span>
              </button>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.24}>
          <button
            type="button"
            onClick={() => setTheme('system')}
            aria-pressed={theme === 'system'}
            className={cn(
              'mt-5 flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors duration-200',
              theme === 'system'
                ? 'border-brand bg-brand-subtle'
                : 'border-border hover:bg-surface-2',
            )}
          >
            <Monitor
              className={cn('h-4 w-4 shrink-0', theme === 'system' ? 'text-brand' : 'text-text-subtle')}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-text">Match my computer</span>
              <span className="block text-[12.5px] text-text-muted">
                Follows your system setting, and changes with it when it gets dark.
              </span>
            </span>
            {theme === 'system' && (
              <span className="label-caps shrink-0 text-brand">On</span>
            )}
          </button>
        </Reveal>
      </div>
    </section>
  )
}

/** The real thing, under scoped tokens — a screenshot would go stale. */
function Preview({ theme }: { theme: 'light' | 'dark' | 'vivid' }) {
  return (
    <span
      data-preview={theme}
      className="block overflow-hidden rounded-xl border border-border bg-bg"
    >
      <span className="flex items-center gap-1.5 border-b border-border bg-surface px-3 py-2">
        <i className="h-1.5 w-1.5 rounded-full bg-surface-3" />
        <i className="h-1.5 w-1.5 rounded-full bg-surface-3" />
        <span className="ml-1 text-[10px] font-medium text-text-muted">Coming up</span>
      </span>
      <span className="block bg-surface px-2.5 py-2">
        {ROWS.map((e) => (
          <span key={e.title} className="mb-1.5 flex items-center gap-2 rounded-md bg-bg px-2 py-1.5 last:mb-0">
            <i
              className="h-3.5 w-[2px] shrink-0 rounded-full"
              style={{ background: `var(--cat-${e.category})` }}
            />
            <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-text">
              {e.title}
            </span>
            <span className="tabular shrink-0 text-[9.5px] text-text-subtle">
              {agendaLabel(e.startDate)}
            </span>
          </span>
        ))}
        <span className="mt-2 flex items-center gap-1.5">
          <span className="rounded-md bg-brand px-2 py-1 text-[9.5px] font-medium text-brand-contrast">
            Add event
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-[9.5px] text-text-muted">
            Notes
          </span>
        </span>
      </span>
    </span>
  )
}
