import { useState } from 'react'
import { toLocalDate } from './domain/date'
import { BillScreen } from './features/bill/BillScreen'
import { quarantineNotice } from './storage/messages'
import type { AppData } from './storage/parse'
import { createRepository, type KeyValueStore, type SaveResult } from './storage/repository'
import { downloadText } from './ui/download'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { QuarantineBanner } from './ui/QuarantineBanner'
import { RecoveryScreen } from './ui/RecoveryScreen'

/** Reading `localStorage` can itself throw, e.g. when site data is blocked. */
const browserStorage: KeyValueStore = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
}

const repository = createRepository(browserStorage)
const boot = repository.initialize()

if (boot.status === 'ok' && boot.firstRun) {
  // Ask the browser not to clear our data. Missing on plain http.
  void navigator.storage?.persist?.().catch(() => false)
}

function exportRaw() {
  downloadText(repository.exportRaw(), `owlet-raw-${toLocalDate(new Date())}.json`)
}

function reset() {
  repository.reset()
  location.reload()
}

function Ready({ initial }: { initial: Extract<typeof boot, { status: 'ok' }> }) {
  const [data, setData] = useState<AppData>(initial.data)
  const notice = quarantineNotice(initial.quarantine)

  function keep<T>(result: SaveResult<T>): SaveResult<T> {
    if (result.ok) setData(result.data)
    return result
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-3 lg:max-w-5xl">
      {notice && <QuarantineBanner notice={notice} onExport={exportRaw} />}
      <BillScreen
        data={data}
        onSaveBill={(input) => keep(repository.saveBill(input))}
        onAddPerson={(name) => keep(repository.addPerson(name))}
      />
    </main>
  )
}

export default function App() {
  if (boot.status !== 'ok') {
    return <RecoveryScreen reason={boot.status} onExport={exportRaw} onReset={reset} />
  }
  return (
    <ErrorBoundary fallback={<RecoveryScreen reason="crash" onExport={exportRaw} onReset={reset} />}>
      <Ready initial={boot} />
    </ErrorBoundary>
  )
}
