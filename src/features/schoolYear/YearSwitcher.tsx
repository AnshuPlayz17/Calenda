import { useSchoolYear } from './SchoolYearProvider'

/**
 * The school year, where you can see it.
 *
 * Every calendar, class and assignment query is scoped by this, so a year you
 * cannot see is a year you cannot account for: classes simply appear to be
 * missing. It used to live only on the Settings page, which meant an
 * unexpected year looked like lost data rather than a filter.
 */
export function YearSwitcher() {
  const { years, current, setCurrent } = useSchoolYear()

  // One year is not a choice, but it is still worth stating which one you are
  // looking at.
  if (years.length <= 1) {
    return current ? (
      <p className="px-2 text-[12px] text-text-subtle">
        <span className="label-caps">School year</span>
        <span className="mt-0.5 block text-[13px] text-text-muted">{current.label}</span>
      </p>
    ) : null
  }

  return (
    <label className="block px-2">
      <span className="label-caps">School year</span>
      <select
        value={current?.id ?? ''}
        onChange={(e) => setCurrent(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-text
                   transition-colors duration-150 hover:bg-surface-2
                   focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
      >
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            {y.label}{y.is_current ? ' (current)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
