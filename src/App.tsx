import { useState } from 'react'
import { toLocalDate } from './domain/date'
import type { Bill } from './domain/types'
import { BillScreen } from './features/bill/BillScreen'
import { emptyForm } from './features/bill/billForm'
import {
  afterDelete,
  afterSave,
  changeForm,
  currentForm,
  hasUnsavedChanges,
  needsDiscard,
  newWorkspace,
  startEdit,
  stopEdit,
} from './features/bill/workspace'
import { SettingsScreen, type SettingsTab } from './features/settings/SettingsScreen'
import { newId } from './storage/ids'
import { quarantineNotice } from './storage/messages'
import type { AppData } from './storage/parse'
import { createRepository, type KeyValueStore, type SaveResult } from './storage/repository'
import { BottomNav, type View } from './ui/BottomNav'
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

const today = () => toLocalDate(new Date())

function Ready({ initial }: { initial: Extract<typeof boot, { status: 'ok' }> }) {
  const [data, setData] = useState<AppData>(initial.data)
  const [workspace, setWorkspace] = useState(() => newWorkspace(today(), newId('i')))
  const [view, setView] = useState<View>('bill')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('history')
  const [notice, setNotice] = useState<string | null>(null)
  const banner = quarantineNotice(initial.quarantine)
  const form = currentForm(workspace)
  const editing = workspace.edit
    ? { id: workspace.edit.form.id!, title: workspace.edit.original.title || 'บิลไม่มีชื่อ' }
    : null

  function keep<T>(result: SaveResult<T>): SaveResult<T> {
    if (result.ok) setData(result.data)
    return result
  }

  function show(next: View) {
    setView(next)
    setNotice(null)
    window.scrollTo({ top: 0 })
  }

  function backToHistory(message: string | null) {
    show('settings')
    setSettingsTab('history')
    setNotice(message)
  }

  function onSaved(bill: Bill) {
    const wasEdit = workspace.edit !== null
    setWorkspace(afterSave(workspace, emptyForm(today(), newId('i'))))
    if (wasEdit) backToHistory(`บันทึกการแก้ ${bill.title || 'บิล'} แล้ว`)
    else window.scrollTo({ top: 0 })
  }

  return (
    <div className="pb-(--nav-h)">
      <main className="mx-auto flex min-h-[calc(100dvh-var(--nav-h))] w-full max-w-xl flex-col px-4 pt-3 lg:max-w-5xl">
        {banner && <QuarantineBanner notice={banner} onExport={exportRaw} />}

        {/* Both stay mounted, so switching pages keeps what's half typed. */}
        <div className="flex flex-1 flex-col" hidden={view !== 'bill'}>
          <BillScreen
            key={form.id ?? 'new'}
            data={data}
            form={form}
            onChange={(next) => setWorkspace((ws) => changeForm(ws, next))}
            editing={
              editing && {
                title: editing.title,
                changed: hasUnsavedChanges(workspace),
                onStop: () => {
                  setWorkspace(stopEdit(workspace))
                  backToHistory(null)
                },
              }
            }
            onSaveBill={(input) => keep(repository.saveBill(input))}
            onSaved={onSaved}
            onAddPerson={(name) => keep(repository.addPerson(name))}
          />
        </div>
        <div hidden={view !== 'settings'}>
          <SettingsScreen
            data={data}
            tab={settingsTab}
            onTab={(tab) => {
              setSettingsTab(tab)
              setNotice(null)
            }}
            notice={notice}
            onDismissNotice={() => setNotice(null)}
            onRename={(id, name) => keep(repository.renamePerson(id, name))}
            editing={editing}
            needsDiscard={(billId) => needsDiscard(workspace, billId)}
            onEdit={(bill) => {
              setWorkspace(startEdit(workspace, bill, newId('i')))
              show('bill')
            }}
            onDelete={(bill) => {
              const result = keep(repository.deleteEntry(bill.id))
              if (!result.ok) return false
              setWorkspace(afterDelete(workspace, bill.id))
              setNotice(`ลบบิล ${bill.title || 'ไม่มีชื่อ'} แล้ว`)
              // The row is gone: send focus somewhere that still exists.
              requestAnimationFrame(() => document.getElementById('tab-history')?.focus())
              return true
            }}
            onGoToBill={() => show('bill')}
          />
        </div>
      </main>
      <BottomNav view={view} onChange={show} />
    </div>
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
