import type { KeyboardEvent } from 'react'

/** A row of tabs with arrow-key movement. Used for steps and for sub-pages. */
export function Tabs<Key extends string>({
  label,
  tabs,
  value,
  panelId,
  onChange,
}: {
  label: string
  tabs: readonly (readonly [Key, string])[]
  value: Key
  panelId: string
  onChange: (key: Key) => void
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    const index = tabs.findIndex(([key]) => key === value)
    const next = (index + step + tabs.length) % tabs.length
    onChange(tabs[next]![0])
    const buttons = event.currentTarget.parentElement!.querySelectorAll('button')
    buttons[next]!.focus()
  }

  return (
    <div className="mb-4 flex border-b border-line" role="tablist" aria-label={label}>
      {tabs.map(([key, text]) => (
        <button
          key={key}
          id={`tab-${key}`}
          type="button"
          role="tab"
          aria-selected={value === key}
          aria-controls={panelId}
          tabIndex={value === key ? 0 : -1}
          className={`min-h-12 flex-1 border-b-4 text-lg ${
            value === key ? 'border-gold font-medium' : 'border-transparent text-primary'
          }`}
          onClick={() => onChange(key)}
          onKeyDown={onKeyDown}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
