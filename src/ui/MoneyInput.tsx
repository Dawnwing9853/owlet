import { TriangleAlert } from 'lucide-react'
import { useState, type InputHTMLAttributes } from 'react'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  id: string
  /** Exactly what was typed. It is never rewritten or cleared for the owner. */
  value: string
  onChange: (value: string) => void
  /** Why the value can't be used, or null. Shown once the field is left. */
  error: string | null
  /** Show the error even before the field is left, e.g. after pressing save. */
  showError?: boolean
}

export function MoneyInput({ id, value, onChange, error, showError, onBlur, className, ...rest }: Props) {
  const [left, setLeft] = useState(false)
  const visible = error !== null && (left || showError === true)
  const errorId = `${id}-error`

  return (
    <>
      <input
        {...rest}
        id={id}
        className={`field money text-right ${className ?? ''}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={visible}
        aria-describedby={visible ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => {
          setLeft(true)
          onBlur?.(event)
        }}
      />
      {visible && (
        // basis-full puts the message on its own line under a row of fields.
        <p id={errorId} className="attention basis-full justify-end text-sm">
          <TriangleAlert aria-hidden size={16} />
          <span>{error}</span>
        </p>
      )}
    </>
  )
}
