import { ReceiptText, Settings } from 'lucide-react'

export type View = 'bill' | 'settings'

const ITEMS = [
  ['bill', 'หารบิล', ReceiptText],
  ['settings', 'ตั้งค่า', Settings],
] as const

export function BottomNav({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <nav className="bottom-nav" aria-label="เมนูหลัก">
      <ul className="mx-auto flex h-14 max-w-xl">
        {ITEMS.map(([key, label, Icon]) => (
          <li key={key} className="flex-1">
            <button
              type="button"
              className={`flex h-full w-full flex-col items-center justify-center text-sm leading-6 ${
                view === key ? 'font-medium' : 'text-primary'
              }`}
              aria-current={view === key ? 'page' : undefined}
              onClick={() => onChange(key)}
            >
              {/* The pill, not just the weight, marks the current page. */}
              <span className={`flex rounded-full px-4 py-0.5 ${view === key ? 'bg-gold text-ink' : ''}`}>
                <Icon aria-hidden size={20} />
              </span>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
