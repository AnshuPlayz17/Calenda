import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
  error?: string | null
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[13px] font-medium text-text">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-10 rounded-lg border bg-surface px-3 text-sm text-text',
          'placeholder:text-text-subtle',
          'transition-[border-color,box-shadow] duration-150',
          error ? 'border-danger' : 'border-border hover:border-border-strong',
          className,
        )}
        style={{ transitionTimingFunction: 'var(--ease-out)' }}
        {...rest}
      />
      {error ? (
        // Announced to screen readers as it appears, not only on submit.
        <p id={`${inputId}-error`} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-[12.5px] text-text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
